-- Pruebas de la fase 24 (forma de pago con montos fijos): un anticipo en UF nace en pesos con la UF
-- del día y recuerda «10 UF»; «el resto» descuenta lo que ya se creó (con su monto real); el primer
-- pago en $ al aprobar deja el plan con montos; un plan solo en % sigue igual. Corre después de todas las fases.
\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
\set UFC 'f2400000-0000-0000-0000-000000000001'
\set FIJ 'f2400000-0000-0000-0000-000000000002'
\set PCT 'f2400000-0000-0000-0000-000000000003'
-- Las pruebas de fases anteriores vuelven a correr sus archivos: se deja esta fase al día.
\i /tmp/supabase_fase24_forma_pago.sql
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
-- La UF y el dólar de hoy (los guarda /api/hh/indicadores).
INSERT INTO public.hh_indicadores (fecha, uf, usd, fuente) VALUES ((NOW() AT TIME ZONE 'America/Santiago')::DATE, 40000, 950, 'boostr')
  ON CONFLICT (fecha) DO UPDATE SET uf = EXCLUDED.uf, usd = EXCLUDED.usd, fuente = EXCLUDED.fuente;

-- ═══ 1. Anticipo de 10 UF y el saldo ═══
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, plan_cobro)
VALUES (:'UFC', :'CLI', 'Borrador', 'Tablero con anticipo en UF', 840336, 159664, 1000000, '[]',
        '[{"nombre":"Anticipo","porcentaje":0,"cuando":"aprobar","tipo":"UF","valor":10},{"nombre":"Saldo","porcentaje":0,"cuando":"terminar","tipo":"resto"}]');
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'UFC';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'UFC';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(monto = 400000 AND moneda = 'UF' AND monto_moneda = 10 AND valor_moneda = 40000
    AND fecha_valor = (NOW() AT TIME ZONE 'America/Santiago')::DATE AND porcentaje IS NULL AND descripcion LIKE '%(10 UF)%'),
  'Al aprobar nace el anticipo de 10 UF en pesos con la UF del día: $400.000 (' || COALESCE(max(monto)::TEXT, 'nada') || ')'
  FROM public.por_facturar WHERE cotizacion_id = :'UFC' AND hito = 'Anticipo';
INSERT INTO r (ok, txt) SELECT NOT EXISTS (SELECT 1 FROM public.por_facturar WHERE cotizacion_id = :'UFC' AND hito = 'Saldo'), 'El saldo espera al término'
  FROM (SELECT 1) x;
-- Al facturar se actualizó a la UF de ese día ($41.000): el saldo descuenta lo que de verdad se cobró.
UPDATE public.por_facturar SET monto = 410000, valor_moneda = 41000 WHERE cotizacion_id = :'UFC' AND hito = 'Anticipo';
UPDATE public.cotizaciones SET trabajo_estado = 'en_ejecucion', inicio_sin_anticipo = 'Prueba' WHERE id = :'UFC';
UPDATE public.cotizaciones SET trabajo_estado = 'terminado' WHERE id = :'UFC';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(monto = 590000 AND moneda IS NULL AND descripcion LIKE '%(saldo)%'),
  'Al terminar, «el resto» es el total menos el anticipo real: $590.000 (' || COALESCE(max(monto)::TEXT, 'nada') || ')'
  FROM public.por_facturar WHERE cotizacion_id = :'UFC' AND hito = 'Saldo';

-- ═══ 2. Primer pago en $ al aprobar, con montos fijos en el plan ═══
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, enviada_at, valida_hasta, plan_cobro)
VALUES (:'FIJ', :'CLI', 'Enviada', 'Obra con cuota', 840336, 159664, 1000000, '[]', NOW(), CURRENT_DATE + 10,
        '[{"nombre":"Anticipo","porcentaje":0,"cuando":"aprobar","tipo":"CLP","valor":300000},{"nombre":"Avance","porcentaje":20,"cuando":"terminar","tipo":"pct"},{"nombre":"Final","porcentaje":0,"cuando":"terminar","tipo":"USD","valor":100}]');
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
SELECT public.cot_aprobar_con_anticipo(:'FIJ', 'Correo del cliente', NULL, NULL, 250000);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT plan_cobro->0->>'tipo' = 'CLP' AND (plan_cobro->0->>'valor')::NUMERIC = 250000 AND jsonb_array_length(plan_cobro) = 4
    AND plan_cobro->3->>'tipo' = 'resto' AND plan_cobro->3->>'nombre' = 'Saldo',
  'El primer pago queda en $250.000; los otros cobros igual y se agrega un «Saldo» con el resto' FROM public.cotizaciones WHERE id = :'FIJ';
INSERT INTO r (ok, txt) SELECT COALESCE(max(monto), 0) = 250000 AND max(moneda) IS NULL, 'El anticipo nace en $250.000'
  FROM public.por_facturar WHERE cotizacion_id = :'FIJ' AND hito = 'Anticipo';
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE public.cotizaciones SET trabajo_estado = 'en_ejecucion', inicio_sin_anticipo = 'Prueba' WHERE id = :'FIJ';
UPDATE public.cotizaciones SET trabajo_estado = 'terminado' WHERE id = :'FIJ';
INSERT INTO r (ok, txt) SELECT
    max(monto) FILTER (WHERE hito = 'Avance') = 200000 AND max(monto) FILTER (WHERE hito = 'Final') = 95000
    AND max(moneda) FILTER (WHERE hito = 'Final') = 'USD' AND max(descripcion) FILTER (WHERE hito = 'Final') LIKE '%(US$ 100)%'
    AND max(monto) FILTER (WHERE hito = 'Saldo') = 455000 AND sum(monto) = 1000000,
  'Al terminar: 20 % = $200.000, US$ 100 = $95.000 y el saldo $455.000; todo suma el total'
  FROM public.por_facturar WHERE cotizacion_id = :'FIJ';

-- ═══ 3. Un plan solo en % se reparte como siempre ═══
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, plan_cobro)
VALUES (:'PCT', :'CLI', 'Borrador', 'Plan de siempre', 840336, 159664, 1000001, '[]',
        '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]');
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'PCT';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'PCT';
INSERT INTO r (ok, txt) SELECT max(monto) = 500001 AND max(porcentaje) = 50 AND max(descripcion) LIKE '%(50 %)%', 'Solo en %: el anticipo de 50 % como siempre ($500.001)'
  FROM public.por_facturar WHERE cotizacion_id = :'PCT' AND hito = 'Anticipo';
INSERT INTO r (ok, txt) SELECT public._numero_cl(1234.5) = '1.234,5' AND public._numero_cl(10) = '10' AND public._numero_cl(0.25) = '0,25',
  'Las cantidades se escriben a la chilena (1.234,5 · 10 · 0,25)' FROM (SELECT 1) x;

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
