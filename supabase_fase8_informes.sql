-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 8: plantillas de informe, acta de entrega y diseño del PDF
--   · Plantillas de informe editables, de dos tipos:
--       visita  → se llena en la visita de la agenda (preguntas + checklist) y pasa a la cotización.
--       entrega → el acta al terminar el trabajo: qué se hizo, fotos y recepción conforme con firma.
--     Cada plantilla: introducción, preguntas (texto, número, sí/no, opciones) y checklist.
--   · Acta de entrega del trabajo (entregas_trabajo): al firmarla, el trabajo queda terminado
--     (y caen los cobros «al terminar»).
--   · Diseño del PDF de cotización (ajustes): color, título, pie y qué bloques se muestran.
--   · Plantillas de cotización con su propia forma de pago.
-- Ejecutar DESPUÉS de las fases 1 a 7. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Plantillas de informe ────────────────────────────────────────────────
ALTER TABLE public.informe_plantillas ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega';
ALTER TABLE public.informe_plantillas DROP CONSTRAINT IF EXISTS informe_plantillas_tipo_check;
ALTER TABLE public.informe_plantillas ADD CONSTRAINT informe_plantillas_tipo_check CHECK (tipo IN ('visita','entrega'));
-- [{clave, etiqueta, tipo: texto|numero|si_no|opciones, opciones?: [..], unidad?}]
ALTER TABLE public.informe_plantillas ADD COLUMN IF NOT EXISTS campos JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.informe_plantillas ADD COLUMN IF NOT EXISTS intro TEXT;   -- texto con formato al comienzo del informe

-- Una plantilla de visita para partir (solo si aún no hay ninguna de visita).
INSERT INTO public.informe_plantillas (nombre, tipo, tipo_servicio, intro, campos, checklist)
SELECT 'Visita técnica', 'visita', NULL,
  'Levantamiento en terreno para preparar la cotización.',
  '[{"clave":"tablero","etiqueta":"Estado del tablero","tipo":"opciones","opciones":["Bueno","Regular","Malo"]},
    {"clave":"empalme","etiqueta":"Empalme y capacidad","tipo":"texto"},
    {"clave":"distancia","etiqueta":"Distancia del tablero al punto","tipo":"numero","unidad":"m"},
    {"clave":"aumento","etiqueta":"¿Requiere aumento de capacidad?","tipo":"si_no"},
    {"clave":"pide","etiqueta":"Qué pide el cliente","tipo":"texto"}]'::JSONB,
  '[{"texto":"Fotos del tablero y del medidor"},{"texto":"Fotos del recorrido de la canalización"},{"texto":"Se confirmó horario y acceso para el trabajo"}]'::JSONB
WHERE NOT EXISTS (SELECT 1 FROM public.informe_plantillas WHERE tipo = 'visita');

-- Ahora las usa la parte comercial (antes, solo las OT).
DROP POLICY IF EXISTS informe_plantillas_ver ON public.informe_plantillas;
DROP POLICY IF EXISTS informe_plantillas_crear ON public.informe_plantillas;
DROP POLICY IF EXISTS informe_plantillas_editar ON public.informe_plantillas;
CREATE POLICY informe_plantillas_ver ON public.informe_plantillas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['agenda.ver','cotizaciones.ver','ot.ver','ot.ejecutar'])));
CREATE POLICY informe_plantillas_crear ON public.informe_plantillas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_alguno(ARRAY['cotizaciones.aprobar','configuracion.gestionar','ot.crear'])));
CREATE POLICY informe_plantillas_editar ON public.informe_plantillas FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['cotizaciones.aprobar','configuracion.gestionar','ot.crear'])));

-- ─── 2. Informe de la visita (en la cita de la agenda) ───────────────────────
-- {plantilla_id, plantilla_nombre, intro, campos (copia), respuestas: {clave: valor}, checklist: [{texto, ok}]}
ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS informe JSONB;

-- ─── 3. Acta de entrega del trabajo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entregas_trabajo (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio            SERIAL UNIQUE,
  cotizacion_id    UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  estado           TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','firmado')),
  fecha            DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Santiago')::DATE,
  plantilla_id     UUID REFERENCES public.informe_plantillas(id) ON DELETE SET NULL,
  plantilla_nombre TEXT,
  intro            TEXT,
  campos           JSONB NOT NULL DEFAULT '[]'::JSONB,   -- copia de las preguntas de la plantilla
  respuestas       JSONB NOT NULL DEFAULT '{}'::JSONB,
  checklist        JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{texto, ok}]
  trabajos         TEXT,                                 -- qué se hizo
  observaciones    TEXT,
  fotos            JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{path, caption}] en levantamientos-fotos/entregas/
  recibido_por     TEXT,
  recibido_rut     TEXT,
  recibido_email   TEXT,
  firma_path       TEXT,
  firmado_at       TIMESTAMPTZ,
  creado_por       UUID DEFAULT auth.uid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entregas_cot ON public.entregas_trabajo(cotizacion_id);
ALTER TABLE public.entregas_trabajo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_trabajo TO authenticated;
GRANT ALL ON public.entregas_trabajo TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

DROP POLICY IF EXISTS entregas_ver ON public.entregas_trabajo;
DROP POLICY IF EXISTS entregas_crear ON public.entregas_trabajo;
DROP POLICY IF EXISTS entregas_editar ON public.entregas_trabajo;
DROP POLICY IF EXISTS entregas_eliminar ON public.entregas_trabajo;
CREATE POLICY entregas_ver ON public.entregas_trabajo FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));
CREATE POLICY entregas_crear ON public.entregas_trabajo FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('cotizaciones.crear'))
              AND EXISTS (SELECT 1 FROM public.cotizaciones c WHERE c.id = cotizacion_id AND c.estado = 'Aprobada'));
-- Un acta firmada ya no se edita (salvo quien aprueba cotizaciones, para reabrirla).
CREATE POLICY entregas_editar ON public.entregas_trabajo FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.crear')) AND (estado = 'borrador' OR (SELECT public.tiene_permiso('cotizaciones.aprobar'))));
CREATE POLICY entregas_eliminar ON public.entregas_trabajo FOR DELETE TO authenticated
  USING (estado = 'borrador' AND (SELECT public.tiene_permiso('cotizaciones.crear')));

-- Al firmarse: el trabajo queda terminado (caen los cobros «al terminar») y llega el aviso.
CREATE OR REPLACE FUNCTION public.entrega_firmada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  IF NEW.estado = 'firmado' AND OLD.estado IS DISTINCT FROM 'firmado' THEN
    SELECT * INTO c FROM public.cotizaciones WHERE id = NEW.cotizacion_id;
    UPDATE public.cotizaciones SET trabajo_estado = 'terminado'
     WHERE id = NEW.cotizacion_id AND estado = 'Aprobada' AND trabajo_estado IS DISTINCT FROM 'terminado';
    PERFORM public.notificar('cotizaciones.ver', 'entrega_firmada',
      'Acta de entrega firmada · IV-' || lpad(c.folio::TEXT, 4, '0'),
      COALESCE('Recibió ' || NEW.recibido_por, 'Recepción conforme') || ' · ' || left(COALESCE(c.titulo, ''), 90),
      '/cotizador?edit=' || NEW.cotizacion_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_entrega_firmada ON public.entregas_trabajo;
CREATE TRIGGER trg_entrega_firmada AFTER UPDATE OF estado ON public.entregas_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.entrega_firmada();

DROP TRIGGER IF EXISTS trg_entregas_trabajo_updated ON public.entregas_trabajo;
CREATE TRIGGER trg_entregas_trabajo_updated BEFORE UPDATE ON public.entregas_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_auditoria ON public.entregas_trabajo;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.entregas_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.auditar();

-- Fotos y firma del acta: bucket privado de siempre, carpeta entregas/.
DROP POLICY IF EXISTS "entregas_fotos_insert" ON storage.objects;
CREATE POLICY "entregas_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'levantamientos-fotos' AND name LIKE 'entregas/%' AND (SELECT public.tiene_permiso('cotizaciones.crear')));
DROP POLICY IF EXISTS "entregas_fotos_delete" ON storage.objects;
CREATE POLICY "entregas_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND name LIKE 'entregas/%' AND (SELECT public.tiene_permiso('cotizaciones.crear')));

-- ─── 4. Diseño del PDF de cotización ─────────────────────────────────────────
-- {color, titulo, pie, mostrar_forma_pago, mostrar_importante, mostrar_como_aceptar, mostrar_banco, mostrar_firmas}
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS pdf_diseno JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ─── 5. Plantillas de cotización con su forma de pago ────────────────────────
ALTER TABLE public.plantillas_cotizacion ADD COLUMN IF NOT EXISTS plan_cobro JSONB;   -- vacío: el de los ajustes
