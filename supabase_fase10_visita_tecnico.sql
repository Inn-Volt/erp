-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 10: el técnico encargado de la visita
--   · La cita de la agenda tiene un técnico encargado (un usuario). Al asignarlo le llega
--     el aviso al celular, y la visita le aparece en Inicio.
--   · El técnico ve SU visita (aunque no vea toda la agenda), crea y llena sus informes con
--     fotos, y la marca como realizada. Editar la cita sigue siendo de quien gestiona la agenda.
-- Ejecutar DESPUÉS de las fases 1 a 9. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agendamientos ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agendamientos_tecnico ON public.agendamientos(tecnico_id, fecha);

-- ¿Es el técnico encargado de esta visita? (SECURITY DEFINER: lo usan políticas de otras tablas)
CREATE OR REPLACE FUNCTION public.es_tecnico_de(p_agenda UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agendamientos WHERE id = p_agenda AND tecnico_id = auth.uid() AND auth.uid() IS NOT NULL);
$$;
GRANT EXECUTE ON FUNCTION public.es_tecnico_de(UUID) TO authenticated;

-- Ve su visita aunque no tenga agenda.ver.
DROP POLICY IF EXISTS agenda_ver ON public.agendamientos;
CREATE POLICY agenda_ver ON public.agendamientos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.ver')) OR tecnico_id = (SELECT auth.uid()));

-- Sus informes: verlos, crearlos, llenarlos y borrarlos.
DROP POLICY IF EXISTS informes_visita_ver ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_crear ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_editar ON public.informes_visita;
DROP POLICY IF EXISTS informes_visita_eliminar ON public.informes_visita;
CREATE POLICY informes_visita_ver ON public.informes_visita FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['agenda.ver','cotizaciones.ver'])) OR public.es_tecnico_de(agendamiento_id));
CREATE POLICY informes_visita_crear ON public.informes_visita FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('agenda.gestionar')) OR public.es_tecnico_de(agendamiento_id));
CREATE POLICY informes_visita_editar ON public.informes_visita FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')) OR public.es_tecnico_de(agendamiento_id));
CREATE POLICY informes_visita_eliminar ON public.informes_visita FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('agenda.gestionar')) OR public.es_tecnico_de(agendamiento_id));

-- Fotos y firmas de sus informes: visitas/<id de la visita>/…
DROP POLICY IF EXISTS "visitas_fotos_tecnico_select" ON storage.objects;
CREATE POLICY "visitas_fotos_tecnico_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'levantamientos-fotos' AND name LIKE 'visitas/%'
         AND CASE WHEN split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$' THEN public.es_tecnico_de(split_part(name, '/', 2)::UUID) ELSE FALSE END);
DROP POLICY IF EXISTS "visitas_fotos_tecnico_insert" ON storage.objects;
CREATE POLICY "visitas_fotos_tecnico_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'levantamientos-fotos' AND name LIKE 'visitas/%'
              AND CASE WHEN split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$' THEN public.es_tecnico_de(split_part(name, '/', 2)::UUID) ELSE FALSE END);

-- Marcar la visita como realizada (el técnico no edita la cita, solo esto).
CREATE OR REPLACE FUNCTION public.visita_realizada(p_agenda UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.tiene_permiso('agenda.gestionar') OR public.es_tecnico_de(p_agenda)) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta visita';
  END IF;
  UPDATE public.agendamientos SET estado = 'Realizada' WHERE id = p_agenda AND estado <> 'Cancelada';
END $$;
REVOKE EXECUTE ON FUNCTION public.visita_realizada(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visita_realizada(UUID) TO authenticated;

-- Aviso al técnico cuando le asignan una visita.
CREATE OR REPLACE FUNCTION public.aviso_visita_asignada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tecnico_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.tecnico_id IS DISTINCT FROM OLD.tecnico_id)
     AND NEW.estado NOT IN ('Cancelada','Realizada') THEN
    PERFORM public.notificar_usuario(NEW.tecnico_id, 'visita_asignada', 'Te asignaron una visita: ' || left(NEW.titulo, 70),
      to_char(NEW.fecha, 'DD-MM') || COALESCE(' a las ' || to_char(NEW.hora_inicio, 'HH24:MI'), '') || COALESCE(' · ' || left(NEW.direccion, 80), ''),
      '/visita/' || NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_aviso_visita_asignada ON public.agendamientos;
CREATE TRIGGER trg_aviso_visita_asignada AFTER INSERT OR UPDATE OF tecnico_id ON public.agendamientos
  FOR EACH ROW EXECUTE FUNCTION public.aviso_visita_asignada();

-- El aviso de informe listo lleva a la visita.
CREATE OR REPLACE FUNCTION public.informe_visita_estado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.agendamientos;
BEGIN
  IF NEW.estado = 'completado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'completado') THEN
    NEW.completado_at := COALESCE(NEW.completado_at, NOW());
    SELECT * INTO a FROM public.agendamientos WHERE id = NEW.agendamiento_id;
    PERFORM public.notificar('agenda.ver', 'informe_visita',
      'Informe listo: ' || left(COALESCE(NEW.plantilla_nombre, 'Informe de visita'), 70),
      left(COALESCE(a.titulo, ''), 90) || ' · ' || to_char(a.fecha, 'DD-MM'), '/visita/' || NEW.agendamiento_id);
  ELSIF NEW.estado = 'borrador' THEN
    NEW.completado_at := NULL;
  END IF;
  RETURN NEW;
END $$;
