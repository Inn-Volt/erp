-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 3 (traído de TecApp): mejoras del cotizador
--   · Revisiones: si una cotización YA ENVIADA cambia de contenido, se guarda la
--     versión anterior (con todo lo necesario para volver a sacar su PDF) y sube
--     el número de revisión. Así nunca se pierde lo que el cliente recibió.
--   · Portada opcional en el PDF.
--   · Recetas con preguntas: un componente puede ser opcional («¿Incluye canalización?»).
-- Ejecutar DESPUÉS de supabase_fase1_usuarios_permisos.sql (y fase 2). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS revision        SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS incluir_portada BOOLEAN  NOT NULL DEFAULT FALSE;

-- Pregunta de un componente de receta: NULL = fijo; con texto = se pregunta al insertar.
ALTER TABLE public.receta_componentes ADD COLUMN IF NOT EXISTS pregunta TEXT;

CREATE TABLE IF NOT EXISTS public.cotizacion_revisiones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id  UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  revision       SMALLINT NOT NULL,
  datos          JSONB NOT NULL,              -- la cotización tal como estaba (sin la firma del cliente)
  total          NUMERIC(14,2),
  moneda         TEXT,
  creado_por     UUID DEFAULT auth.uid(),     -- quién hizo el cambio que la reemplazó
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cotizacion_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_cot_rev ON public.cotizacion_revisiones(cotizacion_id, revision);

CREATE OR REPLACE FUNCTION public.cotizacion_revisar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Solo importa si el cliente ya la tenía (enviada o abierta por el link).
  IF OLD.enviada_at IS NULL AND OLD.vista_at IS NULL THEN RETURN NEW; END IF;
  IF (NEW.items, NEW.partidas, NEW.total, NEW.subtotal, NEW.descuento_global, NEW.moneda,
      NEW.descripcion_general, NEW.condiciones_servicio, NEW.condiciones_comerciales,
      NEW.ocultar_suministros, NEW.mostrar_detalle, NEW.cliente_id, NEW.empresa_id)
     IS NOT DISTINCT FROM
     (OLD.items, OLD.partidas, OLD.total, OLD.subtotal, OLD.descuento_global, OLD.moneda,
      OLD.descripcion_general, OLD.condiciones_servicio, OLD.condiciones_comerciales,
      OLD.ocultar_suministros, OLD.mostrar_detalle, OLD.cliente_id, OLD.empresa_id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.cotizacion_revisiones (cotizacion_id, revision, datos, total, moneda)
  VALUES (OLD.id, OLD.revision, to_jsonb(OLD) - 'respuesta_firma', OLD.total, OLD.moneda)
  ON CONFLICT (cotizacion_id, revision) DO NOTHING;
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cotizacion_revisar ON public.cotizaciones;
CREATE TRIGGER trg_cotizacion_revisar BEFORE UPDATE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.cotizacion_revisar();
REVOKE EXECUTE ON FUNCTION public.cotizacion_revisar() FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.cotizacion_revisiones TO authenticated;
GRANT ALL ON public.cotizacion_revisiones TO service_role;
ALTER TABLE public.cotizacion_revisiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cot_rev_ver ON public.cotizacion_revisiones;
CREATE POLICY cot_rev_ver ON public.cotizacion_revisiones FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));
-- Sin políticas de escritura: solo el trigger (SECURITY DEFINER) las crea.

-- La vista pública /c/<token> no cambia: el cliente siempre ve la revisión vigente.
