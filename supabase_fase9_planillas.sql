-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 9: planillas de informe (como TecApp) y varios informes por visita
--   · Las plantillas de informe pasan a ser planillas completas: secciones (pasos), texto,
--     párrafo, número con unidad, fecha, hora, sí/no, una opción, varias opciones, fotos,
--     firma y listas (filas con sus propias columnas: tableros, circuitos…). Cada pregunta
--     puede ser obligatoria, llevar ayuda y mostrarse solo si otra tiene cierto valor.
--     (Todo vive en informe_plantillas.campos, JSONB: no cambia la tabla.)
--   · Informes de la visita (informes_visita): una visita de la agenda puede llevar varios
--     informes, cada uno con su planilla (levantamiento eléctrico, visita de cargador…).
--     El informe único de la fase 8 (agendamientos.informe) se copia acá.
--   · Planilla «Levantamiento eléctrico» con lo esencial (empalme, tableros, mediciones y alcance).
-- Ejecutar DESPUÉS de las fases 1 a 8. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Informes de la visita ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.informes_visita (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  folio            SERIAL UNIQUE,
  agendamiento_id  UUID NOT NULL REFERENCES public.agendamientos(id) ON DELETE CASCADE,
  estado           TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','completado')),
  plantilla_id     UUID REFERENCES public.informe_plantillas(id) ON DELETE SET NULL,
  plantilla_nombre TEXT,
  intro            TEXT,
  campos           JSONB NOT NULL DEFAULT '[]'::JSONB,   -- copia de la planilla al crearlo
  respuestas       JSONB NOT NULL DEFAULT '{}'::JSONB,
  checklist        JSONB NOT NULL DEFAULT '[]'::JSONB,   -- [{texto, ok}]
  creado_por       UUID DEFAULT auth.uid(),
  completado_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_informes_visita_agenda ON public.informes_visita(agendamiento_id);
ALTER TABLE public.informes_visita ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.informes_visita TO authenticated;
GRANT ALL ON public.informes_visita TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

DROP POLICY IF EXISTS informes_visita_ver ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_crear ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_editar ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_eliminar ON public.informes_visita;
CREATE POLICY informes_visita_ver ON public.informes_visita FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['agenda.ver','cotizaciones.ver'])));
CREATE POLICY informes_visita_crear ON public.informes_visita FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('agenda.gestionar')));
CREATE POLICY informes_visita_editar ON public.informes_visita FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')));
CREATE POLICY informes_visita_eliminar ON public.informes_visita FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')));

-- Al completarse: fecha y aviso a quienes ven la agenda (menos a quien lo completó).
CREATE OR REPLACE FUNCTION public.informe_visita_estado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.agendamientos;
BEGIN
  IF NEW.estado = 'completado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'completado') THEN
    NEW.completado_at := COALESCE(NEW.completado_at, NOW());
    SELECT * INTO a FROM public.agendamientos WHERE id = NEW.agendamiento_id;
    PERFORM public.notificar('agenda.ver', 'informe_visita',
      'Informe listo: ' || left(COALESCE(NEW.plantilla_nombre, 'Informe de visita'), 70),
      left(COALESCE(a.titulo, ''), 90) || ' · ' || to_char(a.fecha, 'DD-MM'), '/agenda');
  ELSIF NEW.estado = 'borrador' THEN
    NEW.completado_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_informe_visita_estado ON public.informes_visita;
CREATE TRIGGER trg_informe_visita_estado BEFORE INSERT OR UPDATE OF estado ON public.informes_visita
  FOR EACH ROW EXECUTE FUNCTION public.informe_visita_estado();

DROP TRIGGER IF EXISTS trg_informes_visita_updated ON public.informes_visita;
CREATE TRIGGER trg_informes_visita_updated BEFORE UPDATE ON public.informes_visita
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_auditoria ON public.informes_visita;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.informes_visita
  FOR EACH ROW EXECUTE FUNCTION public.auditar();

-- El informe único de la fase 8 pasa a ser el primer informe de su visita (una sola vez:
-- queda marcado con «migrado» y no se borra).
WITH viejos AS (
  SELECT a.id, a.informe, a.created_by FROM public.agendamientos a
  WHERE a.informe IS NOT NULL AND jsonb_typeof(a.informe) = 'object' AND NOT (a.informe ? 'migrado')
), copiados AS (
  INSERT INTO public.informes_visita (agendamiento_id, estado, plantilla_id, plantilla_nombre, intro, campos, respuestas, checklist, creado_por)
  SELECT v.id, 'borrador',
         (SELECT p.id FROM public.informe_plantillas p WHERE p.id::TEXT = v.informe->>'plantilla_id'),
         v.informe->>'plantilla_nombre', v.informe->>'intro',
         COALESCE(v.informe->'campos', '[]'::JSONB), COALESCE(v.informe->'respuestas', '{}'::JSONB),
         COALESCE(v.informe->'checklist', '[]'::JSONB),
         CASE WHEN v.created_by ~* '^[0-9a-f-]{36}$' THEN v.created_by::UUID END
  FROM viejos v
  RETURNING agendamiento_id
)
UPDATE public.agendamientos a SET informe = a.informe || '{"migrado": true}'::JSONB
FROM copiados c WHERE a.id = c.agendamiento_id;

-- ─── 2. Planilla «Levantamiento eléctrico» ───────────────────────────────────
-- Campos: {clave, etiqueta, tipo, opciones?, unidad?, requerido?, ayuda?, subcampos?, mostrarSi?: {campo, op, valor}}
INSERT INTO public.informe_plantillas (nombre, tipo, tipo_servicio, intro, campos, checklist)
SELECT 'Levantamiento eléctrico', 'visita', NULL,
  'Levantamiento técnico de la instalación eléctrica, para preparar el proyecto y la cotización.',
  $json$[
    {"clave":"s_general","etiqueta":"Datos generales","tipo":"seccion"},
    {"clave":"tipo_trabajo","etiqueta":"Tipo de trabajo","tipo":"seleccion","requerido":true,
     "opciones":["Instalación nueva","Ampliación","Aumento de capacidad","Mantención","Reparación","Certificación SEC","Cargador vehículo eléctrico"]},
    {"clave":"contacto","etiqueta":"Contacto en sitio","tipo":"texto"},

    {"clave":"s_empalme","etiqueta":"Empalme","tipo":"seccion"},
    {"clave":"sistema","etiqueta":"Sistema","tipo":"seleccion","requerido":true,"opciones":["Monofásico","Trifásico"]},
    {"clave":"capacidad_empalme","etiqueta":"Capacidad del empalme","tipo":"numero","unidad":"A"},
    {"clave":"estado_empalme","etiqueta":"Estado del empalme","tipo":"seleccion","opciones":["Bueno","Regular","Malo"]},
    {"clave":"tierra","etiqueta":"¿Tiene puesta a tierra?","tipo":"si_no"},

    {"clave":"s_tableros","etiqueta":"Tableros","tipo":"seccion"},
    {"clave":"tableros","etiqueta":"Tablero","tipo":"lista","ayuda":"Uno por cada tablero revisado.","subcampos":[
      {"clave":"nombre","etiqueta":"Nombre / ubicación","tipo":"texto"},
      {"clave":"proteccion","etiqueta":"Protección general","tipo":"texto"},
      {"clave":"estado","etiqueta":"Estado","tipo":"seleccion","opciones":["Bueno","Regular","Malo"]},
      {"clave":"espacio","etiqueta":"¿Espacio disponible?","tipo":"si_no"}]},
    {"clave":"fotos_tableros","etiqueta":"Fotos del empalme y tableros","tipo":"foto"},

    {"clave":"s_mediciones","etiqueta":"Mediciones","tipo":"seccion"},
    {"clave":"voltaje","etiqueta":"Voltaje","tipo":"numero","unidad":"V"},
    {"clave":"corriente_r","etiqueta":"Corriente R","tipo":"numero","unidad":"A"},
    {"clave":"corriente_s","etiqueta":"Corriente S","tipo":"numero","unidad":"A","mostrarSi":{"campo":"sistema","op":"=","valor":"Trifásico"}},
    {"clave":"corriente_t","etiqueta":"Corriente T","tipo":"numero","unidad":"A","mostrarSi":{"campo":"sistema","op":"=","valor":"Trifásico"}},
    {"clave":"criticos","etiqueta":"Problemas detectados","tipo":"multiseleccion","opciones":["Sobrecarga","Cables recalentados","Sin tierra","Diferenciales defectuosos","Humedad o corrosión","Canalizaciones dañadas","Riesgo eléctrico inmediato"]},

    {"clave":"s_alcance","etiqueta":"Qué hay que hacer","tipo":"seccion"},
    {"clave":"distancia","etiqueta":"Distancia del tablero al punto de trabajo","tipo":"numero","unidad":"m"},
    {"clave":"trabajos","etiqueta":"Trabajos a realizar","tipo":"parrafo","requerido":true},
    {"clave":"observaciones","etiqueta":"Observaciones","tipo":"parrafo","ayuda":"Accesos, horarios, lo que pidió el cliente."},
    {"clave":"fotos","etiqueta":"Fotos","tipo":"foto"}
  ]$json$::JSONB,
  '[]'::JSONB
WHERE NOT EXISTS (SELECT 1 FROM public.informe_plantillas WHERE nombre = 'Levantamiento eléctrico');
