-- ════════════════════════════════════════════════════════════════════════════
-- Fase 25: cobranza con abonos libres (la facturación queda en pausa).
-- Cada trabajo (cotización aprobada) es una cuenta corriente: total, abonos y saldo. Los abonos son
-- libres (1,5M hoy, 500k mañana…); el plan de cobro queda como guía de lo que se espera y cuándo.
--   1. abonos: cada pago que entra (fecha, monto, medio, comprobante, quién lo anotó).
--   2. Ajustes: facturación activa (por omisión NO: las etapas OC/HES/factura quedan en pausa) y el
--      % de PPM que se descuenta de lo abonado (lo define el contador; por omisión 0).
--   3. Lo que se espera de cada cobro del plan (_montos_plan) y el anticipo pendiente según los abonos.
--   4. Con la facturación en pausa, aprobar o terminar no crea filas en «Por facturar».
--   5. cotizacion_resultado.cobrado = los abonos (más los pagos que se anotaron antes en «Por facturar»).
--   6. Los pagos ya anotados en «Por facturar» pasan a ser abonos (una vez).
-- Requiere las fases 15, 20 y 24. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Abonos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.abonos (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id          UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE RESTRICT,
  fecha                  DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Santiago')::DATE),
  monto                  NUMERIC(14,0) NOT NULL CHECK (monto > 0),
  medio                  TEXT NOT NULL DEFAULT 'transferencia' CHECK (medio IN ('transferencia','efectivo','cheque','tarjeta','otro')),
  referencia             TEXT,                -- N° de operación, de cheque…
  nota                   TEXT,
  comprobante_path       TEXT,                -- foto o PDF en el bucket «abonos»
  movimiento_banco_id    UUID UNIQUE REFERENCES public.movimientos_banco(id) ON DELETE SET NULL,
  origen_por_facturar_id UUID UNIQUE REFERENCES public.por_facturar(id) ON DELETE SET NULL,   -- traído de «Por facturar»
  created_by             UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abonos_cotizacion ON public.abonos(cotizacion_id, fecha);
CREATE INDEX IF NOT EXISTS idx_abonos_fecha ON public.abonos(fecha DESC);
ALTER TABLE public.movimientos_banco ADD COLUMN IF NOT EXISTS abono_id UUID REFERENCES public.abonos(id) ON DELETE SET NULL;

-- Solo a una cotización aprobada; la fecha no puede ser futura.
CREATE OR REPLACE FUNCTION public.abonos_reglas()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE id = NEW.cotizacion_id AND estado = 'Aprobada') THEN
    RAISE EXCEPTION 'Los abonos van a una cotización aprobada.' USING ERRCODE = '23514';
  END IF;
  IF NEW.fecha > (NOW() AT TIME ZONE 'America/Santiago')::DATE THEN
    RAISE EXCEPTION 'La fecha del abono no puede ser futura.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.abonos_reglas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_abonos_reglas ON public.abonos;
CREATE TRIGGER trg_abonos_reglas BEFORE INSERT OR UPDATE ON public.abonos FOR EACH ROW EXECUTE FUNCTION public.abonos_reglas();

-- Aviso a quien ve la cobranza.
CREATE OR REPLACE FUNCTION public.aviso_abono()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones;
BEGIN
  IF NEW.origen_por_facturar_id IS NOT NULL THEN RETURN NULL; END IF;   -- traído de antes: sin aviso
  SELECT * INTO c FROM public.cotizaciones WHERE id = NEW.cotizacion_id;
  PERFORM public.notificar('facturacion.ver', 'abono_recibido',
    'Abono: IV-' || lpad(c.folio::TEXT, 4, '0') || ' · ' || public.clp(NEW.monto),
    left(COALESCE(c.titulo, ''), 100), '/facturacion');
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.aviso_abono() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_aviso_abono ON public.abonos;
CREATE TRIGGER trg_aviso_abono AFTER INSERT ON public.abonos FOR EACH ROW EXECUTE FUNCTION public.aviso_abono();

-- Ver: quien ve la cobranza o los costos del trabajo (el análisis de proyecto). Anotar: cobranza.
ALTER TABLE public.abonos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.abonos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abonos TO authenticated;
DROP POLICY IF EXISTS abonos_ver ON public.abonos;
CREATE POLICY abonos_ver ON public.abonos FOR SELECT TO authenticated
  USING ((SELECT public.tiene_alguno(ARRAY['facturacion.ver','facturacion.gestionar','cotizaciones.ver_costos'])));
DROP POLICY IF EXISTS abonos_crear ON public.abonos;
CREATE POLICY abonos_crear ON public.abonos FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('facturacion.gestionar')));
DROP POLICY IF EXISTS abonos_cambiar ON public.abonos;
CREATE POLICY abonos_cambiar ON public.abonos FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('facturacion.gestionar'))) WITH CHECK ((SELECT public.tiene_permiso('facturacion.gestionar')));
DROP POLICY IF EXISTS abonos_borrar ON public.abonos;
CREATE POLICY abonos_borrar ON public.abonos FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('facturacion.gestionar')));

DROP TRIGGER IF EXISTS trg_auditoria ON public.abonos;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.abonos FOR EACH ROW EXECUTE FUNCTION public.auditar();

-- Comprobante (foto o PDF) de cada abono.
INSERT INTO storage.buckets (id, name, public) VALUES ('abonos', 'abonos', FALSE) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "abonos_archivo_ver" ON storage.objects;
CREATE POLICY "abonos_archivo_ver" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'abonos' AND (SELECT public.tiene_alguno(ARRAY['facturacion.ver','facturacion.gestionar'])));
DROP POLICY IF EXISTS "abonos_archivo_subir" ON storage.objects;
CREATE POLICY "abonos_archivo_subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'abonos' AND (SELECT public.tiene_permiso('facturacion.gestionar')));
DROP POLICY IF EXISTS "abonos_archivo_borrar" ON storage.objects;
CREATE POLICY "abonos_archivo_borrar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'abonos' AND (SELECT public.tiene_permiso('facturacion.gestionar')));

-- ─── 2. Ajustes de cobranza ──────────────────────────────────────────────────
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS facturacion_activa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ajustes_cotizacion ADD COLUMN IF NOT EXISTS ppm_pct NUMERIC(5,3) NOT NULL DEFAULT 0 CHECK (ppm_pct >= 0 AND ppm_pct <= 10);

-- ─── 3. Lo que se espera de cada cobro del plan ─────────────────────────────
-- Igual que montosHitos (lib/cotizador/planCobro.ts): solo en %, sobre el acumulado; con montos
-- fijos o «el resto», cada uno lo suyo (UF y dólares al valor del día) y el resto lo que falte.
CREATE OR REPLACE FUNCTION public._montos_plan(c public.cotizaciones)
RETURNS TABLE (n BIGINT, nombre TEXT, cuando TEXT, monto NUMERIC) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan JSONB := public._plan_cobro(c); v_total NUMERIC := round(COALESCE(c.total_clp, c.total, 0));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_plan) x WHERE COALESCE(x->>'tipo', 'pct') <> 'pct') THEN
    RETURN QUERY
      SELECT x.n, x.nombre, x.cuando,
             round(v_total * SUM(COALESCE(x.porcentaje, 0)) OVER (ORDER BY x.n) / 100)
             - round(v_total * (SUM(COALESCE(x.porcentaje, 0)) OVER (ORDER BY x.n) - COALESCE(x.porcentaje, 0)) / 100)
      FROM ROWS FROM (jsonb_to_recordset(v_plan) AS (nombre TEXT, porcentaje NUMERIC, cuando TEXT))
           WITH ORDINALITY AS x(nombre, porcentaje, cuando, n);
    RETURN;
  END IF;
  RETURN QUERY
    WITH h AS (
      SELECT x.n, x.nombre, x.cuando, COALESCE(x.tipo, 'pct') AS tipo,
             CASE WHEN COALESCE(x.tipo, 'pct') = 'resto' THEN 0 ELSE (SELECT m.monto FROM public._hito_monto(c, COALESCE(x.tipo, 'pct'), x.porcentaje, x.valor, v_total) m) END AS propio
      FROM ROWS FROM (jsonb_to_recordset(v_plan) AS (nombre TEXT, porcentaje NUMERIC, cuando TEXT, tipo TEXT, valor NUMERIC))
           WITH ORDINALITY AS x(nombre, porcentaje, cuando, tipo, valor, n)
    )
    SELECT h.n, h.nombre, h.cuando,
           CASE WHEN h.tipo = 'resto' THEN GREATEST(v_total - (SELECT COALESCE(SUM(o.propio), 0) FROM h o WHERE o.tipo <> 'resto'), 0) ELSE h.propio END
    FROM h;
END $$;
REVOKE EXECUTE ON FUNCTION public._montos_plan(public.cotizaciones) FROM PUBLIC, anon, authenticated;

-- Lo pagado de un trabajo: los abonos y, de antes, lo anotado en «Por facturar» que no pasó a abono.
CREATE OR REPLACE FUNCTION public._pagado_trabajo(p_cot UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT SUM(a.monto) FROM public.abonos a WHERE a.cotizacion_id = p_cot), 0)
       + COALESCE((SELECT SUM(f.monto_pagado) FROM public.por_facturar f
                   WHERE f.cotizacion_id = p_cot AND f.etapa <> 'sin_cobro' AND COALESCE(f.monto_pagado, 0) > 0
                     AND NOT EXISTS (SELECT 1 FROM public.abonos a WHERE a.origen_por_facturar_id = f.id)), 0);
$$;
REVOKE EXECUTE ON FUNCTION public._pagado_trabajo(UUID) FROM PUBLIC, anon, authenticated;

-- El anticipo que falta: lo que el plan espera «al aprobar» menos lo pagado (abonos libres).
CREATE OR REPLACE FUNCTION public.anticipo_pendiente(p_cot UUID)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cotizaciones; v_esperado NUMERIC;
BEGIN
  SELECT * INTO c FROM public.cotizaciones WHERE id = p_cot;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT COALESCE(SUM(m.monto), 0) INTO v_esperado FROM public._montos_plan(c) m WHERE m.cuando = 'aprobar';
  RETURN GREATEST(v_esperado - public._pagado_trabajo(p_cot), 0);
END $$;
GRANT EXECUTE ON FUNCTION public.anticipo_pendiente(UUID) TO authenticated;

-- ─── 4. Con la facturación en pausa no se crean cobros en «Por facturar» ─────
-- Misma función de la fase 24, con la pausa al principio.
CREATE OR REPLACE FUNCTION public._cot_generar_cobros(p_cot UUID, p_cuando TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.cotizaciones; v_plan JSONB; v_total NUMERIC; v_iv TEXT; h RECORD; v_solo_pct BOOLEAN;
  v_monto NUMERIC; v_valor NUMERIC; v_fecha DATE; v_detalle TEXT;
BEGIN
  IF NOT COALESCE((SELECT facturacion_activa FROM public.ajustes_cotizacion WHERE id = 1), FALSE) THEN RETURN; END IF;
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
      CONTINUE WHEN COALESCE(h.porcentaje, 0) <= 0;
      v_monto := round(v_total * h.acum / 100) - round(v_total * h.antes / 100);
      v_detalle := public._numero_cl(h.porcentaje) || ' %';
    ELSIF h.tipo = 'resto' THEN
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

-- ─── 5. Lo cobrado de cada trabajo = los abonos ──────────────────────────────
-- La vista de la fase 20, con «cobrado» desde los abonos (más lo anotado antes en «Por facturar»).
CREATE OR REPLACE VIEW public.cotizacion_resultado WITH (security_invoker = true) AS
SELECT c.id AS cotizacion_id,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.subtotal, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.subtotal, 0) END AS venta_neta,
  CASE WHEN c.moneda = 'UF' THEN round(COALESCE(c.costo_directo, 0) * COALESCE(c.valor_uf, 0)) ELSE COALESCE(c.costo_directo, 0) END AS costo_cotizado,
  COALESCE((SELECT SUM(g.monto) FROM public.gastos g WHERE g.cotizacion_id = c.id AND g.estado <> 'rechazado'), 0) AS gastos,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa = 'facturado'), 0) AS facturado,
  COALESCE((SELECT SUM(a.monto) FROM public.abonos a WHERE a.cotizacion_id = c.id), 0)
    + COALESCE((SELECT SUM(f.monto_pagado) FROM public.por_facturar f
                WHERE f.cotizacion_id = c.id AND NOT EXISTS (SELECT 1 FROM public.abonos a WHERE a.origen_por_facturar_id = f.id)), 0) AS cobrado,
  COALESCE((SELECT SUM(f.monto) FROM public.por_facturar f WHERE f.cotizacion_id = c.id AND f.etapa <> 'sin_cobro'), 0) AS por_cobrar_total,
  COALESCE((SELECT SUM(public.costo_compra(k)) FROM public.compras k WHERE k.cotizacion_id = c.id), 0) AS compras,
  COALESCE((SELECT SUM(h.horas) FROM public.horas_trabajo h WHERE h.cotizacion_id = c.id), 0) AS horas,
  COALESCE((SELECT SUM(h.horas * h.costo_hora) FROM public.horas_trabajo h WHERE h.cotizacion_id = c.id), 0) AS costo_horas,
  COALESCE((SELECT SUM(m.costo) FROM public.mano_obra m WHERE m.cotizacion_id = c.id), 0) AS mano_obra
FROM public.cotizaciones c
WHERE c.estado = 'Aprobada';
GRANT SELECT ON public.cotizacion_resultado TO authenticated;

-- ─── 6. Los pagos ya anotados en «Por facturar» pasan a ser abonos ───────────
INSERT INTO public.abonos (cotizacion_id, fecha, monto, medio, nota, origen_por_facturar_id, created_at)
SELECT f.cotizacion_id, LEAST(COALESCE(f.fecha_pago, f.created_at::DATE), (NOW() AT TIME ZONE 'America/Santiago')::DATE),
       round(f.monto_pagado), 'transferencia',
       'Traído de «Por facturar»' || COALESCE(' (' || f.hito || ')', '') || COALESCE(' · factura ' || f.numero_factura, ''), f.id, f.created_at
FROM public.por_facturar f
JOIN public.cotizaciones c ON c.id = f.cotizacion_id AND c.estado = 'Aprobada'
WHERE round(COALESCE(f.monto_pagado, 0)) > 0
  AND NOT EXISTS (SELECT 1 FROM public.abonos a WHERE a.origen_por_facturar_id = f.id);
