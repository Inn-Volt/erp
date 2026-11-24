-- ════════════════════════════════════════════════════════════════════════════
-- Fase 24: forma de pago con montos fijos (pesos, UF o dólares) y «el resto».
-- Un cobro del plan ya no es solo un %: puede ser «Anticipo $500.000», «Anticipo 10 UF»,
-- «Anticipo US$ 1.000» o «Saldo: el resto» (lo que falte del total). El plan en JSON suma dos campos
-- opcionales por cobro: "tipo" ('pct' | 'CLP' | 'UF' | 'USD' | 'resto'; sin tipo = 'pct', como antes)
-- y "valor" (el monto fijo en su moneda).
--   1. por_facturar recuerda un cobro fijado en UF o dólares: la cantidad («10 UF»), el valor con
--      que pasó a pesos y de qué día (en Facturación se actualiza a la UF del día al facturar).
--   2. _cot_generar_cobros: cada cobro en %, en $, en UF/US$ (al valor del día) o «el resto», que
--      descuenta lo que ya se creó de los otros cobros (con su monto real) y así cuadra el total.
--      Un plan solo en % se reparte igual que siempre.
--   3. cot_aprobar_con_anticipo: con montos fijos o «el resto», el primer pago queda como monto en
--      pesos y los demás cobros igual.
-- Requiere la fase 23 (hh_indicadores y hh_parametros: la UF y el dólar del día). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Cobros en UF o dólares ───────────────────────────────────────────────
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS moneda       TEXT CHECK (moneda IN ('UF','USD'));
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS monto_moneda NUMERIC(14,4) CHECK (monto_moneda > 0);
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS valor_moneda NUMERIC(12,2) CHECK (valor_moneda > 0);
ALTER TABLE public.por_facturar ADD COLUMN IF NOT EXISTS fecha_valor  DATE;

-- La UF o el dólar más reciente que conoce la base: lo que guarda /api/hh/indicadores cada día que
-- alguien la consulta (la app la pide al aprobar y al terminar un trabajo con cobros en UF o
-- dólares) o la UF de la cotización si es más nueva; si no hay nada, el respaldo de la calculadora HH.
CREATE OR REPLACE FUNCTION public._valor_moneda(p_moneda TEXT, p_uf_cotizacion NUMERIC DEFAULT NULL, p_fecha_uf DATE DEFAULT NULL)
RETURNS TABLE (valor NUMERIC, fecha DATE) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoy DATE := (NOW() AT TIME ZONE 'America/Santiago')::DATE;
BEGIN
  RETURN QUERY
    SELECT x.valor, x.fecha FROM (
      SELECT CASE WHEN p_moneda = 'UF' THEN i.uf ELSE i.usd END AS valor, i.fecha, 1 AS prioridad
      FROM public.hh_indicadores i WHERE i.fecha <= v_hoy
      UNION ALL
      SELECT p_uf_cotizacion, p_fecha_uf, 2
      WHERE p_moneda = 'UF' AND COALESCE(p_uf_cotizacion, 0) > 0 AND p_fecha_uf IS NOT NULL AND p_fecha_uf <= v_hoy
    ) x
    WHERE x.valor > 0
    ORDER BY x.fecha DESC, x.prioridad
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT CASE WHEN p_moneda = 'UF' THEN COALESCE(NULLIF(p_uf_cotizacion, 0), p.uf_respaldo) ELSE p.usd_respaldo END,
           (p.updated_at AT TIME ZONE 'America/Santiago')::DATE
    FROM public.hh_parametros p WHERE p.id = 1;
END $$;
REVOKE EXECUTE ON FUNCTION public._valor_moneda(TEXT, NUMERIC, DATE) FROM PUBLIC, anon, authenticated;

-- Cuánto es en pesos un cobro que no es «el resto» (fuera de un plan solo en %).
CREATE OR REPLACE FUNCTION public._hito_monto(c public.cotizaciones, p_tipo TEXT, p_porcentaje NUMERIC, p_valor NUMERIC, p_total NUMERIC)
RETURNS TABLE (monto NUMERIC, valor NUMERIC, fecha DATE) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
  IF p_tipo = 'pct' THEN
    RETURN QUERY SELECT round(p_total * COALESCE(p_porcentaje, 0) / 100), NULL::NUMERIC, NULL::DATE;
  ELSIF p_tipo = 'CLP' THEN
    RETURN QUERY SELECT round(COALESCE(p_valor, 0)), NULL::NUMERIC, NULL::DATE;
  ELSIF p_tipo IN ('UF', 'USD') THEN
    SELECT * INTO v FROM public._valor_moneda(p_tipo, c.valor_uf, c.fecha_valor_uf);
    RETURN QUERY SELECT round(COALESCE(p_valor, 0) * COALESCE(v.valor, 0)), v.valor, v.fecha;
  ELSE
    RETURN QUERY SELECT 0::NUMERIC, NULL::NUMERIC, NULL::DATE;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._hito_monto(public.cotizaciones, TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- «1.234,5» (hasta 2 decimales, a la chilena) para la glosa del cobro. La máscara usa «,» y «.»
-- literales (no dependen del idioma del servidor) y después se intercambian.
CREATE OR REPLACE FUNCTION public._numero_cl(n NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(rtrim(rtrim(to_char(round(n, 2), 'FM999,999,999,990.00'), '0'), '.'), ',', '·'), '.', ','), '·', '.');
$$;

-- ─── 2. Crear los cobros del plan ────────────────────────────────────────────
-- «Por facturar» le llega a todos los de facturación (como en la fase 15).
CREATE OR REPLACE FUNCTION public._cot_generar_cobros(p_cot UUID, p_cuando TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.cotizaciones; v_plan JSONB; v_total NUMERIC; v_iv TEXT; h RECORD; v_solo_pct BOOLEAN;
  v_monto NUMERIC; v_valor NUMERIC; v_fecha DATE; v_detalle TEXT;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_cot;
  v_total := COALESCE(c.total_clp, c.total, 0);
  v_iv := 'IV-' || lpad(c.folio::TEXT, 4, '0');
  v_plan := public._plan_cobro(c);
  v_solo_pct := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_plan) x WHERE COALESCE(x->>'tipo', 'pct') <> 'pct');
  FOR h IN
    SELECT x.nombre, x.porcentaje, x.cuando, COALESCE(x.tipo, 'pct') AS tipo, x.valor,
           SUM(COALESCE(x.porcentaje, 0)) OVER (ORDER BY x.n) AS acum,
           SUM(COALESCE(x.porcentaje, 0)) OVER (ORDER BY x.n) - COALESCE(x.porcentaje, 0) AS antes
    FROM ROWS FROM (jsonb_to_recordset(v_plan) AS (nombre TEXT, porcentaje NUMERIC, cuando TEXT, tipo TEXT, valor NUMERIC))
         WITH ORDINALITY AS x(nombre, porcentaje, cuando, tipo, valor, n)
  LOOP
    CONTINUE WHEN h.cuando IS DISTINCT FROM p_cuando;
    v_valor := NULL; v_fecha := NULL;
    IF v_solo_pct THEN
      -- Como siempre: sobre el acumulado, para que la suma dé exacta el total.
      CONTINUE WHEN COALESCE(h.porcentaje, 0) <= 0;
      v_monto := round(v_total * h.acum / 100) - round(v_total * h.antes / 100);
      v_detalle := public._numero_cl(h.porcentaje) || ' %';
    ELSIF h.tipo = 'resto' THEN
      -- Lo que falte: el total menos los otros cobros (los ya creados, con su monto de verdad).
      SELECT GREATEST(round(v_total) - COALESCE(SUM(COALESCE(f.monto, m.monto)), 0), 0) INTO v_monto
      FROM jsonb_to_recordset(v_plan) AS o(nombre TEXT, porcentaje NUMERIC, cuando TEXT, tipo TEXT, valor NUMERIC)
      LEFT JOIN public.por_facturar f ON f.cotizacion_id = c.id AND f.hito = o.nombre
      CROSS JOIN LATERAL public._hito_monto(c, COALESCE(o.tipo, 'pct'), o.porcentaje, o.valor, v_total) m
      WHERE COALESCE(o.tipo, 'pct') <> 'resto';
      v_detalle := 'saldo';
    ELSE
      SELECT m.monto, m.valor, m.fecha INTO v_monto, v_valor, v_fecha FROM public._hito_monto(c, h.tipo, h.porcentaje, h.valor, v_total) m;
      v_detalle := CASE h.tipo
        WHEN 'pct' THEN public._numero_cl(h.porcentaje) || ' %'
        WHEN 'CLP' THEN public.clp(h.valor)
        WHEN 'UF' THEN public._numero_cl(h.valor) || ' UF'
        ELSE 'US$ ' || public._numero_cl(h.valor) END;
    END IF;
    CONTINUE WHEN COALESCE(v_monto, 0) <= 0;
    INSERT INTO public.por_facturar (cotizacion_id, cliente_id, descripcion, monto, hito, porcentaje, moneda, monto_moneda, valor_moneda, fecha_valor)
    VALUES (c.id, c.cliente_id, v_iv || ' · ' || h.nombre || ' (' || v_detalle || ') · ' || left(COALESCE(c.titulo, 'Cotización'), 100),
            v_monto, h.nombre, CASE WHEN h.tipo = 'pct' THEN h.porcentaje END,
            CASE WHEN h.tipo IN ('UF', 'USD') THEN h.tipo END, CASE WHEN h.tipo IN ('UF', 'USD') THEN h.valor END, v_valor, v_fecha)
    ON CONFLICT (cotizacion_id, hito) WHERE hito IS NOT NULL DO NOTHING;
    IF FOUND THEN
      PERFORM public.notificar_todos('facturacion.gestionar', 'por_facturar', 'Por facturar: ' || v_iv || ' · ' || h.nombre,
        public.clp(v_monto) || ' · ' || left(COALESCE(c.titulo, ''), 100), '/facturacion');
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public._cot_generar_cobros(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ─── 3. Aprobar fijando el primer pago ───────────────────────────────────────
-- Como en la fase 20 (plan solo en %: el primer pago pasa a %, los demás se reparten lo que queda
-- en su proporción). Con montos fijos o «el resto»: el primer pago queda como monto en pesos, los
-- demás cobros igual y, si ninguno se lleva el resto, se agrega un «Saldo» al terminar.
CREATE OR REPLACE FUNCTION public.cot_aprobar_con_anticipo(p_id UUID, p_como TEXT, p_documento TEXT DEFAULT NULL,
                                                         p_motivo TEXT DEFAULT NULL, p_anticipo NUMERIC DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_plan JSONB; v_total NUMERIC; v_pct NUMERIC; v_resto NUMERIC; v_nombre TEXT; v_nuevo JSONB;
BEGIN
  IF p_anticipo IS NOT NULL THEN
    IF NOT public.tiene_permiso('cotizaciones.aprobar') THEN
      RAISE EXCEPTION 'No tienes permiso para anotar la respuesta del cliente.' USING ERRCODE = '42501';
    END IF;
    c := public._cot_get(p_id);
    IF c.estado <> 'Enviada' THEN RAISE EXCEPTION 'Solo se aprueba una cotización enviada.' USING ERRCODE = '23514'; END IF;
    v_total := COALESCE(c.total_clp, c.total, 0);
    IF p_anticipo < 0 OR p_anticipo > v_total THEN
      RAISE EXCEPTION 'El primer pago va entre $0 y el total de la cotización.' USING ERRCODE = '23514';
    END IF;
    v_plan := public._plan_cobro(c);
    SELECT x->>'nombre' INTO v_nombre FROM jsonb_array_elements(v_plan) x WHERE x->>'cuando' = 'aprobar' LIMIT 1;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_plan) x WHERE COALESCE(x->>'tipo', 'pct') <> 'pct') THEN
      v_nuevo := CASE WHEN round(p_anticipo) > 0
        THEN jsonb_build_array(jsonb_build_object('nombre', COALESCE(v_nombre, 'Anticipo'), 'porcentaje', 0, 'cuando', 'aprobar', 'tipo', 'CLP', 'valor', round(p_anticipo)))
        ELSE '[]'::JSONB END;
      v_nuevo := v_nuevo || COALESCE((SELECT jsonb_agg(x ORDER BY n) FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS e(x, n)
                                      WHERE x->>'cuando' IS DISTINCT FROM 'aprobar'), '[]'::JSONB);
      IF round(p_anticipo) < round(v_total) AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nuevo) x WHERE x->>'tipo' = 'resto') THEN
        v_nuevo := v_nuevo || jsonb_build_array(jsonb_build_object(
          'nombre', CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_nuevo) x WHERE trim(x->>'nombre') = 'Saldo') THEN 'Saldo final' ELSE 'Saldo' END,
          'porcentaje', 0, 'cuando', 'terminar', 'tipo', 'resto'));
      END IF;
    ELSE
      v_pct := CASE WHEN v_total > 0 THEN round(p_anticipo, 0) * 100 / v_total ELSE 0 END;
      SELECT COALESCE(SUM((x->>'porcentaje')::NUMERIC), 0) INTO v_resto FROM jsonb_array_elements(v_plan) x WHERE x->>'cuando' IS DISTINCT FROM 'aprobar';
      v_nuevo := CASE WHEN v_pct > 0 THEN jsonb_build_array(jsonb_build_object('nombre', COALESCE(v_nombre, 'Anticipo'), 'porcentaje', v_pct, 'cuando', 'aprobar'))
                      ELSE '[]'::JSONB END;
      IF v_pct < 100 THEN
        IF v_resto > 0 THEN
          v_nuevo := v_nuevo || (SELECT jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'porcentaje', (x->>'porcentaje')::NUMERIC * (100 - v_pct) / v_resto,
                                                                     'cuando', x->>'cuando') ORDER BY n)
                                 FROM jsonb_array_elements(v_plan) WITH ORDINALITY AS e(x, n) WHERE x->>'cuando' IS DISTINCT FROM 'aprobar');
        ELSE
          v_nuevo := v_nuevo || jsonb_build_array(jsonb_build_object('nombre', 'Saldo', 'porcentaje', 100 - v_pct, 'cuando', 'terminar'));
        END IF;
      END IF;
    END IF;
    PERFORM public._cot_transicion(NULL);
    UPDATE public.cotizaciones SET plan_cobro = v_nuevo WHERE id = c.id;
  END IF;
  PERFORM public.cot_aprobar(p_id, p_como, p_documento, p_motivo);
END $$;
GRANT EXECUTE ON FUNCTION public.cot_aprobar_con_anticipo(UUID, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
