-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Módulo SOLICITUDES
-- Ejecutar en Supabase > SQL Editor  (después de supabase_schema.sql)
--
-- Aditivo: crea la tabla `solicitudes` y agrega UNA columna a `cotizaciones`
-- (solicitud_id) para la relación inversa. No modifica ni elimina nada más.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. SOLICITUDES ───────────────────────────────────────────────────────────
-- Una solicitud es un requerimiento recibido de un cliente que puede convertirse
-- en una o más cotizaciones. Reutiliza la tabla `clientes` existente.
CREATE TABLE IF NOT EXISTS public.solicitudes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio           SERIAL UNIQUE NOT NULL,
  cliente_id      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  contacto        TEXT,
  descripcion     TEXT NOT NULL,
  tipos_servicio  TEXT[] DEFAULT '{}',          -- ej {electricidad, cctv}
  prioridad       TEXT NOT NULL DEFAULT 'Media'
                  CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  fecha_requerida DATE,
  info_adicional  TEXT,
  observaciones   TEXT,
  estado          TEXT NOT NULL DEFAULT 'NUEVA'
                  CHECK (estado IN ('NUEVA','EN_REVISION','ANALIZADA_IA','PENDIENTE_INFO',
                                    'LISTA_COTIZAR','COTIZACION_GENERADA','CERRADA','CANCELADA','NO_VIABLE')),
  -- Resultado estructurado del análisis de IA (necesidades, ítems, faltantes).
  analisis_ia     JSONB,
  -- Cotización principal originada por esta solicitud (relación inversa abajo).
  cotizacion_id   UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  -- Bitácora liviana: [{ fecha, texto }]
  historial       JSONB DEFAULT '[]'::JSONB,
  created_by      TEXT,                          -- email/nombre del usuario actual
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_folio    ON public.solicitudes(folio DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cliente  ON public.solicitudes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado   ON public.solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_created  ON public.solicitudes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cot      ON public.solicitudes(cotizacion_id);

DROP TRIGGER IF EXISTS trg_solicitudes_updated ON public.solicitudes;
CREATE TRIGGER trg_solicitudes_updated
  BEFORE UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. RELACIÓN INVERSA EN COTIZACIONES ─────────────────────────────────────
-- Permite: desde la cotización, ver la solicitud de origen. Nullable → las
-- cotizaciones directas (sin solicitud) siguen funcionando igual.
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_solicitud ON public.cotizaciones(solicitud_id);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solicitudes_all" ON public.solicitudes;
CREATE POLICY "solicitudes_all" ON public.solicitudes
  FOR ALL USING (auth.role() = 'authenticated');
