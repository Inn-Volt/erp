-- ══════════════════════════════════════════════════════════════════════════════
-- INNVOLT ERP — Mejoras comerciales
--   1) Seguimiento de cotizaciones   2) Aceptación online del cliente
--   3) Motivo de pérdida             4) Plantillas por tipo de servicio
--   5) Fotos del levantamiento (Storage privado)
-- Ejecutar en Supabase > SQL Editor (después de supabase_schema.sql y
-- supabase_solicitudes.sql). ADITIVO: no borra ni modifica datos existentes y se
-- puede ejecutar varias veces.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. Seguimiento ──────────────────────────────────────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS enviada_at     TIMESTAMPTZ;       -- cuándo se envió al cliente
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS seguimiento_at TIMESTAMPTZ;       -- último seguimiento hecho
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS seguimientos   INTEGER DEFAULT 0; -- cuántos seguimientos

-- ─── 2. Aceptación online ────────────────────────────────────────────────────
-- token_publico: identificador NO adivinable del link que se envía al cliente
-- (/c/<token>). Las filas existentes reciben uno automáticamente.
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS token_publico UUID DEFAULT gen_random_uuid();
UPDATE public.cotizaciones SET token_publico = gen_random_uuid() WHERE token_publico IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizaciones_token ON public.cotizaciones(token_publico);

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS vista_at             TIMESTAMPTZ; -- 1ª vez que el cliente abrió el link
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS respondida_at        TIMESTAMPTZ; -- aceptó/rechazó online
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS respondida_por       TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS respondida_rut       TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS respuesta_comentario TEXT;

-- ─── 3. Motivo de pérdida ────────────────────────────────────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS motivo_perdida      TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS motivo_perdida_nota TEXT;

-- ─── 5. Relación con el levantamiento (fotos en el PDF) ──────────────────────
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS levantamiento_id UUID REFERENCES public.levantamientos(id) ON DELETE SET NULL;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS incluir_fotos    BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_lev ON public.cotizaciones(levantamiento_id);

-- ─── 4. Plantillas por tipo de servicio ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plantillas_cotizacion (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT NOT NULL,
  tipo_servicio TEXT,             -- electricidad, cctv, control_acceso…
  descripcion  TEXT,              -- "Descripción del trabajo"
  garantia     TEXT,
  condiciones  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_plantillas_updated ON public.plantillas_cotizacion;
CREATE TRIGGER trg_plantillas_updated
  BEFORE UPDATE ON public.plantillas_cotizacion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.plantillas_cotizacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plantillas_all" ON public.plantillas_cotizacion;
CREATE POLICY "plantillas_all" ON public.plantillas_cotizacion
  FOR ALL USING (auth.role() = 'authenticated');

-- Plantillas iniciales (solo si la tabla está vacía). Editables desde Configuración.
INSERT INTO public.plantillas_cotizacion (nombre, tipo_servicio, descripcion, garantia, condiciones)
SELECT * FROM (VALUES
  ('Instalación eléctrica', 'electricidad',
   E'Suministro e instalación eléctrica según normativa vigente (NCh Elec. 4/2003 y pliegos SEC):\n- Canalización y cableado de circuitos\n- Protecciones termomagnéticas y diferenciales\n- Pruebas de funcionamiento y aislación\n- Retiro de escombros y limpieza del área de trabajo',
   E'1. Cobertura\n**Mano de obra:** 6 meses desde la entrega.\n**Materiales y equipos:** según garantía del fabricante.\n- No cubre mal uso, sobrecargas ni intervención de terceros.',
   E'1. Condiciones comerciales\n**Validez oferta:** 15 días.\n**Forma de pago:** 50% anticipo y 50% contra entrega.\n**Plazo de ejecución:** a coordinar tras la aceptación.'),
  ('CCTV / Videovigilancia', 'cctv',
   E'Suministro e instalación de sistema de videovigilancia:\n- Cámaras IP con visión nocturna\n- Grabador NVR con disco duro\n- Cableado estructurado y canalización\n- Configuración de acceso remoto en celular\n- Capacitación de uso al cliente',
   E'1. Cobertura\n**Mano de obra:** 6 meses desde la entrega.\n**Cámaras y grabador:** 12 meses según fabricante.\n- No cubre daños por vandalismo, descargas eléctricas ni manipulación de terceros.',
   E'1. Condiciones comerciales\n**Validez oferta:** 15 días.\n**Forma de pago:** 50% anticipo y 50% contra entrega.\n**Plazo de ejecución:** a coordinar tras la aceptación.'),
  ('Control de acceso', 'control_acceso',
   E'Suministro e instalación de sistema de control de acceso:\n- Lectores y controladora\n- Cerradura electromagnética / chapa eléctrica\n- Fuente de poder con respaldo\n- Configuración de usuarios y horarios\n- Capacitación de uso',
   E'1. Cobertura\n**Mano de obra:** 6 meses desde la entrega.\n**Equipos:** según garantía del fabricante.\n- No cubre mal uso ni intervención de terceros.',
   E'1. Condiciones comerciales\n**Validez oferta:** 15 días.\n**Forma de pago:** 50% anticipo y 50% contra entrega.'),
  ('Redes y datos', 'redes',
   E'Suministro e instalación de cableado estructurado:\n- Puntos de red certificados categoría 6\n- Canalización y rotulación\n- Patch panel y organizadores en rack\n- Certificación de puntos y entrega de planos',
   E'1. Cobertura\n**Mano de obra y certificación:** 12 meses desde la entrega.\n- No cubre daños físicos al cableado por terceros.',
   E'1. Condiciones comerciales\n**Validez oferta:** 15 días.\n**Forma de pago:** 50% anticipo y 50% contra entrega.')
) AS v(nombre, tipo_servicio, descripcion, garantia, condiciones)
WHERE NOT EXISTS (SELECT 1 FROM public.plantillas_cotizacion);

-- ─── 5. Storage PRIVADO para fotos de levantamientos ─────────────────────────
-- Privado: las fotos se ven solo con sesión (o mediante links firmados
-- temporales que genera el servidor para el PDF del cliente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('levantamientos-fotos', 'levantamientos-fotos', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "levfotos_auth_select" ON storage.objects;
CREATE POLICY "levfotos_auth_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'levantamientos-fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "levfotos_auth_insert" ON storage.objects;
CREATE POLICY "levfotos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'levantamientos-fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "levfotos_auth_update" ON storage.objects;
CREATE POLICY "levfotos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'levantamientos-fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "levfotos_auth_delete" ON storage.objects;
CREATE POLICY "levfotos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'levantamientos-fotos' AND auth.role() = 'authenticated');
