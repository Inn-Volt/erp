-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 16: aviso cada vez que el cliente abre la cotización
-- Antes se avisaba solo la primera vez (vista_at). Ahora cada apertura del enlace queda
-- anotada y cada vez se avisa a los mismos que reciben «El cliente abrió» (quienes cotizan)
-- y al responsable de la cotización. Recargar la página dentro de 2 minutos no cuenta como
-- una apertura nueva. La primera vez sigue avisando como siempre.
-- Si ya la corriste antes (versión con 10 minutos y solo al responsable), córrela de nuevo.
-- Las aperturas van en su propia tabla: no tocan la cotización (ni llenan la auditoría).
-- Ejecutar DESPUÉS de las fases anteriores. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cotizacion_aperturas (
  id            BIGSERIAL PRIMARY KEY,
  cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  navegador     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cot_aperturas ON public.cotizacion_aperturas(cotizacion_id, created_at DESC);
ALTER TABLE public.cotizacion_aperturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cotizacion_aperturas FROM anon;
GRANT SELECT ON public.cotizacion_aperturas TO authenticated;
DROP POLICY IF EXISTS aperturas_ver ON public.cotizacion_aperturas;
CREATE POLICY aperturas_ver ON public.cotizacion_aperturas FOR SELECT TO authenticated
  USING ((SELECT public.tiene_permiso('cotizaciones.ver')));

-- Las que ya se abrieron cuentan como una apertura (la primera).
INSERT INTO public.cotizacion_aperturas (cotizacion_id, created_at)
SELECT c.id, c.vista_at FROM public.cotizaciones c
WHERE c.vista_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cotizacion_aperturas a WHERE a.cotizacion_id = c.id);

-- La llama el servidor (enlace público, con la service role) cada vez que el cliente abre el enlace.
-- Devuelve cuántas veces la ha abierto.
CREATE OR REPLACE FUNCTION public.registrar_apertura_cotizacion(p_cot UUID, p_navegador TEXT DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_ultima TIMESTAMPTZ; v_n INT; v_cli TEXT; v_folio TEXT; v_titulo TEXT; v_cuerpo TEXT;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_cot;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT max(created_at), count(*) INTO v_ultima, v_n FROM public.cotizacion_aperturas WHERE cotizacion_id = p_cot;
  -- Recargar dentro de 2 minutos es la misma apertura.
  IF v_ultima IS NOT NULL AND v_ultima > NOW() - INTERVAL '2 minutes' THEN RETURN v_n; END IF;

  INSERT INTO public.cotizacion_aperturas (cotizacion_id, navegador) VALUES (p_cot, left(p_navegador, 300));
  v_n := v_n + 1;
  -- La primera vez: vista_at (su aviso es el de siempre, a todo el equipo comercial).
  IF c.vista_at IS NULL THEN
    UPDATE public.cotizaciones SET vista_at = NOW() WHERE id = p_cot AND vista_at IS NULL;
    RETURN v_n;
  END IF;
  -- Desde la segunda: el mismo aviso que la primera vez (a quienes cotizan) y al responsable,
  -- aunque no tenga ese permiso (sin repetírselo si ya le llegó).
  SELECT nombre_cliente INTO v_cli FROM public.clientes WHERE id = c.cliente_id;
  v_folio := 'IV-' || lpad(c.folio::TEXT, 4, '0');
  v_titulo := 'El cliente volvió a abrir ' || v_folio;
  v_cuerpo := COALESCE(v_cli, 'El cliente') || ' la abrió por ' || v_n || '.ª vez'
    || CASE c.estado WHEN 'Enviada' THEN ' y aún no responde: buen momento para llamar.' ELSE '.' END;
  PERFORM public.notificar('cotizaciones.crear', 'cotizacion_vista', v_titulo, v_cuerpo, '/cotizador?edit=' || c.id);
  IF c.vendedor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notificaciones WHERE usuario_id = c.vendedor_id AND titulo = v_titulo AND created_at = NOW()) THEN
    PERFORM public.notificar_usuario(c.vendedor_id, 'cotizacion_vista', v_titulo, v_cuerpo, '/cotizador?edit=' || c.id);
  END IF;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_apertura_cotizacion(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_apertura_cotizacion(UUID, TEXT) TO service_role;
