-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 5 (traído de TecApp): el resto de la operación
--   · OT como el ticket de TecApp: visitas con sus técnicos, bitácora automática,
--     tipo de servicio, etiquetas y plantillas de informe (checklist por tipo de trabajo).
--   · Anticipos a rendir (gastos que se rinden contra un anticipo).
--   · Bodega del técnico (responsable), pedidos de material con despacho y catastro
--     de equipos instalados.
--   · Avances de tareas.  · Proyectos.  · Personas: competencias y organigrama.
--   · Estado de pago del cliente.  · Traslados por comuna y base de salida.
-- Ejecutar DESPUÉS de las fases 1 a 4. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Permisos nuevos en los roles base (se suman) ─────────────────────────
INSERT INTO public.roles (clave, nombre, descripcion, permisos, protegido) VALUES
  ('comercial', 'Comercial', NULL, ARRAY['proyectos.ver','proyectos.gestionar','traslados.ver'], FALSE),
  ('administrativo', 'Administrativo', NULL, ARRAY['proyectos.ver','proyectos.gestionar','personas.ver','personas.gestionar','traslados.ver','traslados.gestionar'], FALSE),
  ('tecnico', 'Técnico', NULL, ARRAY['traslados.ver'], FALSE),
  ('solo_lectura', 'Solo lectura', NULL, ARRAY['proyectos.ver','personas.ver','traslados.ver'], FALSE)
ON CONFLICT (clave) DO UPDATE SET
  permisos = CASE WHEN public.roles.protegido THEN ARRAY['*']
                  ELSE ARRAY(SELECT DISTINCT unnest(public.roles.permisos || EXCLUDED.permisos)) END;

-- ─── 1. Proyectos (antes que todo lo que los nombra) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.proyectos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio           SERIAL UNIQUE,
  nombre          TEXT NOT NULL,
  cliente_id      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  sucursal_id     UUID REFERENCES public.cliente_sucursales(id) ON DELETE SET NULL,
  descripcion     TEXT,
  estado          TEXT NOT NULL DEFAULT 'planificado' CHECK (estado IN ('planificado','en_curso','en_pausa','terminado','cancelado')),
  fecha_inicio    DATE,
  fecha_fin       DATE,
  presupuesto     NUMERIC(14,2),
  responsable_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creado_por      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cotizaciones    ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES public.proyectos(id) ON DELETE SET NULL;
ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES public.proyectos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cot_proyecto ON public.cotizaciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_ot_proyecto ON public.ordenes_trabajo(proyecto_id);

-- La cotización no se edita fuera de borrador, pero unirla a un proyecto sí se puede
-- (no es contenido que vea el cliente): cotizacion_reglas no mira proyecto_id.
-- La OT nacida de una cotización hereda su proyecto.
CREATE OR REPLACE FUNCTION public.ot_hereda_proyecto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.proyecto_id IS NULL AND NEW.cotizacion_id IS NOT NULL THEN
    SELECT proyecto_id INTO NEW.proyecto_id FROM public.cotizaciones WHERE id = NEW.cotizacion_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ot_hereda_proyecto ON public.ordenes_trabajo;
CREATE TRIGGER trg_ot_hereda_proyecto BEFORE INSERT ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.ot_hereda_proyecto();

-- Resumen del proyecto: venta aprobada, costo de materiales, gastos y avance por OT.
CREATE OR REPLACE VIEW public.proyecto_resumen WITH (security_invoker = true) AS
SELECT p.id AS proyecto_id,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Aprobada'), 0) AS venta,
  COALESCE((SELECT SUM(COALESCE(c.total_clp, c.total)) FROM public.cotizaciones c WHERE c.proyecto_id = p.id AND c.estado = 'Enviada'), 0) AS por_aprobar,
  COALESCE((SELECT SUM(CASE m.tipo WHEN 'salida' THEN 1 ELSE -1 END * m.cantidad * COALESCE(m.costo_unitario, 0))
            FROM public.movimientos_bodega m JOIN public.ordenes_trabajo o ON o.id = m.ot_id
            WHERE o.proyecto_id = p.id AND m.tipo IN ('salida','entrada') AND m.ot_id IS NOT NULL), 0) AS costo_materiales,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g JOIN public.ordenes_trabajo o ON o.id = g.ot_id
            WHERE o.proyecto_id = p.id AND g.estado <> 'rechazado'), 0) AS gastos,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado <> 'anulada') AS ots,
  (SELECT COUNT(*) FROM public.ordenes_trabajo o WHERE o.proyecto_id = p.id AND o.estado IN ('ejecutada','cerrada')) AS ots_terminadas
FROM public.proyectos p;

-- ─── 2. OT como ticket: visitas, bitácora, tipo de servicio y etiquetas ──────
ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS tipo_servicio TEXT;
ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS etiquetas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.ot_notas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'nota';   -- nota · sistema

CREATE TABLE IF NOT EXISTS public.ot_visitas (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ot_id            UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  fecha            DATE NOT NULL,
  hora_inicio      TIME,
  hora_fin         TIME,
  tecnicos         UUID[] NOT NULL DEFAULT '{}',
  estado           TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada','realizada','cancelada')),
  nota             TEXT,
  agendamiento_id  UUID REFERENCES public.agendamientos(id) ON DELETE SET NULL,
  creado_por       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ot_visitas ON public.ot_visitas(ot_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ot_visitas_fecha ON public.ot_visitas(fecha);

-- Bitácora: cada hecho importante queda como nota «sistema» (quién y cuándo los pone la nota).
CREATE OR REPLACE FUNCTION public._ot_bitacora(p_ot UUID, p_texto TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.ot_notas (ot_id, texto, tipo, usuario_id) VALUES (p_ot, p_texto, 'sistema', auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public._ot_bitacora(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ot_bitacora()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombres TEXT;
  nombre_estado CONSTANT JSONB := '{"por_coordinar":"Por coordinar","coordinada":"Coordinada","en_progreso":"En progreso","en_pausa":"En pausa","ejecutada":"Ejecutada","cerrada":"Cerrada","anulada":"Anulada"}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._ot_bitacora(NEW.id, CASE WHEN NEW.cotizacion_id IS NOT NULL THEN 'OT creada al aprobar la cotización' ELSE 'OT creada' END);
    RETURN NULL;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    PERFORM public._ot_bitacora(NEW.id, 'Estado: ' || COALESCE(nombre_estado->>OLD.estado, OLD.estado) || ' → ' || COALESCE(nombre_estado->>NEW.estado, NEW.estado)
      || CASE WHEN NEW.estado IN ('en_pausa','anulada') AND NEW.motivo IS NOT NULL THEN ' (' || NEW.motivo || ')' ELSE '' END);
  END IF;
  IF NEW.tecnicos IS DISTINCT FROM OLD.tecnicos THEN
    SELECT string_agg(COALESCE(nombre, email), ', ') INTO v_nombres FROM public.profiles WHERE id = ANY(NEW.tecnicos);
    PERFORM public._ot_bitacora(NEW.id, 'Técnicos: ' || COALESCE(v_nombres, 'ninguno'));
  END IF;
  IF NEW.fecha_programada IS DISTINCT FROM OLD.fecha_programada AND NEW.fecha_programada IS NOT NULL THEN
    PERFORM public._ot_bitacora(NEW.id, 'Fecha programada: ' || to_char(NEW.fecha_programada, 'DD-MM-YYYY'));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_ot_bitacora ON public.ordenes_trabajo;
CREATE TRIGGER trg_ot_bitacora AFTER INSERT OR UPDATE ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.ot_bitacora();

CREATE OR REPLACE FUNCTION public.informe_bitacora()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'firmado' AND OLD.estado IS DISTINCT FROM 'firmado' THEN
    PERFORM public._ot_bitacora(NEW.ot_id, 'Informe INF-' || lpad(NEW.folio::TEXT, 4, '0') || ' firmado por ' || COALESCE(NEW.recibido_por, 'el cliente'));
  ELSIF OLD.estado = 'firmado' AND NEW.estado = 'borrador' THEN
    PERFORM public._ot_bitacora(NEW.ot_id, 'Informe INF-' || lpad(NEW.folio::TEXT, 4, '0') || ' reabierto');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_informe_bitacora ON public.informes_ot;
CREATE TRIGGER trg_informe_bitacora AFTER UPDATE OF estado ON public.informes_ot
  FOR EACH ROW EXECUTE FUNCTION public.informe_bitacora();

-- Visitas: sus técnicos pasan a la OT (para que la vean) y reciben aviso; queda en la bitácora.
CREATE OR REPLACE FUNCTION public.ot_visita_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t UUID; v_folio TEXT; v_titulo TEXT; v_prox DATE;
BEGIN
  SELECT 'OT-' || lpad(folio::TEXT, 4, '0'), titulo INTO v_folio, v_titulo FROM public.ordenes_trabajo WHERE id = NEW.ot_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._ot_bitacora(NEW.ot_id, 'Visita programada el ' || to_char(NEW.fecha, 'DD-MM-YYYY') || COALESCE(' a las ' || to_char(NEW.hora_inicio, 'HH24:MI'), ''));
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    PERFORM public._ot_bitacora(NEW.ot_id, 'Visita del ' || to_char(NEW.fecha, 'DD-MM-YYYY') || ': ' || NEW.estado);
  END IF;
  FOREACH t IN ARRAY NEW.tecnicos LOOP
    IF TG_OP = 'INSERT' OR NOT (t = ANY(OLD.tecnicos)) THEN
      PERFORM public.notificar_usuario(t, 'ot_visita', 'Visita ' || v_folio || ' el ' || to_char(NEW.fecha, 'DD-MM'), v_titulo, '/ordenes/' || NEW.ot_id);
    END IF;
  END LOOP;
  SELECT MIN(fecha) INTO v_prox FROM public.ot_visitas WHERE ot_id = NEW.ot_id AND estado = 'programada';
  UPDATE public.ordenes_trabajo
     SET tecnicos = ARRAY(SELECT DISTINCT unnest(tecnicos || NEW.tecnicos)),
         fecha_programada = COALESCE(v_prox, fecha_programada),
         estado = CASE WHEN estado = 'por_coordinar' AND NEW.estado = 'programada' THEN 'coordinada' ELSE estado END
   WHERE id = NEW.ot_id
     AND (NOT (tecnicos @> NEW.tecnicos) OR fecha_programada IS DISTINCT FROM COALESCE(v_prox, fecha_programada) OR estado = 'por_coordinar');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_ot_visita_reglas ON public.ot_visitas;
CREATE TRIGGER trg_ot_visita_reglas AFTER INSERT OR UPDATE ON public.ot_visitas
  FOR EACH ROW EXECUTE FUNCTION public.ot_visita_reglas();

-- Plantillas de informe: el checklist según el tipo de trabajo.
CREATE TABLE IF NOT EXISTS public.informe_plantillas (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre         TEXT NOT NULL,
  tipo_servicio  TEXT,
  checklist      JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{"texto": "..."}]
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.informe_plantillas (nombre, tipo_servicio, checklist)
SELECT * FROM (VALUES
  ('Instalación eléctrica', 'electricidad', '[{"texto":"Se verificó ausencia de tensión antes de intervenir"},{"texto":"Conexiones apretadas y sin calentamiento"},{"texto":"Protecciones probadas (disparo del diferencial)"},{"texto":"Medición de aislación y puesta a tierra"},{"texto":"Lugar de trabajo limpio y ordenado"},{"texto":"Se explicó al cliente lo realizado"}]'::JSONB),
  ('Mantención de tablero', 'mantencion', '[{"texto":"Reapriete de conexiones"},{"texto":"Limpieza interior del tablero"},{"texto":"Termografía o revisión de puntos calientes"},{"texto":"Prueba de diferenciales"},{"texto":"Rotulación de circuitos al día"}]'::JSONB),
  ('CCTV / control de acceso', 'cctv', '[{"texto":"Cámaras grabando y con imagen nítida"},{"texto":"Grabador con fecha y hora correctas"},{"texto":"Acceso remoto probado con el cliente"},{"texto":"Lectores y cerraduras probados"},{"texto":"Respaldo de configuración entregado"}]'::JSONB)
) AS v(nombre, tipo_servicio, checklist)
WHERE NOT EXISTS (SELECT 1 FROM public.informe_plantillas);

-- ─── 3. Anticipos a rendir ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anticipos (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio          SERIAL UNIQUE,
  usuario_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         TEXT,
  ot_id          UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  estado         TEXT NOT NULL DEFAULT 'entregado' CHECK (estado IN ('entregado','rendido','anulado')),
  entregado_por  UUID DEFAULT auth.uid(),
  motivo_anulacion TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS anticipo_id UUID REFERENCES public.anticipos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_anticipo ON public.gastos(anticipo_id);

-- Saldo de cada anticipo: lo entregado menos lo rendido (gastos no rechazados contra él).
CREATE OR REPLACE VIEW public.anticipo_saldos WITH (security_invoker = true) AS
SELECT a.id AS anticipo_id, a.usuario_id, a.monto,
       COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.anticipo_id = a.id AND g.estado <> 'rechazado'), 0) AS rendido,
       a.monto - COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.anticipo_id = a.id AND g.estado <> 'rechazado'), 0) AS saldo
FROM public.anticipos a;

-- Un anticipo lo entrega solo quien aprueba gastos; no se edita (se anula con motivo).
CREATE OR REPLACE FUNCTION public.anticipo_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- El saldo (al rendir un gasto) solo mueve entregado ↔ rendido: eso lo hace el sistema.
  IF TG_OP = 'UPDATE' AND NEW.estado IN ('entregado','rendido') AND OLD.estado IN ('entregado','rendido')
     AND (NEW.monto, NEW.usuario_id, NEW.fecha, NEW.motivo, NEW.motivo_anulacion, NEW.ot_id)
         IS NOT DISTINCT FROM (OLD.monto, OLD.usuario_id, OLD.fecha, OLD.motivo, OLD.motivo_anulacion, OLD.ot_id) THEN
    RETURN NEW;
  END IF;
  IF NOT public.tiene_permiso('gastos.aprobar') THEN
    RAISE EXCEPTION 'Solo quien aprueba gastos entrega o cambia anticipos.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notificar_usuario(NEW.usuario_id, 'anticipo', 'Anticipo a rendir', to_char(NEW.monto, 'FM$999G999G999') || COALESCE(' · ' || NEW.motivo, ''), '/gastos');
    RETURN NEW;
  END IF;
  IF (NEW.monto, NEW.usuario_id, NEW.fecha) IS DISTINCT FROM (OLD.monto, OLD.usuario_id, OLD.fecha) THEN
    RAISE EXCEPTION 'Un anticipo no se edita: anúlalo y entrega otro.' USING ERRCODE = '23514';
  END IF;
  IF NEW.estado = 'anulado' AND OLD.estado <> 'anulado' AND COALESCE(trim(NEW.motivo_anulacion), '') = '' THEN
    RAISE EXCEPTION 'Indica por qué se anula.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_anticipo_reglas ON public.anticipos;
CREATE TRIGGER trg_anticipo_reglas BEFORE INSERT OR UPDATE ON public.anticipos
  FOR EACH ROW EXECUTE FUNCTION public.anticipo_reglas();

-- Un gasto se rinde contra un anticipo propio y vigente. Cuando el saldo llega a 0, queda rendido.
CREATE OR REPLACE FUNCTION public.gasto_anticipo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.anticipos; v_saldo NUMERIC;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.anticipo_id IS NOT NULL THEN
    SELECT * INTO a FROM public.anticipos WHERE id = NEW.anticipo_id;
    IF a.usuario_id IS DISTINCT FROM NEW.usuario_id THEN
      RAISE EXCEPTION 'Ese anticipo es de otra persona.' USING ERRCODE = '23514';
    END IF;
    IF a.estado = 'anulado' THEN
      RAISE EXCEPTION 'Ese anticipo está anulado.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gasto_anticipo ON public.gastos;
CREATE TRIGGER trg_gasto_anticipo BEFORE INSERT OR UPDATE OF anticipo_id ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gasto_anticipo();

CREATE OR REPLACE FUNCTION public.anticipo_estado_por_saldo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID := COALESCE(NEW.anticipo_id, OLD.anticipo_id); v_saldo NUMERIC;
BEGIN
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT saldo INTO v_saldo FROM public.anticipo_saldos WHERE anticipo_id = v_id;
  UPDATE public.anticipos SET estado = CASE WHEN v_saldo <= 0 THEN 'rendido' ELSE 'entregado' END
   WHERE id = v_id AND estado <> 'anulado' AND estado <> CASE WHEN v_saldo <= 0 THEN 'rendido' ELSE 'entregado' END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_anticipo_estado ON public.gastos;
CREATE TRIGGER trg_anticipo_estado AFTER INSERT OR UPDATE OR DELETE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.anticipo_estado_por_saldo();

-- ─── 4. Bodega: del técnico, pedidos de material y catastro ──────────────────
ALTER TABLE public.bodegas ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pedidos_material (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio              SERIAL UNIQUE,
  ot_id              UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  cotizacion_id      UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  pedido_por         UUID DEFAULT auth.uid(),
  bodega_origen_id   UUID REFERENCES public.bodegas(id) ON DELETE SET NULL,
  bodega_destino_id  UUID REFERENCES public.bodegas(id) ON DELETE SET NULL,   -- la del técnico; vacío: directo a la OT
  para_fecha         DATE,
  estado             TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','despachado','rechazado','cancelado')),
  nota               TEXT,
  motivo_rechazo     TEXT,
  despachado_por     UUID,
  despachado_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.pedido_lineas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id   UUID NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  articulo_id UUID NOT NULL REFERENCES public.catalogo_items(id) ON DELETE RESTRICT,
  cantidad    NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  despachada  NUMERIC(12,3) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pedido_lineas ON public.pedido_lineas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos_material(estado);

CREATE OR REPLACE FUNCTION public.pedido_avisos()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_folio TEXT := 'PM-' || lpad(NEW.folio::TEXT, 4, '0');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notificar('bodega.mover', 'pedido_material', 'Pedido de material ' || v_folio, COALESCE(NEW.nota, 'Para despachar'), '/bodega?tab=pedidos');
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('despachado','parcial','rechazado') THEN
    PERFORM public.notificar_usuario(NEW.pedido_por, 'pedido_material', v_folio || ': ' || NEW.estado,
      COALESCE(NEW.motivo_rechazo, 'Revisa tu bodega'), '/bodega?tab=pedidos');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pedido_avisos ON public.pedidos_material;
CREATE TRIGGER trg_pedido_avisos AFTER INSERT OR UPDATE ON public.pedidos_material
  FOR EACH ROW EXECUTE FUNCTION public.pedido_avisos();

-- Despachar: por cada línea, sale de la bodega de origen y entra a la del técnico (o sale
-- directo a la OT). Las reglas de stock de movimientos_bodega se aplican igual.
CREATE OR REPLACE FUNCTION public.despachar_pedido(p_id UUID, p_lineas JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.pedidos_material; x JSONB; l public.pedido_lineas; v_cant NUMERIC; v_pend NUMERIC;
BEGIN
  IF NOT public.tiene_permiso('bodega.mover') THEN
    RAISE EXCEPTION 'No tienes permiso para despachar.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.pedidos_material WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe ese pedido.'; END IF;
  IF p.estado NOT IN ('pendiente','parcial') THEN RAISE EXCEPTION 'Ese pedido ya se cerró.' USING ERRCODE = '23514'; END IF;
  IF p.bodega_origen_id IS NULL THEN RAISE EXCEPTION 'Elige de qué bodega sale.' USING ERRCODE = '23514'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT * INTO l FROM public.pedido_lineas WHERE id = (x->>'linea_id')::UUID AND pedido_id = p_id;
    v_cant := COALESCE((x->>'cantidad')::NUMERIC, 0);
    IF l.id IS NULL OR v_cant <= 0 THEN CONTINUE; END IF;
    INSERT INTO public.movimientos_bodega (tipo, articulo_id, bodega_id, cantidad, serie, ot_id, nota)
    VALUES ('salida', l.articulo_id, p.bodega_origen_id, v_cant, NULLIF(x->>'serie', ''),
            CASE WHEN p.bodega_destino_id IS NULL THEN p.ot_id END, 'Pedido PM-' || lpad(p.folio::TEXT, 4, '0'));
    IF p.bodega_destino_id IS NOT NULL THEN
      INSERT INTO public.movimientos_bodega (tipo, articulo_id, bodega_id, cantidad, serie, nota)
      VALUES ('entrada', l.articulo_id, p.bodega_destino_id, v_cant, NULLIF(x->>'serie', ''), 'Pedido PM-' || lpad(p.folio::TEXT, 4, '0'));
    END IF;
    UPDATE public.pedido_lineas SET despachada = despachada + v_cant WHERE id = l.id;
  END LOOP;
  SELECT COALESCE(SUM(GREATEST(cantidad - despachada, 0)), 0) INTO v_pend FROM public.pedido_lineas WHERE pedido_id = p_id;
  UPDATE public.pedidos_material
     SET estado = CASE WHEN v_pend <= 0 THEN 'despachado' ELSE 'parcial' END, despachado_por = auth.uid(), despachado_at = NOW()
   WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.despachar_pedido(UUID, JSONB) TO authenticated;

-- Catastro: dónde quedó instalado cada equipo con serie (su último movimiento fue a una OT).
CREATE OR REPLACE VIEW public.equipos_instalados WITH (security_invoker = true) AS
SELECT s.articulo_id, s.serie, s.ot_id, s.created_at AS instalado_at,
       c.descripcion, c.marca, c.modelo, c.garantia,
       o.folio AS ot_folio, o.cliente_id, o.sucursal_id, o.direccion,
       cl.nombre_cliente, su.nombre AS sucursal_nombre
FROM public.series_bodega s
JOIN public.catalogo_items c ON c.id = s.articulo_id
JOIN public.ordenes_trabajo o ON o.id = s.ot_id
LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
LEFT JOIN public.cliente_sucursales su ON su.id = o.sucursal_id
WHERE s.estado = 'instalada';

-- ─── 5. Avances de tareas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarea_avances (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tarea_id    UUID NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL,
  usuario_id  UUID DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarea_avances ON public.tarea_avances(tarea_id, created_at);
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES public.proyectos(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tarea_avance_aviso()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.tareas;
BEGIN
  SELECT * INTO t FROM public.tareas WHERE id = NEW.tarea_id;
  IF t.creado_por IS NOT NULL THEN PERFORM public.notificar_usuario(t.creado_por, 'tarea_avance', 'Avance: ' || t.titulo, left(NEW.texto, 140), '/tareas'); END IF;
  IF t.asignado_id IS NOT NULL AND t.asignado_id IS DISTINCT FROM t.creado_por THEN
    PERFORM public.notificar_usuario(t.asignado_id, 'tarea_avance', 'Avance: ' || t.titulo, left(NEW.texto, 140), '/tareas');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_tarea_avance_aviso ON public.tarea_avances;
CREATE TRIGGER trg_tarea_avance_aviso AFTER INSERT ON public.tarea_avances
  FOR EACH ROW EXECUTE FUNCTION public.tarea_avance_aviso();

-- ─── 6. Personas: competencias, certificaciones y organigrama ────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS jefe_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS area TEXT;

CREATE TABLE IF NOT EXISTS public.competencias (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                TEXT NOT NULL UNIQUE,
  tipo                  TEXT NOT NULL DEFAULT 'habilidad' CHECK (tipo IN ('habilidad','certificacion')),
  requiere_vencimiento  BOOLEAN NOT NULL DEFAULT FALSE,
  descripcion           TEXT,
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.competencias (nombre, tipo, requiere_vencimiento) VALUES
  ('Licencia SEC clase A', 'certificacion', TRUE), ('Licencia SEC clase B', 'certificacion', TRUE),
  ('Licencia SEC clase D', 'certificacion', TRUE), ('Trabajo en altura', 'certificacion', TRUE),
  ('Licencia de conducir clase B', 'certificacion', TRUE), ('Primeros auxilios', 'certificacion', TRUE),
  ('Tableros eléctricos', 'habilidad', FALSE), ('CCTV', 'habilidad', FALSE), ('Control de acceso', 'habilidad', FALSE),
  ('Redes y datos', 'habilidad', FALSE), ('Fotovoltaica', 'habilidad', FALSE)
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.usuario_competencias (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competencia_id  UUID NOT NULL REFERENCES public.competencias(id) ON DELETE CASCADE,
  nivel           SMALLINT CHECK (nivel IS NULL OR nivel BETWEEN 1 AND 5),
  obtenida        DATE,
  vence           DATE,
  documento_path  TEXT,
  nota            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (usuario_id, competencia_id)
);

-- ─── 7. Estado de pago del cliente ───────────────────────────────────────────
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'al_dia';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nota_pago TEXT;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_estado_pago_check;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_estado_pago_check CHECK (estado_pago IN ('al_dia','atrasado','bloqueado'));

-- Enviar una cotización a un cliente bloqueado no se puede (lo demás, sí: es un aviso).
CREATE OR REPLACE FUNCTION public.cot_cliente_al_dia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v TEXT;
BEGIN
  IF NEW.estado = 'Enviada' AND OLD.estado = 'Borrador' THEN
    SELECT estado_pago INTO v FROM public.clientes WHERE id = NEW.cliente_id;
    IF v = 'bloqueado' THEN
      RAISE EXCEPTION 'El cliente está bloqueado por pagos pendientes: habla con Facturación antes de enviarle una cotización.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cot_cliente_al_dia ON public.cotizaciones;
CREATE TRIGGER trg_cot_cliente_al_dia BEFORE UPDATE OF estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cot_cliente_al_dia();

-- ─── 8. Traslados ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bases_salida (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  comuna       TEXT,
  zona_km      NUMERIC(6,1) NOT NULL DEFAULT 0,      -- dentro de esta zona el traslado no se cobra aparte
  casa_matriz  BOOLEAN NOT NULL DEFAULT FALSE,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_casa_matriz ON public.bases_salida ((TRUE)) WHERE casa_matriz;
INSERT INTO public.bases_salida (nombre, comuna, zona_km, casa_matriz)
SELECT 'Casa matriz', 'Santiago', 15, TRUE WHERE NOT EXISTS (SELECT 1 FROM public.bases_salida);

CREATE TABLE IF NOT EXISTS public.tarifa_traslado (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  valor_por_km       NUMERIC(12,2) NOT NULL DEFAULT 600,
  tipo_recargo       TEXT NOT NULL DEFAULT 'porcentaje' CHECK (tipo_recargo IN ('porcentaje','monto')),
  recargo_otra_base  NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.tarifa_traslado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.traslados (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comuna        TEXT NOT NULL,
  region        TEXT,
  base_id       UUID NOT NULL REFERENCES public.bases_salida(id) ON DELETE RESTRICT,
  km            NUMERIC(7,1) NOT NULL CHECK (km >= 0),     -- solo ida
  valor_propio  NUMERIC(14,2),                             -- vacío: km × 2 × valor por km (fuera de la zona)
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_traslado_comuna_base ON public.traslados (lower(comuna), base_id);

-- Lo que se cobra por una visita a una comuna (TecApp `traslados.cotizar`): desde su base más
-- cercana; si el técnico sale de otra, el traslado de esa base con el recargo por otra base.
CREATE OR REPLACE FUNCTION public.cotizar_traslado(p_comuna TEXT, p_base UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE hab RECORD; sal RECORD; t public.tarifa_traslado; v_tras NUMERIC; v_rec NUMERIC := 0; v_det TEXT; v_zona BOOLEAN;
BEGIN
  IF NOT public.tiene_alguno(ARRAY['traslados.ver','traslados.gestionar','cotizaciones.crear']) THEN
    RAISE EXCEPTION 'Sin permiso.' USING ERRCODE = '42501';
  END IF;
  SELECT tr.*, b.nombre AS base_nombre, b.zona_km INTO hab FROM public.traslados tr JOIN public.bases_salida b ON b.id = tr.base_id
   WHERE lower(tr.comuna) = lower(trim(p_comuna)) AND tr.activo ORDER BY tr.km, tr.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '«%» no está en la lista de traslados.', trim(p_comuna) USING ERRCODE = '23514'; END IF;
  sal := hab;
  IF p_base IS NOT NULL AND p_base <> hab.base_id THEN
    SELECT tr.*, b.nombre AS base_nombre, b.zona_km INTO sal FROM public.traslados tr JOIN public.bases_salida b ON b.id = tr.base_id
     WHERE lower(tr.comuna) = lower(trim(p_comuna)) AND tr.base_id = p_base AND tr.activo;
    IF NOT FOUND THEN RAISE EXCEPTION 'No hay traslado desde esa base a «%»: agrégalo a la lista.', trim(p_comuna) USING ERRCODE = '23514'; END IF;
  END IF;
  SELECT * INTO t FROM public.tarifa_traslado WHERE id = 1;
  v_zona := sal.valor_propio IS NULL AND sal.km <= sal.zona_km;
  IF sal.valor_propio IS NOT NULL THEN v_tras := sal.valor_propio; v_det := 'Valor propio de la lista';
  ELSIF v_zona THEN v_tras := 0; v_det := 'Dentro de la zona de ' || sal.base_nombre || ': va en los gastos operacionales';
  ELSE v_tras := round(sal.km * 2 * COALESCE(t.valor_por_km, 0)); v_det := sal.km || ' km × 2 × ' || COALESCE(t.valor_por_km, 0) || ' por km';
  END IF;
  IF sal.id <> hab.id AND t.recargo_otra_base > 0 THEN
    v_rec := CASE WHEN t.tipo_recargo = 'monto' THEN t.recargo_otra_base ELSE round(v_tras * t.recargo_otra_base / 100) END;
  END IF;
  RETURN jsonb_build_object('comuna', hab.comuna, 'base_habitual', hab.base_nombre, 'sale_desde', sal.base_nombre,
    'desde_otra_base', sal.id <> hab.id, 'km', sal.km, 'dentro_de_la_zona', v_zona, 'detalle', v_det,
    'traslado', v_tras, 'recargo', v_rec, 'total', v_tras + v_rec);
END $$;
GRANT EXECUTE ON FUNCTION public.cotizar_traslado(TEXT, UUID) TO authenticated;

-- ─── 9. updated_at, auditoría, acceso y reglas ───────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['proyectos','ot_visitas','informe_plantillas','anticipos','pedidos_material','usuario_competencias'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proyectos','ot_visitas','informe_plantillas','anticipos','pedidos_material','pedido_lineas','tarea_avances',
                           'competencias','usuario_competencias','bases_salida','tarifa_traslado','traslados'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditar()', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
GRANT SELECT ON public.proyecto_resumen, public.anticipo_saldos, public.equipos_instalados TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN
    ('proyectos','ot_visitas','informe_plantillas','anticipos','pedidos_material','pedido_lineas','tarea_avances',
     'competencias','usuario_competencias','bases_salida','tarifa_traslado','traslados') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

CREATE POLICY proyectos_ver ON public.proyectos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['proyectos.ver','proyectos.gestionar'])) OR responsable_id = (SELECT auth.uid()));
CREATE POLICY proyectos_crear ON public.proyectos FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('proyectos.gestionar')));
CREATE POLICY proyectos_editar ON public.proyectos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('proyectos.gestionar')) OR responsable_id = (SELECT auth.uid()));

CREATE POLICY visitas_ver ON public.ot_visitas FOR SELECT TO authenticated USING (public.puede_ver_ot(ot_id) OR (SELECT auth.uid()) = ANY(tecnicos));
CREATE POLICY visitas_crear ON public.ot_visitas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('ot.crear')) AND public.puede_ver_ot(ot_id));
CREATE POLICY visitas_editar ON public.ot_visitas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('ot.crear')) OR ((SELECT auth.uid()) = ANY(tecnicos) AND (SELECT public.tiene_permiso('ot.ejecutar'))));
CREATE POLICY visitas_eliminar ON public.ot_visitas FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('ot.crear')));

CREATE POLICY informe_plantillas_ver ON public.informe_plantillas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['ot.ver','ot.ejecutar','ot.crear'])));
CREATE POLICY informe_plantillas_crear ON public.informe_plantillas FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('ot.crear')));
CREATE POLICY informe_plantillas_editar ON public.informe_plantillas FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('ot.crear')));

CREATE POLICY anticipos_ver ON public.anticipos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar'])));
CREATE POLICY anticipos_crear ON public.anticipos FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('gastos.aprobar')));
CREATE POLICY anticipos_editar ON public.anticipos FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('gastos.aprobar')));

CREATE POLICY pedidos_ver ON public.pedidos_material FOR SELECT TO authenticated
  USING (pedido_por = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['bodega.ver','bodega.mover'])) OR (ot_id IS NOT NULL AND public.puede_ver_ot(ot_id)));
CREATE POLICY pedidos_crear ON public.pedidos_material FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['bodega.mover','ot.ejecutar','ot.crear'])));
CREATE POLICY pedidos_editar ON public.pedidos_material FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('bodega.mover')) OR (pedido_por = (SELECT auth.uid()) AND estado = 'pendiente'));
CREATE POLICY pedido_lineas_ver ON public.pedido_lineas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id));
CREATE POLICY pedido_lineas_crear ON public.pedido_lineas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND p.estado = 'pendiente'
                      AND (p.pedido_por = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('bodega.mover')))));
CREATE POLICY pedido_lineas_eliminar ON public.pedido_lineas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND p.estado = 'pendiente'
                 AND (p.pedido_por = (SELECT auth.uid()) OR (SELECT public.tiene_permiso('bodega.mover')))));

CREATE POLICY avances_ver ON public.tarea_avances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tareas t WHERE t.id = tarea_id));
CREATE POLICY avances_crear ON public.tarea_avances FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tareas t WHERE t.id = tarea_id));

CREATE POLICY competencias_ver ON public.competencias FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY competencias_crear ON public.competencias FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('personas.gestionar')));
CREATE POLICY competencias_editar ON public.competencias FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('personas.gestionar')));
CREATE POLICY ucomp_ver ON public.usuario_competencias FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['personas.ver','personas.gestionar','ot.crear'])));
CREATE POLICY ucomp_crear ON public.usuario_competencias FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('personas.gestionar')));
CREATE POLICY ucomp_editar ON public.usuario_competencias FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('personas.gestionar')));
CREATE POLICY ucomp_eliminar ON public.usuario_competencias FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('personas.gestionar')));

CREATE POLICY bases_ver ON public.bases_salida FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['traslados.ver','traslados.gestionar','cotizaciones.crear'])));
CREATE POLICY bases_crear ON public.bases_salida FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('traslados.gestionar')));
CREATE POLICY bases_editar ON public.bases_salida FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('traslados.gestionar')));
CREATE POLICY tarifa_ver ON public.tarifa_traslado FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['traslados.ver','traslados.gestionar','cotizaciones.crear'])));
CREATE POLICY tarifa_editar ON public.tarifa_traslado FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('traslados.gestionar')));
CREATE POLICY traslados_ver ON public.traslados FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['traslados.ver','traslados.gestionar','cotizaciones.crear'])));
CREATE POLICY traslados_crear ON public.traslados FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('traslados.gestionar')));
CREATE POLICY traslados_editar ON public.traslados FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('traslados.gestionar')));
CREATE POLICY traslados_eliminar ON public.traslados FOR DELETE TO authenticated USING ((SELECT public.tiene_permiso('traslados.gestionar')));

-- Perfiles: el jefe y el área los cambia quien gestiona personas o usuarios (lo vigila
-- profiles_resguardo para activo/correo/rol; esto se suma).
CREATE OR REPLACE FUNCTION public.profiles_organigrama()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.jefe_id IS DISTINCT FROM OLD.jefe_id OR NEW.area IS DISTINCT FROM OLD.area)
     AND NOT public.tiene_alguno(ARRAY['personas.gestionar','usuarios.gestionar']) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el organigrama.' USING ERRCODE = '42501';
  END IF;
  IF NEW.jefe_id = NEW.id THEN RAISE EXCEPTION 'Nadie es su propio jefe.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_organigrama ON public.profiles;
CREATE TRIGGER trg_profiles_organigrama BEFORE UPDATE OF jefe_id, area ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_organigrama();

-- El estado de pago del cliente lo cambia Facturación (o quien edita clientes).
CREATE OR REPLACE FUNCTION public.clientes_estado_pago()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.estado_pago IS DISTINCT FROM OLD.estado_pago OR NEW.nota_pago IS DISTINCT FROM OLD.nota_pago)
     AND NOT public.tiene_alguno(ARRAY['facturacion.gestionar','clientes.crear']) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar el estado de pago.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clientes_estado_pago ON public.clientes;
CREATE TRIGGER trg_clientes_estado_pago BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.clientes_estado_pago();

-- Bodega del técnico: quien es responsable de una bodega la ve aunque no tenga «Ver bodega».
DROP POLICY IF EXISTS bodegas_ver ON public.bodegas;
CREATE POLICY bodegas_ver ON public.bodegas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['bodega.ver','bodega.mover','ot.ejecutar'])) OR responsable_id = (SELECT auth.uid()));

-- Tiempo real para la bitácora y las visitas (si el proyecto tiene Realtime).
DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['ot_notas','ot_visitas','pedidos_material'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
