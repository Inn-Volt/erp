-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 18: imprevistos por tipo (del cotizador de antes)
-- Un colchón sobre el costo (mermas, cortes, sorpresas) con que entra lo nuevo de cada tipo
-- en una cotización: { "material": 5, "mano_obra": 10, "servicio": 0 }. Vacío: sin imprevistos
-- (todo sigue como antes). Se fija en Cotizaciones → Utilidad.
-- Ejecutar DESPUÉS de las fases anteriores. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS imprevistos_por_tipo JSONB;

DO $$ BEGIN
  ALTER TABLE public.ajustes_cotizacion ADD CONSTRAINT ajustes_imprevistos_objeto
    CHECK (imprevistos_por_tipo IS NULL OR jsonb_typeof(imprevistos_por_tipo) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
