-- ═══════════════════════════════════════════════════════════════════════════════
-- InnVolt ERP · Fase 17: descuento máximo por persona y descuento de la partida
-- · Cada persona puede tener su propio descuento máximo al cotizar (Usuarios). Si una
--   cotización lo pasa, pide la aprobación de quien autoriza, como los umbrales de los
--   ajustes (fase 15). Sin fila para esa persona: sin tope propio (todo sigue como antes).
-- · El descuento propio de una partida (además del de cada línea) cuenta para la aprobación:
--   el descuento de una línea es 1 − (1 − el suyo) × (1 − el de su partida).
--   Un cargo operacional (partida de tipo «cargo») no lleva descuento.
-- Ejecutar DESPUÉS de las fases anteriores (en especial la 15). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.descuentos_maximos (
  usuario_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  maximo          NUMERIC(5,2) NOT NULL CHECK (maximo >= 0 AND maximo <= 100),
  actualizado_por UUID,
  actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.descuentos_maximos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.descuentos_maximos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.descuentos_maximos TO authenticated;

-- Cada uno ve el suyo; quien gestiona usuarios o autoriza descuentos ve todos. Solo quien
-- gestiona usuarios los fija.
DROP POLICY IF EXISTS descuentos_maximos_ver ON public.descuentos_maximos;
CREATE POLICY descuentos_maximos_ver ON public.descuentos_maximos FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.tiene_alguno(ARRAY['usuarios.gestionar','cotizaciones.autorizar'])));
DROP POLICY IF EXISTS descuentos_maximos_crear ON public.descuentos_maximos;
CREATE POLICY descuentos_maximos_crear ON public.descuentos_maximos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('usuarios.gestionar')));
DROP POLICY IF EXISTS descuentos_maximos_cambiar ON public.descuentos_maximos;
CREATE POLICY descuentos_maximos_cambiar ON public.descuentos_maximos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('usuarios.gestionar'))) WITH CHECK ((SELECT public.tiene_permiso('usuarios.gestionar')));
DROP POLICY IF EXISTS descuentos_maximos_quitar ON public.descuentos_maximos;
CREATE POLICY descuentos_maximos_quitar ON public.descuentos_maximos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('usuarios.gestionar')));

-- Queda quién lo fijó y cuándo.
CREATE OR REPLACE FUNCTION public.descuentos_maximos_firma()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actualizado_por := auth.uid();
  NEW.actualizado_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_descuentos_maximos_firma ON public.descuentos_maximos;
CREATE TRIGGER trg_descuentos_maximos_firma BEFORE INSERT OR UPDATE ON public.descuentos_maximos
  FOR EACH ROW EXECUTE FUNCTION public.descuentos_maximos_firma();

-- El descuento más alto de la cotización: el de cada línea junto con el de su partida.
CREATE OR REPLACE FUNCTION public.cot_descuento_mayor(c public.cotizaciones)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  WITH partidas AS (
    SELECT p->>'id' AS id,
           CASE WHEN p->>'tipo' = 'cargo' THEN 0
                ELSE LEAST(GREATEST(COALESCE(NULLIF(p->>'descuento', '')::NUMERIC, 0), 0), 100) END AS pct
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.partidas) = 'array' THEN c.partidas ELSE '[]'::JSONB END) p
  ), lineas AS (
    SELECT LEAST(GREATEST(COALESCE(NULLIF(x->>'descuento', '')::NUMERIC, 0), 0), 100) AS dl,
           COALESCE((SELECT pct FROM partidas WHERE id = x->>'partidaId' LIMIT 1), 0) AS dp
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.items) = 'array' THEN c.items ELSE '[]'::JSONB END) x
  )
  SELECT round(GREATEST(COALESCE(MAX((1 - (1 - dl / 100) * (1 - dp / 100)) * 100), 0), COALESCE(c.descuento_global, 0)), 2)
  FROM lineas;
$$;
GRANT EXECUTE ON FUNCTION public.cot_descuento_mayor(public.cotizaciones) TO authenticated;

-- Un % como se lee en Chile: 14,5 · 20 · 12,25.
CREATE OR REPLACE FUNCTION public.cot_pct_texto(n NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(replace(to_char(round(n, 2), 'FM9990.99'), '.', ','), ',$', '');
$$;

-- Si la cotización necesita aprobación, por qué (NULL = no la necesita). Igual que en la fase
-- 15, más el descuento de la partida y el máximo propio de quien la envía.
CREATE OR REPLACE FUNCTION public.cot_motivo_aprobacion(c public.cotizaciones)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_cotizacion; v_desc NUMERIC; v_util NUMERIC; v_propio NUMERIC; v_motivos TEXT[] := '{}';
BEGIN
  SELECT * INTO a FROM public.ajustes_cotizacion WHERE id = 1;
  v_desc := public.cot_descuento_mayor(c);
  SELECT maximo INTO v_propio FROM public.descuentos_maximos WHERE usuario_id = auth.uid();
  -- El tope que manda es el más bajo de los dos (el de los ajustes y el de la persona).
  IF v_propio IS NOT NULL AND v_desc > v_propio AND (a.descuento_max IS NULL OR v_propio <= a.descuento_max) THEN
    v_motivos := v_motivos || ('Descuento de ' || public.cot_pct_texto(v_desc) || ' % (tu máximo: ' || public.cot_pct_texto(v_propio) || ' %)');
  ELSIF a.descuento_max IS NOT NULL AND v_desc > a.descuento_max THEN
    v_motivos := v_motivos || ('Descuento de ' || public.cot_pct_texto(v_desc) || ' % (máximo sin aprobación: ' || public.cot_pct_texto(a.descuento_max) || ' %)');
  END IF;
  IF a.utilidad_min IS NOT NULL AND COALESCE(c.subtotal, 0) > 0 AND COALESCE(c.costo_directo, 0) > 0 THEN
    v_util := round((c.subtotal - c.costo_directo) / c.subtotal * 100, 1);
    IF v_util < a.utilidad_min THEN
      v_motivos := v_motivos || ('Utilidad de ' || public.cot_pct_texto(v_util) || ' % (mínimo sin aprobación: ' || public.cot_pct_texto(a.utilidad_min) || ' %)');
    END IF;
  END IF;
  RETURN NULLIF(array_to_string(v_motivos, ' · '), '');
END $$;
GRANT EXECUTE ON FUNCTION public.cot_motivo_aprobacion(public.cotizaciones) TO authenticated;

-- Lo aprobado se vuelve a pedir si cambia el precio: el descuento de una partida cambia el
-- subtotal guardado, y eso ya lo revisa trg_cot_aprobacion_reglas (fase 15).
