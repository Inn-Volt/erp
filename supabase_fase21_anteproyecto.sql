-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 21: anteproyecto (presupuesto de ejecución) y detalle de boletas y facturas
-- Tres capas por partida: lo que se COBRÓ (la cotización), lo PRESUPUESTADO (el anteproyecto) y
-- lo REAL (gastos, compras y mano de obra).
--   · presupuesto_lineas: el presupuesto de ejecución del trabajo, línea por línea. Nace copiando
--     las líneas de la cotización (la app lo arma la primera vez) y se edita libremente:
--     cantidades y costos, materiales no cotizados (adicionales), mano de obra en días por persona
--     del equipo y gastos de operación estimados.
--   · documento_lineas: el detalle de una compra o de un gasto (lo lee la IA de la boleta o la
--     factura y se revisa antes de guardar). Cada línea va a su partida y, si corresponde, a la
--     línea del presupuesto que compra; si no, es «no cotizada». El costo del documento se reparte
--     entre sus líneas en proporción a sus montos (así cuadra con el neto de la factura o el total
--     de la boleta, y con cotizacion_resultado). Cuando lo comprado completa un material, su fila
--     de la lista de seguimiento del trabajo (trabajo_materiales) pasa a «comprado».
-- Ejecutar DESPUÉS de la fase 20. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Presupuesto de ejecución ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.presupuesto_lineas (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id  UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  partida_id     TEXT,                    -- id en cotizaciones.partidas (vacío = sin partida)
  tipo           TEXT NOT NULL DEFAULT 'material' CHECK (tipo IN ('material','mano_obra','servicio','operacion')),
  descripcion    TEXT NOT NULL CHECK (trim(descripcion) <> ''),
  unidad         TEXT,
  cantidad       NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (cantidad >= 0),
  costo_unitario NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),   -- en pesos, neto
  linea_id       TEXT,                    -- la línea de la cotización de la que nació (vacío = agregada)
  trabajador_id  UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,      -- mano de obra: la persona (cantidad = días)
  orden          INT NOT NULL DEFAULT 0,
  nota           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presupuesto_cot ON public.presupuesto_lineas(cotizacion_id, partida_id, orden);
-- Copiar la cotización dos veces (dos personas a la vez) no duplica líneas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_presupuesto_origen ON public.presupuesto_lineas(cotizacion_id, linea_id) WHERE linea_id IS NOT NULL;
ALTER TABLE public.presupuesto_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presupuesto_lineas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presupuesto_lineas TO authenticated;
DROP POLICY IF EXISTS presupuesto_ver ON public.presupuesto_lineas;
CREATE POLICY presupuesto_ver ON public.presupuesto_lineas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.ver_costos','gastos.aprobar'])));
DROP POLICY IF EXISTS presupuesto_escribir ON public.presupuesto_lineas;
CREATE POLICY presupuesto_escribir ON public.presupuesto_lineas FOR ALL TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','gastos.aprobar'])))
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['cotizaciones.crear','gastos.aprobar'])));
DROP TRIGGER IF EXISTS trg_presupuesto_updated ON public.presupuesto_lineas;
CREATE TRIGGER trg_presupuesto_updated BEFORE UPDATE ON public.presupuesto_lineas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/** Las líneas del presupuesto para asignarles lo comprado (sin costos): para quien rinde o ingresa compras. */
CREATE OR REPLACE FUNCTION public.presupuesto_para_asignar(p_cot UUID)
RETURNS TABLE (id UUID, partida_id TEXT, tipo TEXT, descripcion TEXT, unidad TEXT, cantidad NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.partida_id, l.tipo, l.descripcion, l.unidad, l.cantidad
  FROM public.presupuesto_lineas l
  WHERE l.cotizacion_id = p_cot
    AND public.tiene_alguno(ARRAY['gastos.crear','gastos.aprobar','compras.gestionar','cotizaciones.ver_costos'])
  ORDER BY l.partida_id NULLS LAST, l.orden, l.descripcion;
$$;
GRANT EXECUTE ON FUNCTION public.presupuesto_para_asignar(UUID) TO authenticated;

-- ─── 2. Detalle de compras y gastos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documento_lineas (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_id            UUID REFERENCES public.compras(id) ON DELETE CASCADE,
  gasto_id             UUID REFERENCES public.gastos(id) ON DELETE CASCADE,
  partida_id           TEXT,
  presupuesto_linea_id UUID REFERENCES public.presupuesto_lineas(id) ON DELETE SET NULL,   -- vacío = no cotizada
  tipo                 TEXT NOT NULL DEFAULT 'material' CHECK (tipo IN ('material','mano_obra','servicio','operacion')),
  descripcion          TEXT NOT NULL CHECK (trim(descripcion) <> ''),
  cantidad             NUMERIC(12,3) CHECK (cantidad >= 0),
  unidad               TEXT,
  monto                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monto >= 0),   -- tal como aparece en el documento
  orden                INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((compra_id IS NULL) <> (gasto_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_doc_lineas_compra ON public.documento_lineas(compra_id) WHERE compra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_lineas_gasto ON public.documento_lineas(gasto_id) WHERE gasto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_lineas_presupuesto ON public.documento_lineas(presupuesto_linea_id) WHERE presupuesto_linea_id IS NOT NULL;
ALTER TABLE public.documento_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documento_lineas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documento_lineas TO authenticated;
-- Las mismas reglas que el documento: las de una compra, quien ve o gestiona compras; las de un
-- gasto, quien lo rindió (mientras está rendido u observado) o quien paga las rendiciones.
DROP POLICY IF EXISTS doc_lineas_ver ON public.documento_lineas;
CREATE POLICY doc_lineas_ver ON public.documento_lineas FOR SELECT TO authenticated
  USING ((compra_id IS NOT NULL AND (SELECT public.tiene_alguno(ARRAY['compras.ver','compras.gestionar','cotizaciones.ver_costos'])))
      OR (gasto_id IS NOT NULL AND ((SELECT public.tiene_alguno(ARRAY['gastos.ver_todos','gastos.aprobar','cotizaciones.ver_costos']))
                                    OR EXISTS (SELECT 1 FROM public.gastos g WHERE g.id = gasto_id AND g.usuario_id = (SELECT auth.uid())))));
DROP POLICY IF EXISTS doc_lineas_escribir ON public.documento_lineas;
CREATE POLICY doc_lineas_escribir ON public.documento_lineas FOR ALL TO authenticated
  USING ((compra_id IS NOT NULL AND (SELECT public.tiene_permiso('compras.gestionar')))
      OR (gasto_id IS NOT NULL AND ((SELECT public.tiene_permiso('gastos.aprobar'))
                                    OR EXISTS (SELECT 1 FROM public.gastos g WHERE g.id = gasto_id AND g.usuario_id = (SELECT auth.uid()) AND g.estado IN ('rendido','observado')))))
  WITH CHECK ((compra_id IS NOT NULL AND (SELECT public.tiene_permiso('compras.gestionar')))
      OR (gasto_id IS NOT NULL AND ((SELECT public.tiene_permiso('gastos.aprobar'))
                                    OR EXISTS (SELECT 1 FROM public.gastos g WHERE g.id = gasto_id AND g.usuario_id = (SELECT auth.uid()) AND g.estado IN ('rendido','observado')))));

-- La línea del presupuesto tiene que ser del mismo trabajo que el documento.
CREATE OR REPLACE FUNCTION public.documento_lineas_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cot UUID;
BEGIN
  IF NEW.presupuesto_linea_id IS NOT NULL THEN
    v_cot := COALESCE((SELECT cotizacion_id FROM public.compras WHERE id = NEW.compra_id),
                      (SELECT cotizacion_id FROM public.gastos WHERE id = NEW.gasto_id));
    IF v_cot IS NULL OR NOT EXISTS (SELECT 1 FROM public.presupuesto_lineas WHERE id = NEW.presupuesto_linea_id AND cotizacion_id = v_cot) THEN
      RAISE EXCEPTION 'Esa línea del presupuesto no es del trabajo del documento.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.documento_lineas_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_documento_lineas_reglas ON public.documento_lineas;
CREATE TRIGGER trg_documento_lineas_reglas BEFORE INSERT OR UPDATE ON public.documento_lineas
  FOR EACH ROW EXECUTE FUNCTION public.documento_lineas_reglas();

-- Lo comprado marca el material en la lista de seguimiento del trabajo (la de los técnicos, sin
-- precios): cuando lo comprado completa lo presupuestado, «por comprar» pasa a «comprado».
CREATE OR REPLACE FUNCTION public.documento_lineas_marcar_comprado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.presupuesto_lineas;
BEGIN
  IF NEW.presupuesto_linea_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.presupuesto_lineas WHERE id = NEW.presupuesto_linea_id;
  IF NOT FOUND OR l.linea_id IS NULL OR l.tipo <> 'material' THEN RETURN NULL; END IF;
  IF (SELECT COALESCE(SUM(cantidad), 0) FROM public.documento_lineas WHERE presupuesto_linea_id = l.id) >= l.cantidad THEN
    UPDATE public.trabajo_materiales SET estado = 'comprado'
     WHERE cotizacion_id = l.cotizacion_id AND linea_id = l.linea_id AND estado = 'pendiente';
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.documento_lineas_marcar_comprado() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_documento_lineas_comprado ON public.documento_lineas;
CREATE TRIGGER trg_documento_lineas_comprado AFTER INSERT OR UPDATE OF presupuesto_linea_id, cantidad ON public.documento_lineas
  FOR EACH ROW EXECUTE FUNCTION public.documento_lineas_marcar_comprado();
