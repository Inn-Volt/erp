-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 14: avisos al celular robustos (iPhone, Android y computador)
--   · Se configuran desde el ERP: Configuración → Avisos al celular → «Configurar». El
--     servidor genera las claves de los avisos (VAPID) y la clave compartida, y las guarda
--     aquí (push_config). Ya no hace falta poner variables en Netlify ni completar SQL a mano
--     (si están en Netlify, se siguen usando).
--   · Cada aviso de la campana guarda si llegó a los equipos de la persona (push_estado). Si
--     el envío falla o el servidor no responde, la base lo reintenta sola cada minuto (pg_cron,
--     hasta 4 intentos en 6 horas). Un aviso que ya se leyó en la app no se reintenta.
--   · Cada equipo guarda cuándo recibió el último aviso y sus fallos (se ven en Configuración).
--   · Aviso nuevo: al responsable de una cotización cuando se la asignan.
-- Ejecutar DESPUÉS de las fases anteriores (en especial la 6). Es idempotente y no borra datos.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Configuración del envío (solo la leen la base y el servidor) ─────────
INSERT INTO public.push_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.push_config ADD COLUMN IF NOT EXISTS vapid_publica  TEXT;
ALTER TABLE public.push_config ADD COLUMN IF NOT EXISTS vapid_privada  TEXT;
ALTER TABLE public.push_config ADD COLUMN IF NOT EXISTS actualizado_at TIMESTAMPTZ;
REVOKE ALL ON public.push_config FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.push_config TO service_role;

-- ─── 2. Si cada aviso llegó al celular ───────────────────────────────────────
--   push_estado: NULL (de antes) · enviando · enviado · sin_equipos · sin_config · leida · error
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_estado    TEXT;
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_intentos  SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_ultimo_at TIMESTAMPTZ;
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_detalle   TEXT;
CREATE INDEX IF NOT EXISTS idx_notificaciones_push_pendiente ON public.notificaciones(push_ultimo_at)
  WHERE push_estado IN ('enviando', 'error');
GRANT SELECT, UPDATE ON public.notificaciones TO service_role;

-- ─── 3. Salud de cada equipo ─────────────────────────────────────────────────
ALTER TABLE public.push_suscripciones ADD COLUMN IF NOT EXISTS ultimo_ok_at TIMESTAMPTZ;
ALTER TABLE public.push_suscripciones ADD COLUMN IF NOT EXISTS fallos       INT NOT NULL DEFAULT 0;
ALTER TABLE public.push_suscripciones ADD COLUMN IF NOT EXISTS ultimo_error TEXT;

-- Al volver a registrar un equipo, parte de cero.
CREATE OR REPLACE FUNCTION public.push_registrar(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_dispositivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.' USING ERRCODE = '42501'; END IF;
  IF p_endpoint !~ '^https://' OR length(p_endpoint) > 1000 THEN RAISE EXCEPTION 'Suscripción inválida.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.push_suscripciones (usuario_id, endpoint, p256dh, auth, dispositivo)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 80))
  ON CONFLICT (endpoint) DO UPDATE SET usuario_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                                       dispositivo = EXCLUDED.dispositivo, updated_at = NOW(),
                                       fallos = 0, ultimo_error = NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.push_registrar(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_registrar(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 4. Pedirle al servidor que mande un aviso ───────────────────────────────
-- Solo se manda el id: el servidor lee el aviso (no se le puede pasar un texto cualquiera).
CREATE OR REPLACE FUNCTION public.push_enviar(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.push_config;
BEGIN
  SELECT * INTO c FROM public.push_config WHERE id;
  IF COALESCE(c.url, '') = '' OR COALESCE(c.secreto, '') = '' THEN
    UPDATE public.notificaciones SET push_estado = 'sin_config' WHERE id = p_id;
    RETURN;
  END IF;
  UPDATE public.notificaciones
     SET push_estado = 'enviando', push_intentos = push_intentos + 1, push_ultimo_at = NOW()
   WHERE id = p_id;
  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 20000)'
      USING c.url, jsonb_build_object('notificacion_id', p_id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secreto', c.secreto);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.notificaciones SET push_estado = 'error', push_detalle = left('Base: ' || SQLERRM, 300) WHERE id = p_id;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public.push_enviar(UUID) FROM PUBLIC, anon, authenticated;

-- Cada aviso nuevo va también a los equipos de su destinatario. Si algo falla, el aviso igual
-- queda en la campana: nunca se pierde ni traba lo que lo generó.
CREATE OR REPLACE FUNCTION public.push_al_notificar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.push_suscripciones WHERE usuario_id = NEW.usuario_id) THEN
      UPDATE public.notificaciones SET push_estado = 'sin_equipos' WHERE id = NEW.id;
    ELSE
      PERFORM public.push_enviar(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Aviso al celular no enviado: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_push_al_notificar ON public.notificaciones;
CREATE TRIGGER trg_push_al_notificar AFTER INSERT ON public.notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.push_al_notificar();

-- ─── 5. Reintentos ───────────────────────────────────────────────────────────
-- Los que fallaron o quedaron sin respuesta: de nuevo a los 2, 4 y 6 minutos (hasta 4 intentos,
-- dentro de 6 horas). Los que agotan los intentos quedan como error, para verlos en Configuración.
CREATE OR REPLACE FUNCTION public.push_reintentar()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT id FROM public.notificaciones
            WHERE push_estado IN ('enviando', 'error') AND push_intentos < 4 AND leida_at IS NULL
              AND created_at > NOW() - INTERVAL '6 hours'
              AND push_ultimo_at < NOW() - make_interval(mins => 2 * push_intentos)
            ORDER BY created_at LIMIT 50 LOOP
    PERFORM public.push_enviar(r.id);
    n := n + 1;
  END LOOP;
  UPDATE public.notificaciones
     SET push_estado = 'error', push_detalle = COALESCE(push_detalle, 'El servidor no respondió.')
   WHERE push_estado = 'enviando' AND push_intentos >= 4 AND push_ultimo_at < NOW() - INTERVAL '10 minutes';
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.push_reintentar() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net no está disponible (%): actívalo en Supabase → Database → Extensions.', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'innvolt-push-reintentos';
  PERFORM cron.schedule('innvolt-push-reintentos', '* * * * *', 'SELECT public.push_reintentar()');
  RAISE NOTICE 'Reintentos de avisos al celular programados cada minuto.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no está disponible (%): actívalo en Supabase → Database → Extensions y vuelve a correr este archivo.', SQLERRM;
END $$;

-- ─── 6. Diagnóstico (lo lee el servidor para Configuración → Avisos al celular) ─
CREATE OR REPLACE FUNCTION public.push_diagnostico()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job BOOLEAN := FALSE;
BEGIN
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = ''innvolt-push-reintentos'' AND active)' INTO v_job;
  EXCEPTION WHEN OTHERS THEN v_job := FALSE;
  END;
  RETURN jsonb_build_object(
    'fase14', TRUE,
    'pg_net', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'),
    'pg_cron', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'),
    'reintentos', v_job,
    'disparador', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_push_al_notificar' AND NOT tgisinternal));
END $$;
REVOKE EXECUTE ON FUNCTION public.push_diagnostico() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_diagnostico() TO service_role;

-- ─── 7. Aviso: te asignaron una cotización ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.aviso_cotizacion_responsable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.vendedor_id IS NOT NULL AND NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    PERFORM public.notificar_usuario(NEW.vendedor_id, 'cotizacion_asignada',
      'Te asignaron la cotización IV-' || lpad(NEW.folio::TEXT, 4, '0'),
      NULLIF(trim(COALESCE(NEW.titulo, '')), ''), '/cotizador?edit=' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_cotizacion_responsable ON public.cotizaciones;
CREATE TRIGGER trg_aviso_cotizacion_responsable AFTER UPDATE OF vendedor_id ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.aviso_cotizacion_responsable();
