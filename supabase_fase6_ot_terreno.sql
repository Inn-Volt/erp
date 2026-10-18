-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 6: la OT de terreno, como el ticket de TecApp
--   · La visita técnica es una OT (reemplaza al levantamiento): el técnico recibe el
--     aviso en el celular, hace el informe de visita y desde la OT se cotiza. Al
--     aprobarse, la cotización sigue en esa misma OT (no nace otra).
--   · Avisos al celular (Web Push): cada aviso de la campana se manda también a los
--     teléfonos y computadores que la persona activó, aunque la app esté cerrada.
--   · Rendiciones sin aprobar ni rechazar: cada gasto se rinde en una OT y queda
--     «rendido»; quien paga marca «reembolsado». La OT suma su costo real.
--   · Resultado de cada OT: venta, costo cotizado, materiales y gastos.
-- Ejecutar DESPUÉS de las fases 1 a 5. Es idempotente.
--
-- Para los avisos al celular, al final (sección 7) hay que poner la dirección del ERP y la
-- clave secreta que también va en Netlify (PUSH_SECRET). Sin eso, todo lo demás funciona.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. La cotización nace de una OT y sigue en ella ─────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS ot_id UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cot_ot ON public.cotizaciones(ot_id);

CREATE OR REPLACE FUNCTION public.ot_desde_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dir TEXT; v_id UUID; v_folio INT; v_ot public.ordenes_trabajo;
        v_iv TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0');
BEGIN
  IF NEW.estado = 'Aprobada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'Aprobada') THEN
    IF NEW.ot_id IS NOT NULL THEN
      SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = NEW.ot_id;
    END IF;
    IF v_ot.id IS NOT NULL AND v_ot.estado NOT IN ('cerrada','anulada') THEN
      -- Cotizada desde una OT que sigue abierta: el trabajo continúa en ella. Si la visita ya
      -- estaba ejecutada, vuelve a «por coordinar» para programar la ejecución.
      UPDATE public.ordenes_trabajo
         SET cotizacion_id = COALESCE(cotizacion_id, NEW.id),
             estado = CASE WHEN estado = 'ejecutada' THEN 'por_coordinar' ELSE estado END
       WHERE id = v_ot.id;
      PERFORM public._ot_bitacora(v_ot.id, 'Cotización ' || v_iv || ' aprobada: el trabajo sigue en esta OT');
      PERFORM public.notificar('ot.crear', 'ot_cotizacion_aprobada', v_iv || ' aprobada',
        'Sigue en la OT-' || lpad(v_ot.folio::TEXT, 4, '0') || ': falta coordinar la ejecución.', '/ordenes/' || v_ot.id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE cotizacion_id = NEW.id) THEN
      SELECT COALESCE(s.direccion || COALESCE(', ' || s.comuna, ''), cl.direccion) INTO v_dir
        FROM public.clientes cl LEFT JOIN public.cliente_sucursales s ON s.id = NEW.sucursal_id
       WHERE cl.id = NEW.cliente_id;
      INSERT INTO public.ordenes_trabajo (cotizacion_id, cliente_id, solicitud_id, sucursal_id, titulo, descripcion, direccion, creado_por)
      VALUES (NEW.id, NEW.cliente_id, NEW.solicitud_id, NEW.sucursal_id,
              v_iv || ' · ' || left(COALESCE(NEW.titulo, 'Cotización'), 120),
              NEW.descripcion_general, v_dir, COALESCE(NEW.vendedor_id, auth.uid()))
      RETURNING id, folio INTO v_id, v_folio;
      PERFORM public.notificar('ot.ver', 'ot_nueva', 'Nueva OT-' || lpad(v_folio::TEXT, 4, '0'),
        'Nació de la cotización ' || v_iv || ' aprobada. Falta coordinarla.', '/ordenes/' || v_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ot_desde_cotizacion ON public.cotizaciones;
CREATE TRIGGER trg_ot_desde_cotizacion AFTER INSERT OR UPDATE OF estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.ot_desde_cotizacion();

-- ─── 2. Informe de visita (como el de TecApp) ────────────────────────────────
ALTER TABLE public.informes_ot ADD COLUMN IF NOT EXISTS falla_observada TEXT;   -- lo que se encontró al llegar
ALTER TABLE public.informes_ot ADD COLUMN IF NOT EXISTS pendiente       TEXT;   -- qué quedó pendiente y por qué
ALTER TABLE public.informes_ot ADD COLUMN IF NOT EXISTS recibido_email  TEXT;
-- materiales: [{descripcion, cantidad, unidad, serie?, articulo_id?}] · fotos: [{path, caption}]

-- Al firmarse, a coordinación le llega el aviso (para revisar y cerrar la OT).
CREATE OR REPLACE FUNCTION public.informe_aviso()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.ordenes_trabajo;
BEGIN
  IF NEW.estado = 'firmado' AND OLD.estado IS DISTINCT FROM 'firmado' THEN
    SELECT * INTO o FROM public.ordenes_trabajo WHERE id = NEW.ot_id;
    PERFORM public.notificar('ot.crear', 'informe_firmado',
      'Informe firmado · OT-' || lpad(o.folio::TEXT, 4, '0'),
      left(o.titulo, 100) || COALESCE(' · recibió ' || NEW.recibido_por, ''), '/ordenes/' || NEW.ot_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_informe_aviso ON public.informes_ot;
CREATE TRIGGER trg_informe_aviso AFTER UPDATE OF estado ON public.informes_ot
  FOR EACH ROW EXECUTE FUNCTION public.informe_aviso();

-- ─── 3. Rendiciones: se rinden en una OT, sin aprobar ni rechazar ────────────
ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_estado_check;
UPDATE public.gastos SET estado = 'rendido' WHERE estado IN ('pendiente','aprobado');
ALTER TABLE public.gastos ADD CONSTRAINT gastos_estado_check CHECK (estado IN ('rendido','reembolsado','rechazado'));
ALTER TABLE public.gastos ALTER COLUMN estado SET DEFAULT 'rendido';
-- «rechazado» queda solo para los gastos de antes que se rechazaron.

CREATE OR REPLACE FUNCTION public.gastos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'rendido'; NEW.revisado_por := NULL; NEW.revisado_at := NULL; NEW.motivo_rechazo := NULL;
    IF NEW.ot_id IS NULL THEN
      RAISE EXCEPTION 'Elige la OT del gasto: cada rendición queda en una OT.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = NEW.ot_id AND estado = 'anulada') THEN
      RAISE EXCEPTION 'Esa OT está anulada.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT public.tiene_permiso('gastos.aprobar') THEN
      RAISE EXCEPTION 'Solo quien paga las rendiciones marca un gasto como reembolsado.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado NOT IN ('rendido','reembolsado') THEN
      RAISE EXCEPTION 'Las rendiciones no se aprueban ni se rechazan: quedan rendidas o reembolsadas.' USING ERRCODE = '23514';
    END IF;
    NEW.revisado_por := auth.uid(); NEW.revisado_at := NOW();
    IF NEW.estado = 'reembolsado' THEN
      PERFORM public.notificar_usuario(NEW.usuario_id, 'gasto_reembolsado', 'Te reembolsaron un gasto',
        to_char(NEW.monto, 'FM$999G999G999') || COALESCE(' · ' || NEW.descripcion, ''), '/gastos');
    END IF;
  ELSIF OLD.estado <> 'rendido' AND NOT public.tiene_permiso('gastos.aprobar') THEN
    RAISE EXCEPTION 'Un gasto ya reembolsado no se cambia.' USING ERRCODE = '42501';
  END IF;
  IF NEW.ot_id IS NULL AND OLD.ot_id IS NOT NULL THEN
    RAISE EXCEPTION 'El gasto tiene que quedar en una OT.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gastos_reglas ON public.gastos;
CREATE TRIGGER trg_gastos_reglas BEFORE INSERT OR UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_reglas();

DROP POLICY IF EXISTS gastos_editar ON public.gastos;
DROP POLICY IF EXISTS gastos_eliminar ON public.gastos;
CREATE POLICY gastos_editar ON public.gastos FOR UPDATE TO authenticated
  USING ((usuario_id = (SELECT auth.uid()) AND estado = 'rendido') OR (SELECT public.tiene_permiso('gastos.aprobar')));
CREATE POLICY gastos_eliminar ON public.gastos FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()) AND estado = 'rendido');

-- ─── 4. Resultado de cada OT: venta, costo cotizado y costo real ────────────
-- Venta y costo cotizado: las cotizaciones aprobadas de la OT (la que la originó y las
-- cotizadas desde ella), en pesos. Costo real: materiales de bodega + gastos rendidos.
CREATE OR REPLACE VIEW public.ot_resultado WITH (security_invoker = true) AS
SELECT o.id AS ot_id,
  COALESCE((SELECT SUM(CASE WHEN c.moneda = 'UF' THEN c.subtotal * COALESCE(c.valor_uf, 0) ELSE c.subtotal END)
            FROM public.cotizaciones c WHERE c.estado = 'Aprobada' AND (c.id = o.cotizacion_id OR c.ot_id = o.id)), 0) AS venta_neta,
  COALESCE((SELECT SUM(CASE WHEN c.moneda = 'UF' THEN COALESCE(c.costo_directo, 0) * COALESCE(c.valor_uf, 0) ELSE COALESCE(c.costo_directo, 0) END)
            FROM public.cotizaciones c WHERE c.estado = 'Aprobada' AND (c.id = o.cotizacion_id OR c.ot_id = o.id)), 0) AS costo_cotizado,
  COALESCE((SELECT SUM(CASE m.tipo WHEN 'salida' THEN 1 ELSE -1 END * m.cantidad * COALESCE(m.costo_unitario, 0))
            FROM public.movimientos_bodega m WHERE m.ot_id = o.id AND m.tipo IN ('salida','entrada')), 0) AS materiales,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.ot_id = o.id AND g.estado <> 'rechazado'), 0) AS gastos
FROM public.ordenes_trabajo o;
GRANT SELECT ON public.ot_resultado TO authenticated;

-- ─── 5. Avisos al celular: dónde mandarlos ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  dispositivo TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_usuario ON public.push_suscripciones(usuario_id);
ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_suscripciones TO authenticated;
GRANT ALL ON public.push_suscripciones TO service_role;
DROP POLICY IF EXISTS push_propias ON public.push_suscripciones;
-- Cada uno ve y maneja solo sus propios equipos. El envío lo hace el servidor (service role).
CREATE POLICY push_propias ON public.push_suscripciones FOR ALL TO authenticated
  USING (usuario_id = (SELECT auth.uid())) WITH CHECK (usuario_id = (SELECT auth.uid()));

-- Registrar o quitar el equipo actual. Quien tiene la suscripción del navegador es su dueño:
-- en un computador compartido, el equipo pasa a la persona que activó los avisos.
CREATE OR REPLACE FUNCTION public.push_registrar(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_dispositivo TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.' USING ERRCODE = '42501'; END IF;
  IF p_endpoint !~ '^https://' OR length(p_endpoint) > 1000 THEN RAISE EXCEPTION 'Suscripción inválida.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.push_suscripciones (usuario_id, endpoint, p256dh, auth, dispositivo)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 80))
  ON CONFLICT (endpoint) DO UPDATE SET usuario_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                                       dispositivo = EXCLUDED.dispositivo, updated_at = NOW();
END $$;
CREATE OR REPLACE FUNCTION public.push_quitar(p_endpoint TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.push_suscripciones WHERE endpoint = p_endpoint AND auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.push_registrar(TEXT, TEXT, TEXT, TEXT), public.push_quitar(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_registrar(TEXT, TEXT, TEXT, TEXT), public.push_quitar(TEXT) TO authenticated;

-- Una sola fila: la dirección del envío (https://<tu-erp>/api/push) y la clave compartida.
-- Sin políticas: solo la leen las funciones de la base y el SQL Editor.
CREATE TABLE IF NOT EXISTS public.push_config (
  id       BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  url      TEXT,
  secreto  TEXT
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM anon, authenticated;
INSERT INTO public.push_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- pg_net hace la llamada HTTP desde la base (Supabase la trae; se activa aquí).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net no está disponible: los avisos quedan solo en la campana.';
END $$;

-- Cada aviso nuevo se manda también al celular de su destinatario (si activó alguno).
-- Si falla el envío, el aviso igual queda en la campana: nunca se pierde ni traba nada.
CREATE OR REPLACE FUNCTION public.push_al_notificar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.push_config;
BEGIN
  SELECT * INTO c FROM public.push_config WHERE id;
  IF COALESCE(c.url, '') = '' OR COALESCE(c.secreto, '') = '' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_suscripciones WHERE usuario_id = NEW.usuario_id) THEN RETURN NULL; END IF;
  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
      USING c.url,
            jsonb_build_object('usuario_id', NEW.usuario_id, 'titulo', NEW.titulo, 'cuerpo', COALESCE(NEW.cuerpo, ''),
                               'url', COALESCE(NEW.url, '/'), 'tipo', NEW.tipo),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secreto', c.secreto);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Aviso al celular no enviado: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_push_al_notificar ON public.notificaciones;
CREATE TRIGGER trg_push_al_notificar AFTER INSERT ON public.notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.push_al_notificar();

-- ─── 6. updated_at y auditoría ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_push_suscripciones_updated ON public.push_suscripciones;
CREATE TRIGGER trg_push_suscripciones_updated BEFORE UPDATE ON public.push_suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 7. Configurar los avisos al celular (completa y ejecuta esta parte) ─────
-- 1) En Netlify → Environment variables: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--    VAPID_SUBJECT (mailto:tu@correo) y PUSH_SECRET (una clave larga inventada).
-- 2) Aquí, la dirección del ERP y la MISMA clave de PUSH_SECRET (descomenta y completa):
-- UPDATE public.push_config SET url = 'https://TU-ERP.netlify.app/api/push', secreto = 'LA-MISMA-DE-PUSH_SECRET';
