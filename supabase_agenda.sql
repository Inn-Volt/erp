-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Módulo AGENDA (agendamientos / visitas)
-- Ejecutar en Supabase > SQL Editor  (después de supabase_schema.sql y
-- supabase_solicitudes.sql)
--
-- Aditivo: crea la tabla `agendamientos`. No modifica nada existente.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agendamientos (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio          SERIAL UNIQUE NOT NULL,
  cliente_id     UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  solicitud_id   UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  titulo         TEXT NOT NULL DEFAULT 'Visita técnica',
  direccion      TEXT,
  fecha          DATE NOT NULL,
  hora_inicio    TIME,
  hora_fin       TIME,
  responsable    TEXT NOT NULL DEFAULT 'Ambos'
                 CHECK (responsable IN ('Cesar','Joaquin','Ambos')),
  tipos_servicio TEXT[] DEFAULT '{}',
  estado         TEXT NOT NULL DEFAULT 'Agendada'
                 CHECK (estado IN ('Agendada','Confirmada','Realizada','Reprogramada','Cancelada')),
  notas          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_fecha       ON public.agendamientos(fecha);
CREATE INDEX IF NOT EXISTS idx_agenda_cliente     ON public.agendamientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agenda_solicitud   ON public.agendamientos(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_agenda_responsable ON public.agendamientos(responsable);
CREATE INDEX IF NOT EXISTS idx_agenda_estado      ON public.agendamientos(estado);

DROP TRIGGER IF EXISTS trg_agenda_updated ON public.agendamientos;
CREATE TRIGGER trg_agenda_updated
  BEFORE UPDATE ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agendamientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_all" ON public.agendamientos;
CREATE POLICY "agenda_all" ON public.agendamientos
  FOR ALL USING (auth.role() = 'authenticated');
