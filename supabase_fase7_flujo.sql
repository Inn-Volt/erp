-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 7: el flujo administrativo (sin terreno)
--   Solicitud → (visita en la agenda, con notas y fotos) → cotización → trabajo
--   (por iniciar · en ejecución · terminado) → cobros por hitos → facturado → pagado.
--   · Ya no nacen OT: la cotización aprobada ES el trabajo y se sigue ahí.
--   · Cobros por hitos: cada cotización trae su plan (p. ej. 50 % al aprobar, 50 % al
--     terminar); cada hito, cuando corresponde, cae solo en «Por facturar».
--   · Visita: la cita de la agenda guarda lo que se vio (notas y fotos), y la cotización
--     hecha desde ella se las lleva (las fotos van al PDF si se quiere).
--   · Gastos reales en la cotización (trabajo) o en el proyecto: costo real vs. cotizado.
--   · Avisos para todo lo que importa (y nunca a quien hizo la acción).
-- Ejecutar DESPUÉS de las fases 1 a 6. Es idempotente. No borra datos: las OT que
-- existan quedan guardadas (la app ya no las muestra).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Avisos: nunca a quien hizo la acción; a varias personas a la vez ─────
CREATE OR REPLACE FUNCTION public.notificar(p TEXT, p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  SELECT DISTINCT pf.id, p_tipo, p_titulo, p_cuerpo, p_url
  FROM public.profiles pf
  JOIN public.usuario_roles ur ON ur.usuario_id = pf.id AND ur.activo
  JOIN public.roles r ON r.id = ur.rol_id AND r.activo
  WHERE pf.activo AND ('*' = ANY(r.permisos) OR p = ANY(r.permisos))
    AND pf.id IS DISTINCT FROM auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.notificar(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ─── 1. Plan de cobro (hitos) ────────────────────────────────────────────────
-- [{nombre, porcentaje, cuando: 'aprobar'|'terminar'}] · los porcentajes suman 100.
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS plan_cobro JSONB NOT NULL
  DEFAULT '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]'::JSONB;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS plan_cobro JSONB;          -- vacío: el de los ajustes
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS trabajo_estado TEXT
  CHECK (trabajo_estado IN ('por_iniciar','en_ejecucion','terminado'));
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS trabajo_inicio DATE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS trabajo_termino DATE;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS agendamiento_id UUID REFERENCES public.agendamientos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cot_trabajo ON public.cotizaciones(trabajo_estado) WHERE trabajo_estado IS NOT NULL;
-- Las aprobadas de antes pasan a ser trabajos (terminados si su OT ya se cerró).
UPDATE public.cotizaciones c SET trabajo_estado = CASE
    WHEN EXISTS (SELECT 1 FROM public.ordenes_trabajo o WHERE o.cotizacion_id = c.id AND o.estado IN ('ejecutada','cerrada')) THEN 'terminado'
    WHEN EXISTS (SELECT 1 FROM public.ordenes_trabajo o WHERE o.cotizacion_id = c.id AND o.estado IN ('en_progreso','en_pausa')) THEN 'en_ejecucion'
    ELSE 'por_iniciar' END
 WHERE c.estado = 'Aprobada' AND c.trabajo_estado IS NULL;

ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS hito TEXT;
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS porcentaje NUMERIC(6,2);
CREATE UNIQUE INDEX IF NOT EXISTS uq_por_facturar_hito ON public.por_facturar(cotizacion_id, hito) WHERE hito IS NOT NULL;

/** El plan de la cotización, o el de los ajustes, o un solo cobro al terminar. */
CREATE OR REPLACE FUNCTION public._plan_cobro(c public.cotizaciones)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(c.plan_cobro, '[]'::JSONB), (SELECT plan_cobro FROM public.ajustes_cotizacion WHERE id = 1),
                  '[{"nombre":"Total","porcentaje":100,"cuando":"terminar"}]'::JSONB);
$$;

-- Crea en «Por facturar» los hitos que tocan (al aprobar o al terminar). Los montos se
-- reparten sobre el acumulado para que la suma dé exacta el total (sin pesos perdidos).
CREATE OR REPLACE FUNCTION public._cot_generar_cobros(p_cot UUID, p_cuando TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_total NUMERIC; h RECORD; v_monto NUMERIC; v_iv TEXT;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_cot;
  v_total := COALESCE(c.total_clp, c.total, 0);
  v_iv := 'IV-' || lpad(c.folio::TEXT, 4, '0');
  FOR h IN
    SELECT x.nombre, x.porcentaje, x.cuando,
           SUM(x.porcentaje) OVER (ORDER BY x.n) AS acum, SUM(x.porcentaje) OVER (ORDER BY x.n) - x.porcentaje AS antes
    FROM ROWS FROM (jsonb_to_recordset(public._plan_cobro(c)) AS (nombre TEXT, porcentaje NUMERIC, cuando TEXT))
         WITH ORDINALITY AS x(nombre, porcentaje, cuando, n)
  LOOP
    CONTINUE WHEN h.cuando IS DISTINCT FROM p_cuando OR COALESCE(h.porcentaje, 0) <= 0;
    v_monto := round(v_total * h.acum / 100) - round(v_total * h.antes / 100);
    INSERT INTO public.por_facturar (cotizacion_id, cliente_id, descripcion, monto, hito, porcentaje)
    VALUES (c.id, c.cliente_id, v_iv || ' · ' || h.nombre || ' (' || trim(to_char(h.porcentaje, 'FM990D##')) || ' %) · ' || left(COALESCE(c.titulo, 'Cotización'), 100),
            v_monto, h.nombre, h.porcentaje)
    ON CONFLICT (cotizacion_id, hito) WHERE hito IS NOT NULL DO NOTHING;
    IF FOUND THEN
      PERFORM public.notificar('facturacion.gestionar', 'por_facturar', 'Por facturar: ' || v_iv || ' · ' || h.nombre,
        to_char(v_monto, 'FM$999G999G999') || ' · ' || left(COALESCE(c.titulo, ''), 100), '/facturacion');
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public._cot_generar_cobros(UUID, TEXT), public._plan_cobro(public.cotizaciones) FROM PUBLIC, anon, authenticated;

-- ─── 2. El trabajo: la cotización aprobada se sigue ahí ──────────────────────
-- Ya no nacen OT al aprobar (para volver a tenerlas: recrear trg_ot_desde_cotizacion de la fase 6).
DROP TRIGGER IF EXISTS trg_ot_desde_cotizacion ON public.cotizaciones;

CREATE OR REPLACE FUNCTION public.cot_trabajo_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_transicion BOOLEAN := COALESCE(current_setting('innvolt.transicion', TRUE), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Una copia (clonar) nace sin trabajo.
    IF NEW.estado IS DISTINCT FROM 'Aprobada' THEN NEW.trabajo_estado := NULL; NEW.trabajo_inicio := NULL; NEW.trabajo_termino := NULL; END IF;
    RETURN NEW;
  END IF;
  -- Al aprobarse nace el trabajo; si deja de estar aprobada (anulada, vuelta a borrador), se va.
  IF NEW.estado = 'Aprobada' AND OLD.estado IS DISTINCT FROM 'Aprobada' THEN
    NEW.trabajo_estado := COALESCE(NEW.trabajo_estado, 'por_iniciar');
  ELSIF NEW.estado IS DISTINCT FROM 'Aprobada' THEN
    NEW.trabajo_estado := NULL;
  END IF;
  IF NEW.trabajo_estado IS DISTINCT FROM OLD.trabajo_estado AND NEW.estado = 'Aprobada' THEN
    IF NEW.trabajo_estado = 'en_ejecucion' THEN NEW.trabajo_inicio := COALESCE(NEW.trabajo_inicio, (NOW() AT TIME ZONE 'America/Santiago')::DATE); END IF;
    IF NEW.trabajo_estado = 'terminado' THEN
      NEW.trabajo_inicio := COALESCE(NEW.trabajo_inicio, (NOW() AT TIME ZONE 'America/Santiago')::DATE);
      NEW.trabajo_termino := (NOW() AT TIME ZONE 'America/Santiago')::DATE;
    END IF;
    IF NEW.trabajo_estado <> 'terminado' THEN NEW.trabajo_termino := NULL; END IF;
  END IF;
  -- El plan de cobro lo vio el cliente: solo cambia en borrador.
  IF NEW.plan_cobro IS DISTINCT FROM OLD.plan_cobro AND OLD.estado <> 'Borrador' AND NOT v_transicion AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'El plan de cobro solo se cambia en borrador.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cot_trabajo_reglas ON public.cotizaciones;
CREATE TRIGGER trg_cot_trabajo_reglas BEFORE INSERT OR UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_trabajo_reglas();

-- Cobros y avisos del trabajo.
CREATE OR REPLACE FUNCTION public.cot_trabajo_avisos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_iv TEXT := 'IV-' || lpad(NEW.folio::TEXT, 4, '0'); v_url TEXT := '/cotizador?edit=' || NEW.id;
BEGIN
  IF NEW.estado = 'Aprobada' AND OLD.estado IS DISTINCT FROM 'Aprobada' THEN
    PERFORM public._cot_generar_cobros(NEW.id, 'aprobar');
  END IF;
  IF NEW.trabajo_estado IS DISTINCT FROM OLD.trabajo_estado AND NEW.estado = 'Aprobada' THEN
    IF NEW.trabajo_estado = 'en_ejecucion' THEN
      PERFORM public.notificar('cotizaciones.ver', 'trabajo_iniciado', 'Trabajo iniciado: ' || v_iv, left(COALESCE(NEW.titulo, ''), 120), v_url);
    ELSIF NEW.trabajo_estado = 'terminado' THEN
      PERFORM public._cot_generar_cobros(NEW.id, 'terminar');
      PERFORM public.notificar('cotizaciones.ver', 'trabajo_terminado', 'Trabajo terminado: ' || v_iv, left(COALESCE(NEW.titulo, ''), 120), v_url);
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_cot_trabajo_avisos ON public.cotizaciones;
CREATE TRIGGER trg_cot_trabajo_avisos AFTER UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_trabajo_avisos();

-- Cobranza: aviso cuando el cliente terminó de pagar un cobro.
CREATE OR REPLACE FUNCTION public.aviso_pago()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.monto > 0 AND NEW.monto_pagado >= NEW.monto AND COALESCE(OLD.monto_pagado, 0) < NEW.monto THEN
    PERFORM public.notificar('facturacion.ver', 'pago_recibido', 'Pagado: ' || left(COALESCE(NEW.descripcion, 'un cobro'), 80),
      to_char(NEW.monto_pagado, 'FM$999G999G999') || COALESCE(' · factura ' || NEW.numero_factura, ''), '/facturacion');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_pago ON public.por_facturar;
CREATE TRIGGER trg_aviso_pago AFTER UPDATE OF monto_pagado ON public.por_facturar
  FOR EACH ROW EXECUTE FUNCTION public.aviso_pago();

-- ─── 3. La visita: lo que se vio, con fotos ──────────────────────────────────
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS notas_visita TEXT;
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS fotos JSONB NOT NULL DEFAULT '[]'::JSONB;   -- [{path, caption}]

-- Las fotos van al bucket privado de siempre (levantamientos-fotos), en la carpeta visitas/.
DROP POLICY IF EXISTS "visitas_fotos_select" ON storage.objects;
CREATE POLICY "visitas_fotos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND (SELECT public.tiene_alguno(ARRAY['agenda.ver','cotizaciones.ver'])));
DROP POLICY IF EXISTS "visitas_fotos_insert" ON storage.objects;
CREATE POLICY "visitas_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'levantamientos-fotos' AND name LIKE 'visitas/%' AND (SELECT public.tiene_permiso('agenda.gestionar')));
DROP POLICY IF EXISTS "visitas_fotos_delete" ON storage.objects;
CREATE POLICY "visitas_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND name LIKE 'visitas/%' AND (SELECT public.tiene_permiso('agenda.gestionar')));

CREATE OR REPLACE FUNCTION public.avisos_agenda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notificar('agenda.ver', 'agenda_nueva', 'Agendado: ' || left(NEW.titulo, 80),
      to_char(NEW.fecha, 'DD-MM') || COALESCE(' a las ' || to_char(NEW.hora_inicio, 'HH24:MI'), '')
        || COALESCE(' · ' || NEW.direccion, '') || ' · ' || NEW.responsable, '/agenda');
  ELSIF NEW.estado = 'Realizada' AND OLD.estado IS DISTINCT FROM 'Realizada' THEN
    PERFORM public.notificar('cotizaciones.crear', 'visita_realizada', 'Visita realizada: lista para cotizar',
      left(NEW.titulo, 80) || COALESCE(' · ' || left(NEW.notas_visita, 100), ''), '/agenda');
  ELSIF (NEW.fecha, NEW.hora_inicio) IS DISTINCT FROM (OLD.fecha, OLD.hora_inicio) AND NEW.estado NOT IN ('Cancelada','Realizada') THEN
    PERFORM public.notificar('agenda.ver', 'agenda_cambio', 'Cambia la visita: ' || left(NEW.titulo, 70),
      'Ahora el ' || to_char(NEW.fecha, 'DD-MM') || COALESCE(' a las ' || to_char(NEW.hora_inicio, 'HH24:MI'), '') || ' · antes ' || to_char(OLD.fecha, 'DD-MM'), '/agenda');
  ELSIF NEW.estado = 'Cancelada' AND OLD.estado IS DISTINCT FROM 'Cancelada' THEN
    PERFORM public.notificar('agenda.ver', 'agenda_cancelada', 'Visita cancelada: ' || left(NEW.titulo, 70), 'La del ' || to_char(NEW.fecha, 'DD-MM'), '/agenda');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_avisos_agenda ON public.agendamientos;
CREATE TRIGGER trg_avisos_agenda AFTER INSERT OR UPDATE ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.avisos_agenda();

-- ─── 4. Gastos reales: en el trabajo (cotización) o en el proyecto ───────────
ALTER TABLE public.gastos    ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE public.gastos    ADD COLUMN IF NOT EXISTS proyecto_id   UUID REFERENCES public.proyectos(id) ON DELETE SET NULL;
ALTER TABLE public.anticipos ADD COLUMN IF NOT EXISTS cotizacion_id UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
ALTER TABLE public.anticipos ADD COLUMN IF NOT EXISTS proyecto_id   UUID REFERENCES public.proyectos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_cot ON public.gastos(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_gastos_proyecto ON public.gastos(proyecto_id);

CREATE OR REPLACE FUNCTION public.gastos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.estado := 'rendido'; NEW.revisado_por := NULL; NEW.revisado_at := NULL; NEW.motivo_rechazo := NULL;
  END IF;
  IF NEW.cotizacion_id IS NULL AND NEW.proyecto_id IS NULL AND NEW.ot_id IS NULL THEN
    RAISE EXCEPTION 'Elige el trabajo (cotización aprobada) o el proyecto del gasto.' USING ERRCODE = '23514';
  END IF;
  IF NEW.cotizacion_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.cotizacion_id IS DISTINCT FROM OLD.cotizacion_id)
     AND NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = NEW.cotizacion_id AND estado = 'Aprobada') THEN
    RAISE EXCEPTION 'Los gastos van en una cotización aprobada (un trabajo).' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
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
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gastos_reglas ON public.gastos;
CREATE TRIGGER trg_gastos_reglas BEFORE INSERT OR UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_reglas();

CREATE OR REPLACE FUNCTION public.aviso_gasto_rendido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quien TEXT; v_donde TEXT;
BEGIN
  SELECT COALESCE(nombre, email) INTO v_quien FROM public.profiles WHERE id = NEW.usuario_id;
  SELECT COALESCE((SELECT 'IV-' || lpad(folio::TEXT, 4, '0') FROM public.cotizaciones WHERE id = NEW.cotizacion_id),
                  (SELECT 'PR-' || lpad(folio::TEXT, 4, '0') FROM public.proyectos WHERE id = NEW.proyecto_id), 'Sin trabajo') INTO v_donde;
  PERFORM public.notificar('gastos.aprobar', 'gasto_rendido', COALESCE(v_quien, 'Alguien') || ' rindió ' || to_char(NEW.monto, 'FM$999G999G999'),
    v_donde || COALESCE(' · ' || NEW.descripcion, '') || CASE WHEN NEW.anticipo_id IS NOT NULL THEN ' · contra anticipo' ELSE '' END, '/gastos');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_gasto_rendido ON public.gastos;
CREATE TRIGGER trg_aviso_gasto_rendido AFTER INSERT ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.aviso_gasto_rendido();

-- ─── 5. Resultado: costo real vs. cotizado ───────────────────────────────────
-- Por trabajo: venta neta y costo cotizado en pesos, gastos reales, lo facturado y lo cobrado.
CREATE OR REPLACE VIEW public.cotizacion_resultado WITH (security_invoker = true) AS
SELECT c.id AS cotizacion_id,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.subtotal, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.subtotal, 0) END AS venta_neta,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.costo_directo, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.costo_directo, 0) END AS costo_cotizado,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.cotizacion_id = c.id AND g.estado <> 'rechazado'), 0) AS gastos,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa = 'facturado'), 0) AS facturado,
  COALESCE((SELECT SUM(f.monto_pagado) FROM public.por_facturar f WHERE f.cotizacion_id = c.id), 0) AS cobrado,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa <> 'sin_cobro'), 0) AS por_cobrar_total
FROM public.cotizaciones c
WHERE c.estado = 'Aprobada';
GRANT SELECT ON public.cotizacion_resultado TO authenticated;

-- Proyecto: suma sus trabajos y los gastos puestos directo en él.
CREATE OR REPLACE VIEW public.proyecto_resumen WITH (security_invoker = true) AS
SELECT p.id AS proyecto_id,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Aprobada'), 0) AS venta,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Enviada'), 0) AS por_aprobar,
  COALESCE((SELECT SUM(CASE m.tipo WHEN 'salida' THEN 1 ELSE -1 END * m.cantidad * COALESCE(m.costo_unitario, 0))
            FROM public.movimientos_bodega m JOIN public.ordenes_trabajo o ON o.id = m.ot_id
            WHERE o.proyecto_id = p.id AND m.tipo IN ('salida','entrada') AND m.ot_id IS NOT NULL), 0) AS costo_materiales,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g
            WHERE g.estado <> 'rechazado' AND (g.proyecto_id = p.id
               OR g.cotizacion_id IN (SELECT id FROM public.cotizaciones WHERE proyecto_id = p.id)
               OR g.ot_id IN (SELECT id FROM public.ordenes_trabajo WHERE proyecto_id = p.id))), 0) AS gastos,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado <> 'anulada') AS ots,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado IN ('ejecutada','cerrada')) AS ots_terminadas,
  COALESCE((SELECT SUM(r.venta_neta) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS venta_neta,
  COALESCE((SELECT SUM(r.costo_cotizado) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS costo_cotizado,
  COALESCE((SELECT SUM(r.cobrado) FROM public.cotizacion_resultado r JOIN public.cotizaciones c ON c.id = r.cotizacion_id WHERE c.proyecto_id = p.id), 0) AS cobrado,
  (SELECT COUNT(*) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Aprobada') AS trabajos,
  (SELECT COUNT(*) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.trabajo_estado = 'terminado') AS trabajos_terminados
FROM public.proyectos p;
GRANT SELECT ON public.proyecto_resumen TO authenticated;

-- ─── 6. Más avisos ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aviso_solicitud()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cli TEXT;
BEGIN
  SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = NEW.cliente_id;
  PERFORM public.notificar('solicitudes.ver', 'solicitud_nueva',
    'Nueva solicitud' || CASE WHEN NEW.prioridad IN ('Alta','Urgente') THEN ' (' || lower(NEW.prioridad) || ')' ELSE '' END || COALESCE(' · ' || v_cli, ''),
    left(NEW.descripcion, 140), '/solicitudes');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_solicitud ON public.solicitudes;
CREATE TRIGGER trg_aviso_solicitud AFTER INSERT ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.aviso_solicitud();

CREATE OR REPLACE FUNCTION public.aviso_anticipo_anulado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'anulado' AND OLD.estado IS DISTINCT FROM 'anulado' THEN
    PERFORM public.notificar_usuario(NEW.usuario_id, 'anticipo_anulado', 'Se anuló tu anticipo AN-' || lpad(NEW.folio::TEXT, 4, '0'),
      to_char(NEW.monto, 'FM$999G999G999') || COALESCE(' · ' || NEW.motivo_anulacion, ''), '/gastos');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_anticipo_anulado ON public.anticipos;
CREATE TRIGGER trg_aviso_anticipo_anulado AFTER UPDATE OF estado ON public.anticipos
  FOR EACH ROW EXECUTE FUNCTION public.aviso_anticipo_anulado();

CREATE OR REPLACE FUNCTION public.aviso_tarea_hecha()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quien TEXT;
BEGIN
  IF NEW.estado = 'hecha' AND OLD.estado IS DISTINCT FROM 'hecha' AND NEW.creado_por IS NOT NULL THEN
    SELECT COALESCE(nombre, email) INTO v_quien FROM public.profiles WHERE id = auth.uid();
    PERFORM public.notificar_usuario(NEW.creado_por, 'tarea_hecha', 'Tarea terminada: ' || left(NEW.titulo, 90),
      COALESCE('Por ' || v_quien, 'Marcada como hecha'), '/tareas');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_tarea_hecha ON public.tareas;
CREATE TRIGGER trg_aviso_tarea_hecha AFTER UPDATE OF estado ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.aviso_tarea_hecha();

CREATE OR REPLACE FUNCTION public.aviso_proyecto_responsable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsable_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.responsable_id IS DISTINCT FROM OLD.responsable_id) THEN
    PERFORM public.notificar_usuario(NEW.responsable_id, 'proyecto_responsable',
      'Eres responsable del proyecto PR-' || lpad(NEW.folio::TEXT, 4, '0'), left(NEW.nombre, 140), '/proyectos/' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_proyecto_responsable ON public.proyectos;
CREATE TRIGGER trg_aviso_proyecto_responsable AFTER INSERT OR UPDATE OF responsable_id ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.aviso_proyecto_responsable();
