-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 12: avisos de agenda y visitas más completos
--   · El técnico encargado recibe avisos PROPIOS: asignación, cambio de fecha/hora/dirección,
--     confirmación, cancelación y cuando le quitan la visita. El resto de la agenda recibe el
--     aviso general (sin repetírselo al técnico, y nunca a quien hizo el cambio).
--   · Recordatorios automáticos (los manda la base cada 10 minutos con pg_cron, aunque nadie
--     tenga la app abierta; por eso también le llegan a quien agendó):
--       – la tarde anterior (desde las 17:00): «Mañana: …»
--       – 1 hora antes de la hora de inicio; si la visita no tiene hora, a las 8:00 del día
--       – al final del día si la visita sigue sin marcar como realizada: «¿Se hizo la visita?»
--     A quién: al técnico encargado; si la visita no tiene técnico, a quienes ven la agenda.
--     Cada recordatorio sale una sola vez; si cambia la fecha u hora, se vuelve a programar.
--   · Todos los avisos de una visita llevan a su panel (/visita/…).
-- Ejecutar DESPUÉS de las fases 1 a 11. Es idempotente y no borra datos.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Aviso a un grupo, sin repetirlo a ciertas personas ────────────────────
CREATE OR REPLACE FUNCTION public.notificar_excepto(p TEXT, p_excluir UUID[], p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  SELECT DISTINCT pf.id, p_tipo, p_titulo, p_cuerpo, p_url
  FROM public.profiles pf
  JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
  JOIN public.roles r ON r.id = ur.rol_id AND r.activo
  WHERE pf.activo AND ('*' = ANY(r.permisos) OR p = ANY(r.permisos))
    AND pf.id IS DISTINCT FROM auth.uid()
    AND NOT (pf.id = ANY(COALESCE(p_excluir, '{}'::UUID[])));
$$;
REVOKE EXECUTE ON FUNCTION public.notificar_excepto(TEXT, UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- «Mar 21-10 a las 10:30 · Av. Siempre Viva 123»
CREATE OR REPLACE FUNCTION public.cuando_visita(a public.agendamientos)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT (ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'])[EXTRACT(DOW FROM a.fecha)::INT + 1] || ' ' || to_char(a.fecha, 'DD-MM')
      || COALESCE(' a las ' || to_char(a.hora_inicio, 'HH24:MI'), '')
      || COALESCE(' · ' || left(a.direccion, 80), '');
$$;

-- ─── 2. Avisos al crear y cambiar una cita ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.avisos_agenda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  url TEXT := '/visita/' || NEW.id;
  tec UUID[] := CASE WHEN NEW.tecnico_id IS NULL THEN '{}'::UUID[] ELSE ARRAY[NEW.tecnico_id] END;
  activa BOOLEAN := NEW.estado NOT IN ('Cancelada','Realizada');
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Al técnico le llega «Te asignaron una visita» (trigger de la fase 10); al resto, esto.
    PERFORM public.notificar_excepto('agenda.ver', tec, 'agenda_nueva', 'Agendado: ' || left(NEW.titulo, 80), public.cuando_visita(NEW), url);
    RETURN NULL;
  END IF;

  -- Le quitaron la visita al técnico anterior.
  IF OLD.tecnico_id IS NOT NULL AND NEW.tecnico_id IS DISTINCT FROM OLD.tecnico_id AND OLD.estado NOT IN ('Cancelada','Realizada') THEN
    PERFORM public.notificar_usuario(OLD.tecnico_id, 'visita_quitada', 'Ya no estás a cargo: ' || left(NEW.titulo, 70), public.cuando_visita(NEW), '/inicio');
  END IF;

  IF NEW.estado = 'Realizada' AND OLD.estado IS DISTINCT FROM 'Realizada' THEN
    PERFORM public.notificar('cotizaciones.crear', 'visita_realizada', 'Visita realizada: lista para cotizar',
      left(NEW.titulo, 80) || COALESCE(' · ' || left(NEW.notas_visita, 100), ''), url);
  ELSIF NEW.estado = 'Cancelada' AND OLD.estado IS DISTINCT FROM 'Cancelada' THEN
    IF NEW.tecnico_id IS NOT NULL AND NEW.tecnico_id IS NOT DISTINCT FROM OLD.tecnico_id THEN
      PERFORM public.notificar_usuario(NEW.tecnico_id, 'agenda_cancelada', 'Se canceló tu visita: ' || left(NEW.titulo, 70), public.cuando_visita(OLD), url);
    END IF;
    PERFORM public.notificar_excepto('agenda.ver', tec, 'agenda_cancelada', 'Visita cancelada: ' || left(NEW.titulo, 70), public.cuando_visita(OLD), url);
  ELSIF activa AND (NEW.fecha, NEW.hora_inicio, NEW.direccion) IS DISTINCT FROM (OLD.fecha, OLD.hora_inicio, OLD.direccion) THEN
    IF NEW.tecnico_id IS NOT NULL AND NEW.tecnico_id IS NOT DISTINCT FROM OLD.tecnico_id THEN
      PERFORM public.notificar_usuario(NEW.tecnico_id, 'agenda_cambio', 'Cambió tu visita: ' || left(NEW.titulo, 70),
        'Ahora: ' || public.cuando_visita(NEW) || ' (antes ' || to_char(OLD.fecha, 'DD-MM') || COALESCE(' ' || to_char(OLD.hora_inicio, 'HH24:MI'), '') || ')', url);
    END IF;
    PERFORM public.notificar_excepto('agenda.ver', tec, 'agenda_cambio', 'Cambia la visita: ' || left(NEW.titulo, 70),
      'Ahora: ' || public.cuando_visita(NEW) || ' (antes ' || to_char(OLD.fecha, 'DD-MM') || ')', url);
  ELSIF NEW.estado = 'Confirmada' AND OLD.estado IS DISTINCT FROM 'Confirmada' AND NEW.tecnico_id IS NOT NULL THEN
    PERFORM public.notificar_usuario(NEW.tecnico_id, 'agenda_confirmada', 'Visita confirmada: ' || left(NEW.titulo, 70), public.cuando_visita(NEW), url);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_avisos_agenda ON public.agendamientos;
CREATE TRIGGER trg_avisos_agenda AFTER INSERT OR UPDATE ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.avisos_agenda();

-- ─── 3. Recordatorios ────────────────────────────────────────────────────────
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS aviso_dia_at    TIMESTAMPTZ;   -- «Mañana: …»
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS aviso_hora_at   TIMESTAMPTZ;   -- «En 1 hora» / «Hoy»
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS aviso_cierre_at TIMESTAMPTZ;   -- «¿Se hizo la visita?»

-- Si cambia la fecha o la hora, los recordatorios se vuelven a programar.
CREATE OR REPLACE FUNCTION public.agenda_reprogramar_avisos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.fecha, NEW.hora_inicio) IS DISTINCT FROM (OLD.fecha, OLD.hora_inicio) THEN
    NEW.aviso_dia_at := NULL; NEW.aviso_hora_at := NULL; NEW.aviso_cierre_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_agenda_reprogramar_avisos ON public.agendamientos;
CREATE TRIGGER trg_agenda_reprogramar_avisos BEFORE UPDATE OF fecha, hora_inicio ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.agenda_reprogramar_avisos();

-- Manda los recordatorios que correspondan a esta hora (hora de Chile). Devuelve cuántos.
-- p_ahora sirve para probar; normalmente es NOW().
CREATE OR REPLACE FUNCTION public.enviar_recordatorios_agenda(p_ahora TIMESTAMPTZ DEFAULT NOW())
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ahora_cl TIMESTAMP := p_ahora AT TIME ZONE 'America/Santiago';
  hoy DATE := ahora_cl::DATE;
  a public.agendamientos;
  n INT := 0;
BEGIN
  -- La tarde anterior
  FOR a IN SELECT * FROM public.agendamientos
            WHERE fecha = hoy + 1 AND estado IN ('Agendada','Confirmada','Reprogramada') AND aviso_dia_at IS NULL
              AND ahora_cl::TIME >= TIME '17:00' FOR UPDATE SKIP LOCKED LOOP
    IF a.tecnico_id IS NOT NULL THEN
      PERFORM public.notificar_usuario(a.tecnico_id, 'recordatorio_visita', 'Mañana: ' || left(a.titulo, 80), public.cuando_visita(a), '/visita/' || a.id);
    ELSE
      PERFORM public.notificar('agenda.ver', 'recordatorio_visita', 'Mañana: ' || left(a.titulo, 80), public.cuando_visita(a), '/visita/' || a.id);
    END IF;
    UPDATE public.agendamientos SET aviso_dia_at = p_ahora WHERE id = a.id;
    n := n + 1;
  END LOOP;

  -- El mismo día: 1 hora antes (o a las 8:00 si no tiene hora)
  FOR a IN SELECT * FROM public.agendamientos
            WHERE fecha = hoy AND estado IN ('Agendada','Confirmada','Reprogramada') AND aviso_hora_at IS NULL
              AND ((hora_inicio IS NOT NULL AND (fecha + hora_inicio) - ahora_cl BETWEEN INTERVAL '0 minutes' AND INTERVAL '75 minutes')
                OR (hora_inicio IS NULL AND ahora_cl::TIME >= TIME '08:00'))
            FOR UPDATE SKIP LOCKED LOOP
    IF a.tecnico_id IS NOT NULL THEN
      PERFORM public.notificar_usuario(a.tecnico_id, 'recordatorio_visita',
        CASE WHEN a.hora_inicio IS NULL THEN 'Hoy: ' ELSE 'En 1 hora: ' END || left(a.titulo, 80), public.cuando_visita(a), '/visita/' || a.id);
    ELSE
      PERFORM public.notificar('agenda.ver', 'recordatorio_visita',
        CASE WHEN a.hora_inicio IS NULL THEN 'Hoy: ' ELSE 'En 1 hora: ' END || left(a.titulo, 80), public.cuando_visita(a), '/visita/' || a.id);
    END IF;
    UPDATE public.agendamientos SET aviso_hora_at = p_ahora WHERE id = a.id;
    n := n + 1;
  END LOOP;

  -- Cierre: pasó la visita (desde las 19:00 del día, o días anteriores hasta 3 atrás) y no se marcó
  FOR a IN SELECT * FROM public.agendamientos
            WHERE estado IN ('Agendada','Confirmada','Reprogramada') AND aviso_cierre_at IS NULL
              AND ((fecha = hoy AND ahora_cl::TIME >= TIME '19:00') OR (fecha < hoy AND fecha >= hoy - 3))
            FOR UPDATE SKIP LOCKED LOOP
    IF a.tecnico_id IS NOT NULL THEN
      PERFORM public.notificar_usuario(a.tecnico_id, 'visita_sin_cerrar', '¿Se hizo la visita? ' || left(a.titulo, 70),
        'Márcala como realizada y completa el informe · ' || public.cuando_visita(a), '/visita/' || a.id);
    ELSE
      PERFORM public.notificar('agenda.gestionar', 'visita_sin_cerrar', '¿Se hizo la visita? ' || left(a.titulo, 70),
        'Márcala como realizada o reprográmala · ' || public.cuando_visita(a), '/visita/' || a.id);
    END IF;
    UPDATE public.agendamientos SET aviso_cierre_at = p_ahora WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.enviar_recordatorios_agenda(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- Las visitas que ya pasaron no disparan recordatorios viejos al activar esto.
UPDATE public.agendamientos SET aviso_dia_at = COALESCE(aviso_dia_at, NOW()), aviso_hora_at = COALESCE(aviso_hora_at, NOW()), aviso_cierre_at = COALESCE(aviso_cierre_at, NOW())
 WHERE fecha < (NOW() AT TIME ZONE 'America/Santiago')::DATE - 3;

-- ─── 4. Programarlos cada 10 minutos (pg_cron de Supabase) ───────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'innvolt-recordatorios-agenda';
  PERFORM cron.schedule('innvolt-recordatorios-agenda', '*/10 * * * *', 'SELECT public.enviar_recordatorios_agenda()');
  RAISE NOTICE 'Recordatorios de agenda programados cada 10 minutos.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no está disponible (%): actívalo en Supabase → Database → Extensions y vuelve a correr este archivo.', SQLERRM;
END $$;
