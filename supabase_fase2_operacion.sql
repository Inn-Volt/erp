-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Fase 2 (traído de TecApp): operación después de vender
--   · Órdenes de trabajo (OT) con técnicos, notas e informes técnicos firmados
--   · Por facturar y cobranza   · Bodega (stock, movimientos, series)
--   · Gastos y rendiciones      · Tareas   · Sucursales y contactos de clientes
-- Ejecutar en Supabase > SQL Editor DESPUÉS de supabase_fase1_usuarios_permisos.sql.
-- Se puede ejecutar varias veces.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Permisos nuevos en los roles base (se suman; no se quita nada) ─────────
INSERT INTO public.roles (clave, nombre, descripcion, permisos, protegido) VALUES
  ('comercial', 'Comercial', NULL, ARRAY['ot.ver','ot.crear','facturacion.ver','tareas.ver','tareas.gestionar','clientes.crear'], FALSE),
  ('administrativo', 'Administrativo', NULL, ARRAY['ot.ver','ot.crear','ot.cerrar','facturacion.ver','facturacion.gestionar',
     'bodega.ver','bodega.mover','bodega.ajustar','gastos.crear','gastos.ver_todos','gastos.aprobar','tareas.ver','tareas.gestionar'], FALSE),
  ('tecnico', 'Técnico', NULL, ARRAY['ot.ejecutar','bodega.ver','bodega.mover','gastos.crear'], FALSE),
  ('solo_lectura', 'Solo lectura', NULL, ARRAY['ot.ver','facturacion.ver','bodega.ver','tareas.ver'], FALSE)
ON CONFLICT (clave) DO UPDATE SET
  permisos = CASE WHEN public.roles.protegido THEN ARRAY['*']
                  ELSE ARRAY(SELECT DISTINCT unnest(public.roles.permisos || EXCLUDED.permisos)) END;

-- Aviso a UNA persona (asignaciones).
CREATE OR REPLACE FUNCTION public.notificar_usuario(p_uid UUID, p_tipo TEXT, p_titulo TEXT, p_cuerpo TEXT, p_url TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  SELECT id, p_tipo, p_titulo, p_cuerpo, p_url FROM public.profiles WHERE id = p_uid AND activo
    AND id IS DISTINCT FROM auth.uid();   -- no se avisa a uno mismo
$$;
REVOKE EXECUTE ON FUNCTION public.notificar_usuario(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ─── 1. Órdenes de trabajo ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_trabajo (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio            SERIAL UNIQUE NOT NULL,
  cotizacion_id    UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_id       UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  solicitud_id     UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  titulo           TEXT NOT NULL,
  descripcion      TEXT,
  direccion        TEXT,
  estado           TEXT NOT NULL DEFAULT 'por_coordinar'
                   CHECK (estado IN ('por_coordinar','coordinada','en_progreso','en_pausa','ejecutada','cerrada','anulada')),
  prioridad        TEXT NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  fecha_programada DATE,
  hora_programada  TIME,
  tecnicos         UUID[] NOT NULL DEFAULT '{}',
  motivo           TEXT,                          -- de la pausa o la anulación
  creado_por       UUID DEFAULT auth.uid(),
  ejecutada_at     TIMESTAMPTZ,
  cerrada_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ot_estado ON public.ordenes_trabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ot_cotizacion ON public.ordenes_trabajo(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_ot_tecnicos ON public.ordenes_trabajo USING GIN (tecnicos);

CREATE TABLE IF NOT EXISTS public.ot_notas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ot_id           UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL,
  usuario_id      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ot_notas ON public.ot_notas(ot_id, created_at);

CREATE TABLE IF NOT EXISTS public.informes_ot (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio          SERIAL UNIQUE NOT NULL,
  ot_id          UUID NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','firmado')),
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  trabajos       TEXT,
  resultado      TEXT CHECK (resultado IN ('solucionado','parcial','no_solucionado','segunda_visita')),
  observaciones  TEXT,
  checklist      JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{texto, ok}]
  materiales     JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{descripcion, cantidad, unidad, articulo_id?}]
  fotos          JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{path, caption}]
  recibido_por   TEXT,
  recibido_rut   TEXT,
  firma_path     TEXT,                                 -- PNG privado en ot-archivos
  firmado_at     TIMESTAMPTZ,
  tecnico_id     UUID DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_informes_ot ON public.informes_ot(ot_id);

ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS ot_id UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL;

-- ¿Puede el usuario actual ver/ejecutar esta OT? (todas con «Ver OT»; las suyas como técnico)
CREATE OR REPLACE FUNCTION public.puede_ver_ot(p_ot UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tiene_permiso('ot.ver') OR EXISTS (
    SELECT 1 FROM public.ordenes_trabajo o WHERE o.id = p_ot AND auth.uid() = ANY(o.tecnicos)
      AND public.tiene_permiso('ot.ejecutar'));
$$;
GRANT EXECUTE ON FUNCTION public.puede_ver_ot(UUID) TO authenticated;

-- Al aceptar una cotización nace su OT (una por cotización).
CREATE OR REPLACE FUNCTION public.ot_desde_cotizacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dir TEXT; v_id UUID; v_folio INT;
BEGIN
  IF NEW.estado = 'Aceptado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'Aceptado')
     AND NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE cotizacion_id = NEW.id) THEN
    SELECT direccion INTO v_dir FROM public.clientes WHERE id = NEW.cliente_id;
    INSERT INTO public.ordenes_trabajo (cotizacion_id, cliente_id, solicitud_id, titulo, descripcion, direccion, creado_por)
    VALUES (NEW.id, NEW.cliente_id, NEW.solicitud_id,
            'Cotización IV-' || lpad(NEW.folio::TEXT, 4, '0') || COALESCE(' · ' || left(NULLIF(split_part(NEW.descripcion_general, E'\n', 1), ''), 80), ''),
            NEW.descripcion_general, v_dir, COALESCE(NEW.vendedor_id, auth.uid()))
    RETURNING id, folio INTO v_id, v_folio;
    PERFORM public.notificar('ot.ver', 'ot_nueva', 'Nueva OT-' || lpad(v_folio::TEXT, 4, '0'),
      'Nació de la cotización IV-' || lpad(NEW.folio::TEXT, 4, '0') || ' aceptada. Falta coordinarla.', '/ordenes/' || v_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ot_desde_cotizacion ON public.cotizaciones;
CREATE TRIGGER trg_ot_desde_cotizacion AFTER INSERT OR UPDATE OF estado ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.ot_desde_cotizacion();

-- Reglas de la OT: fechas de ejecución/cierre, cerrar exige permiso, avisar al técnico asignado,
-- y al cerrarla queda «por facturar».
CREATE OR REPLACE FUNCTION public.ot_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t UUID; v_folio TEXT := 'OT-' || lpad(NEW.folio::TEXT, 4, '0');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('cerrada','anulada') AND auth.uid() IS NOT NULL AND NOT public.tiene_permiso('ot.cerrar') THEN
      RAISE EXCEPTION 'No tienes permiso para cerrar o anular órdenes de trabajo.' USING ERRCODE = '42501';
    END IF;
    IF OLD.estado IN ('cerrada','anulada') AND auth.uid() IS NOT NULL AND NOT public.tiene_permiso('ot.cerrar') THEN
      RAISE EXCEPTION 'La OT ya está cerrada.' USING ERRCODE = '42501';
    END IF;
    IF NEW.estado = 'ejecutada' THEN NEW.ejecutada_at := COALESCE(NEW.ejecutada_at, NOW()); END IF;
    IF NEW.estado = 'cerrada' THEN NEW.cerrada_at := NOW(); END IF;
    IF NEW.estado IN ('en_pausa','anulada') AND COALESCE(trim(NEW.motivo), '') = '' THEN
      RAISE EXCEPTION 'Indica el motivo.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.tecnicos IS DISTINCT FROM OLD.tecnicos THEN
    FOREACH t IN ARRAY NEW.tecnicos LOOP
      IF TG_OP = 'INSERT' OR NOT (t = ANY(OLD.tecnicos)) THEN
        PERFORM public.notificar_usuario(t, 'ot_asignada', 'Te asignaron la ' || v_folio, NEW.titulo, '/ordenes/' || NEW.id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ot_reglas ON public.ordenes_trabajo;
CREATE TRIGGER trg_ot_reglas BEFORE INSERT OR UPDATE ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.ot_reglas();

-- ─── 2. Por facturar y cobranza ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.por_facturar (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ot_id            UUID UNIQUE REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  cotizacion_id    UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_id       UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  descripcion      TEXT,
  monto            NUMERIC(14,2) NOT NULL DEFAULT 0,       -- total a cobrar (CLP, con IVA)
  etapa            TEXT NOT NULL DEFAULT 'por_revisar'
                   CHECK (etapa IN ('por_revisar','esperando_oc','esperando_hes','listo','facturado','sin_cobro')),
  sin_cobro_motivo TEXT CHECK (sin_cobro_motivo IN ('garantia','cortesia')),
  numero_oc        TEXT,
  numero_hes       TEXT,
  numero_factura   TEXT,
  fecha_factura    DATE,
  vencimiento      DATE,
  monto_pagado     NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_pago       DATE,
  notas            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_por_facturar_etapa ON public.por_facturar(etapa);

CREATE OR REPLACE FUNCTION public.ot_a_facturar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_monto NUMERIC;
BEGIN
  IF NEW.estado = 'cerrada' AND OLD.estado IS DISTINCT FROM 'cerrada' THEN
    SELECT COALESCE(total_clp, total, 0) INTO v_monto FROM public.cotizaciones WHERE id = NEW.cotizacion_id;
    INSERT INTO public.por_facturar (ot_id, cotizacion_id, cliente_id, descripcion, monto)
    VALUES (NEW.id, NEW.cotizacion_id, NEW.cliente_id, 'OT-' || lpad(NEW.folio::TEXT, 4, '0') || ' · ' || NEW.titulo, COALESCE(v_monto, 0))
    ON CONFLICT (ot_id) DO NOTHING;
    PERFORM public.notificar('facturacion.gestionar', 'por_facturar', 'OT-' || lpad(NEW.folio::TEXT, 4, '0') || ' lista para cobrar',
      NEW.titulo, '/facturacion');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_ot_a_facturar ON public.ordenes_trabajo;
CREATE TRIGGER trg_ot_a_facturar AFTER UPDATE OF estado ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.ot_a_facturar();

-- ─── 3. Bodega ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bodegas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.bodegas (nombre, descripcion) VALUES
  ('Bodega principal', 'Bodega de la empresa'), ('Vehículo', 'Lo que va en la camioneta')
ON CONFLICT (nombre) DO NOTHING;

-- El stock nunca se edita a mano: es la suma de los movimientos.
CREATE TABLE IF NOT EXISTS public.movimientos_bodega (
  id              BIGSERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  articulo_id     UUID NOT NULL REFERENCES public.catalogo_items(id) ON DELETE RESTRICT,
  bodega_id       UUID NOT NULL REFERENCES public.bodegas(id) ON DELETE RESTRICT,
  cantidad        NUMERIC(12,3) NOT NULL CHECK (cantidad <> 0),   -- ajuste puede ser negativo
  costo_unitario  NUMERIC(12,2),
  serie           TEXT,
  ot_id           UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  nota            TEXT,
  usuario_id      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mov_articulo ON public.movimientos_bodega(articulo_id, bodega_id);
CREATE INDEX IF NOT EXISTS idx_mov_ot ON public.movimientos_bodega(ot_id);
CREATE INDEX IF NOT EXISTS idx_mov_serie ON public.movimientos_bodega(serie);

CREATE OR REPLACE FUNCTION public.mov_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock NUMERIC;
BEGIN
  IF NEW.tipo IN ('entrada','salida') AND NEW.cantidad < 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser positiva.' USING ERRCODE = '23514';
  END IF;
  IF NEW.tipo = 'ajuste' AND auth.uid() IS NOT NULL AND NOT public.tiene_permiso('bodega.ajustar') THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar el stock.' USING ERRCODE = '42501';
  END IF;
  IF NEW.tipo = 'salida' THEN
    SELECT COALESCE(SUM(CASE tipo WHEN 'salida' THEN -cantidad ELSE cantidad END), 0) INTO v_stock
    FROM public.movimientos_bodega WHERE articulo_id = NEW.articulo_id AND bodega_id = NEW.bodega_id;
    IF v_stock < NEW.cantidad THEN
      RAISE EXCEPTION 'No hay stock suficiente en esa bodega (hay %).', v_stock USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.costo_unitario IS NULL THEN
    SELECT costo INTO NEW.costo_unitario FROM public.catalogo_items WHERE id = NEW.articulo_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mov_reglas ON public.movimientos_bodega;
CREATE TRIGGER trg_mov_reglas BEFORE INSERT ON public.movimientos_bodega
  FOR EACH ROW EXECUTE FUNCTION public.mov_reglas();

-- Los movimientos no se editan ni se borran: un error se corrige con otro movimiento.
CREATE OR REPLACE FUNCTION public.mov_inmutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Los movimientos de bodega no se modifican: registra uno que lo corrija.' USING ERRCODE = '42501'; END $$;
DROP TRIGGER IF EXISTS trg_mov_inmutable ON public.movimientos_bodega;
CREATE TRIGGER trg_mov_inmutable BEFORE UPDATE OR DELETE ON public.movimientos_bodega
  FOR EACH ROW EXECUTE FUNCTION public.mov_inmutable();

CREATE OR REPLACE VIEW public.stock_bodega WITH (security_invoker = true) AS
SELECT m.articulo_id, m.bodega_id,
       SUM(CASE m.tipo WHEN 'salida' THEN -m.cantidad ELSE m.cantidad END) AS cantidad,
       MAX(m.created_at) AS ultimo_movimiento
FROM public.movimientos_bodega m
GROUP BY m.articulo_id, m.bodega_id;

-- Dónde está cada unidad con número de serie (su último movimiento).
CREATE OR REPLACE VIEW public.series_bodega WITH (security_invoker = true) AS
SELECT DISTINCT ON (m.articulo_id, m.serie)
       m.articulo_id, m.serie, m.bodega_id, m.ot_id, m.tipo AS ultimo_tipo, m.created_at,
       CASE m.tipo WHEN 'salida' THEN (CASE WHEN m.ot_id IS NOT NULL THEN 'instalada' ELSE 'fuera de bodega' END)
                   ELSE 'en bodega' END AS estado
FROM public.movimientos_bodega m
WHERE m.serie IS NOT NULL AND m.serie <> ''
ORDER BY m.articulo_id, m.serie, m.created_at DESC, m.id DESC;

-- ─── 4. Gastos y rendiciones ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gastos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  categoria       TEXT NOT NULL DEFAULT 'otro' CHECK (categoria IN
                  ('combustible','peaje','estacionamiento','materiales','herramientas','alimentacion','transporte','otro')),
  descripcion     TEXT,
  ot_id           UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  usuario_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  boleta_path     TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','reembolsado')),
  revisado_por    UUID,
  revisado_at     TIMESTAMPTZ,
  motivo_rechazo  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_usuario ON public.gastos(usuario_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_ot ON public.gastos(ot_id);

CREATE OR REPLACE FUNCTION public.gastos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT public.tiene_permiso('gastos.aprobar') THEN
      RAISE EXCEPTION 'No tienes permiso para aprobar gastos.' USING ERRCODE = '42501';
    END IF;
    NEW.revisado_por := auth.uid(); NEW.revisado_at := NOW();
    IF NEW.estado = 'rechazado' AND COALESCE(trim(NEW.motivo_rechazo), '') = '' THEN
      RAISE EXCEPTION 'Indica por qué se rechaza.' USING ERRCODE = '23514';
    END IF;
    PERFORM public.notificar_usuario(NEW.usuario_id, 'gasto_' || NEW.estado, 'Tu gasto fue ' || NEW.estado,
      to_char(NEW.monto, 'FM$999G999G999') || COALESCE(' · ' || NEW.descripcion, ''), '/gastos');
  ELSIF OLD.estado <> 'pendiente' AND NOT public.tiene_permiso('gastos.aprobar') THEN
    RAISE EXCEPTION 'Un gasto ya revisado no se puede cambiar.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gastos_reglas ON public.gastos;
CREATE TRIGGER trg_gastos_reglas BEFORE UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.gastos_reglas();

-- ─── 5. Tareas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tareas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  asignado_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creado_por    UUID DEFAULT auth.uid(),
  fecha_limite  DATE,
  prioridad     TEXT NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','hecha','cancelada')),
  ot_id         UUID REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  cliente_id    UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  completada_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado ON public.tareas(asignado_id, estado);

CREATE OR REPLACE FUNCTION public.tareas_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado = 'hecha' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'hecha') THEN NEW.completada_at := NOW(); END IF;
  IF NEW.estado <> 'hecha' THEN NEW.completada_at := NULL; END IF;
  IF NEW.asignado_id IS NOT NULL AND NEW.asignado_id IS DISTINCT FROM auth.uid()
     AND (TG_OP = 'INSERT' OR NEW.asignado_id IS DISTINCT FROM OLD.asignado_id) THEN
    PERFORM public.notificar_usuario(NEW.asignado_id, 'tarea_asignada', 'Nueva tarea: ' || NEW.titulo,
      COALESCE('Para el ' || to_char(NEW.fecha_limite, 'DD-MM'), 'Sin fecha'), '/tareas');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_tareas_reglas ON public.tareas;
CREATE TRIGGER trg_tareas_reglas BEFORE INSERT OR UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_reglas();

-- ─── 6. Clientes: sucursales y contactos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_sucursales (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id  UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  direccion   TEXT,
  comuna      TEXT,
  contacto    TEXT,
  telefono    TEXT,
  notas       TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.cliente_contactos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id  UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  cargo       TEXT,
  email       TEXT,
  telefono    TEXT,
  principal   BOOLEAN NOT NULL DEFAULT FALSE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sucursales_cliente ON public.cliente_sucursales(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contactos_cliente ON public.cliente_contactos(cliente_id);
ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.cliente_sucursales(id) ON DELETE SET NULL;

-- ─── 7. updated_at, auditoría y acceso de la API ─────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ordenes_trabajo','informes_ot','por_facturar','gastos','tareas','cliente_sucursales','cliente_contactos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ordenes_trabajo','ot_notas','informes_ot','por_facturar','bodegas','movimientos_bodega','gastos','tareas',
                           'cliente_sucursales','cliente_contactos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.auditar()', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT SELECT ON public.stock_bodega, public.series_bodega TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ─── 8. Reglas de acceso (RLS) ───────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN
    ('ordenes_trabajo','ot_notas','informes_ot','por_facturar','bodegas','movimientos_bodega','gastos','tareas',
     'cliente_sucursales','cliente_contactos') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
ALTER TABLE public.ordenes_trabajo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_notas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.informes_ot        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.por_facturar       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodegas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_bodega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contactos  ENABLE ROW LEVEL SECURITY;

-- OT: «Ver OT» ve todas; el técnico («Ejecutar OT») ve y avanza las asignadas a él.
CREATE POLICY ot_ver ON public.ordenes_trabajo FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('ot.ver')) OR ((SELECT auth.uid()) = ANY(tecnicos) AND (SELECT public.tiene_permiso('ot.ejecutar'))));
CREATE POLICY ot_crear ON public.ordenes_trabajo FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('ot.crear')));
CREATE POLICY ot_editar ON public.ordenes_trabajo FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['ot.crear','ot.cerrar'])) OR ((SELECT auth.uid()) = ANY(tecnicos) AND (SELECT public.tiene_permiso('ot.ejecutar'))));

CREATE POLICY ot_notas_ver ON public.ot_notas FOR SELECT TO authenticated USING (public.puede_ver_ot(ot_id));
CREATE POLICY ot_notas_crear ON public.ot_notas FOR INSERT TO authenticated WITH CHECK (public.puede_ver_ot(ot_id));

CREATE POLICY informes_ver ON public.informes_ot FOR SELECT TO authenticated USING (public.puede_ver_ot(ot_id));
CREATE POLICY informes_crear ON public.informes_ot FOR INSERT TO authenticated
  WITH CHECK (public.puede_ver_ot(ot_id) AND (SELECT public.tiene_alguno(ARRAY['ot.ejecutar','ot.crear'])));
-- Un informe firmado ya no se edita (salvo quien cierra OT).
CREATE POLICY informes_editar ON public.informes_ot FOR UPDATE TO authenticated
  USING (public.puede_ver_ot(ot_id) AND (estado = 'borrador' OR (SELECT public.tiene_permiso('ot.cerrar'))))
  WITH CHECK (public.puede_ver_ot(ot_id));
CREATE POLICY informes_eliminar ON public.informes_ot FOR DELETE TO authenticated
  USING (estado = 'borrador' AND public.puede_ver_ot(ot_id));

CREATE POLICY facturar_ver ON public.por_facturar FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['facturacion.ver','facturacion.gestionar'])));
CREATE POLICY facturar_crear ON public.por_facturar FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('facturacion.gestionar')));
CREATE POLICY facturar_editar ON public.por_facturar FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('facturacion.gestionar')));

CREATE POLICY bodegas_ver ON public.bodegas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['bodega.ver','bodega.mover'])));
CREATE POLICY bodegas_crear ON public.bodegas FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('bodega.ajustar')));
CREATE POLICY bodegas_editar ON public.bodegas FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('bodega.ajustar')));

CREATE POLICY mov_ver ON public.movimientos_bodega FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['bodega.ver','bodega.mover'])) OR (ot_id IS NOT NULL AND public.puede_ver_ot(ot_id)));
CREATE POLICY mov_crear ON public.movimientos_bodega FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['bodega.mover','bodega.ajustar'])));

-- Gastos: cada uno los suyos; con «Ver todos» o «Aprobar», los de todos.
CREATE POLICY gastos_ver ON public.gastos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar'])));
CREATE POLICY gastos_crear ON public.gastos FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()) AND (SELECT public.tiene_permiso('gastos.crear')));
CREATE POLICY gastos_editar ON public.gastos FOR UPDATE TO authenticated
  USING ((usuario_id = (SELECT auth.uid()) AND estado = 'pendiente') OR (SELECT public.tiene_permiso('gastos.aprobar')));
CREATE POLICY gastos_eliminar ON public.gastos FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()) AND estado = 'pendiente');

-- Tareas: con «Ver tareas» todas; si no, las que me asignaron o creé.
CREATE POLICY tareas_ver ON public.tareas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('tareas.ver')) OR asignado_id = (SELECT auth.uid()) OR creado_por = (SELECT auth.uid()));
CREATE POLICY tareas_crear ON public.tareas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('tareas.gestionar')) OR asignado_id = (SELECT auth.uid()));
CREATE POLICY tareas_editar ON public.tareas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('tareas.gestionar')) OR asignado_id = (SELECT auth.uid()) OR creado_por = (SELECT auth.uid()));

CREATE POLICY sucursales_ver ON public.cliente_sucursales FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['clientes.ver','cotizaciones.ver','ot.ver','ot.ejecutar'])));
CREATE POLICY sucursales_crear ON public.cliente_sucursales FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('clientes.crear')));
CREATE POLICY sucursales_editar ON public.cliente_sucursales FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('clientes.crear')));
CREATE POLICY contactos_ver ON public.cliente_contactos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['clientes.ver','cotizaciones.ver','ot.ver','ot.ejecutar'])));
CREATE POLICY contactos_crear ON public.cliente_contactos FOR INSERT TO authenticated WITH CHECK ((SELECT public.tiene_permiso('clientes.crear')));
CREATE POLICY contactos_editar ON public.cliente_contactos FOR UPDATE TO authenticated USING ((SELECT public.tiene_permiso('clientes.crear')));

-- Clientes: quien trabaja OT también ve los datos del cliente.
DROP POLICY IF EXISTS clientes_ver ON public.clientes;
CREATE POLICY clientes_ver ON public.clientes FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['clientes.ver','cotizaciones.ver','solicitudes.ver','agenda.ver','levantamientos.ver','ot.ver','ot.ejecutar','facturacion.ver'])));
-- El catálogo lo consulta también bodega.
DROP POLICY IF EXISTS catalogo_ver ON public.catalogo_items;
CREATE POLICY catalogo_ver ON public.catalogo_items FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['biblioteca.ver','cotizaciones.crear','bodega.ver','bodega.mover','ot.ejecutar'])));

-- ─── 9. Archivos privados de operación (fotos, firmas, boletas) ──────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('ot-archivos', 'ot-archivos', FALSE)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "otarch_select" ON storage.objects;
CREATE POLICY "otarch_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ot-archivos' AND (SELECT public.tiene_alguno(ARRAY['ot.ver','ot.ejecutar','gastos.crear','gastos.aprobar','gastos.ver_todos'])));
DROP POLICY IF EXISTS "otarch_insert" ON storage.objects;
CREATE POLICY "otarch_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ot-archivos' AND (SELECT public.tiene_alguno(ARRAY['ot.crear','ot.ejecutar','gastos.crear'])));
DROP POLICY IF EXISTS "otarch_delete" ON storage.objects;
CREATE POLICY "otarch_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ot-archivos' AND (SELECT public.tiene_alguno(ARRAY['ot.crear','ot.ejecutar','gastos.crear'])));

-- Tiempo real para el tablero de OT (opcional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ordenes_trabajo') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes_trabajo;
  END IF;
END $$;
