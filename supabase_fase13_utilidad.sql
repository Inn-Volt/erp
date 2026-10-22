-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 13: calculadora de utilidad
--   · Los gastos fijos del mes, las ventas del mes y la ganancia que se quiere (para calcular
--     la utilidad mínima de cada cotización): Cotizaciones → Utilidad.
--   · La utilidad por omisión de lo nuevo que se agrega a una cotización, por tipo.
-- Ejecutar DESPUÉS de las fases anteriores. Es idempotente y no borra datos.
-- ═══════════════════════════════════════════════════════════════════════════════

-- {gastos: [{nombre, monto}], ventas_mensuales, ganancia_deseada}
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS estructura_costos JSONB NOT NULL DEFAULT '{}'::JSONB;
-- {material: 25, mano_obra: 48, servicio: 29, operacion: 29}  (utilidad %, sobre el precio)
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS utilidad_por_tipo JSONB NOT NULL DEFAULT '{}'::JSONB;
