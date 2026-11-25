-- Pruebas de la fase 25 (cobranza con abonos libres): con la facturación en pausa aprobar no crea
-- «Por facturar»; los abonos son libres y solo los anota cobranza; el anticipo pendiente sale de los
-- abonos; lo cobrado del trabajo son los abonos; los pagos de antes pasan a abonos una sola vez.
\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
\set OBRA 'f2500000-0000-0000-0000-000000000001'
\set BORR 'f2500000-0000-0000-0000-000000000002'
\set ANT 'f2500000-0000-0000-0000-000000000003'
\set UFA 'f2500000-0000-0000-0000-000000000004'
\set FAC 'f2500000-0000-0000-0000-000000000005'
-- Las pruebas de fases anteriores vuelven a correr sus archivos: se deja esta fase al día.
\i /tmp/supabase_fase25_cobranza.sql
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE public.ajustes_cotizacion SET facturacion_activa = FALSE WHERE id = 1;
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
INSERT INTO public.hh_indicadores (fecha, uf, usd, fuente) VALUES ((NOW() AT TIME ZONE 'America/Santiago')::DATE, 40000, 950, 'boostr')
  ON CONFLICT (fecha) DO UPDATE SET uf = EXCLUDED.uf, usd = EXCLUDED.usd, fuente = EXCLUDED.fuente;

-- ═══ 1. Facturación en pausa: aprobar no crea «Por facturar» ═══
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, plan_cobro)
VALUES (:'OBRA', :'CLI', 'Borrador', 'Obra de 3 millones', 2521008, 478992, 3000000, '[]',
        '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]'),
       (:'BORR', :'CLI', 'Borrador', 'Sin aprobar', 840336, 159664, 1000000, '[]', NULL);
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'OBRA';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'OBRA';
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'Con la facturación en pausa, aprobar no crea cobros en «Por facturar»'
  FROM public.por_facturar WHERE cotizacion_id = :'OBRA';
INSERT INTO r (ok, txt) SELECT public.anticipo_pendiente(:'OBRA') = 1500000, 'Sin abonos falta el anticipo esperado: $1.500.000 (' || public.anticipo_pendiente(:'OBRA') || ')'
  FROM (SELECT 1) x;

-- ═══ 2. Abonos libres ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.abonos (cotizacion_id, monto, medio, referencia) VALUES (:'OBRA', 1500000, 'transferencia', 'Op. 123');
INSERT INTO public.abonos (cotizacion_id, monto, medio, fecha) VALUES (:'OBRA', 500000, 'efectivo', (NOW() AT TIME ZONE 'America/Santiago')::DATE - 1);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND sum(monto) = 2000000 AND bool_and(created_by = :'CESAR'), 'Cobranza anota dos abonos libres ($1.500.000 y $500.000) con quién los anotó'
  FROM public.abonos WHERE cotizacion_id = :'OBRA';
INSERT INTO r (ok, txt) SELECT public.anticipo_pendiente(:'OBRA') = 0, 'Con $2.000.000 abonados el anticipo está cubierto' FROM (SELECT 1) x;
INSERT INTO r (ok, txt) SELECT cobrado = 2000000, 'Lo cobrado del trabajo son los abonos: $2.000.000 (' || cobrado || ')'
  FROM public.cotizacion_resultado WHERE cotizacion_id = :'OBRA';
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'Quien anota el abono no se avisa a sí mismo'
  FROM public.notificaciones WHERE usuario_id = :'CESAR' AND tipo = 'abono_recibido' AND titulo LIKE '%$1.500.000%';

-- ═══ 3. Reglas y permisos ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.abonos (cotizacion_id, monto) VALUES ('f2500000-0000-0000-0000-000000000001', 100000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no anota abonos');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no anota abonos');
END $$;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve los abonos' FROM public.abonos;
RESET ROLE;
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.abonos (cotizacion_id, monto) VALUES ('f2500000-0000-0000-0000-000000000002', 100000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Un abono va a una cotización aprobada');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%aprobada%', 'Un abono va a una cotización aprobada');
END $$;
DO $$ BEGIN
  INSERT INTO public.abonos (cotizacion_id, monto, fecha) VALUES ('f2500000-0000-0000-0000-000000000001', 100000, CURRENT_DATE + 5);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La fecha del abono no puede ser futura');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La fecha del abono no puede ser futura');
END $$;
RESET ROLE;

-- ═══ 4. Un plan con anticipo en UF: lo esperado al valor del día ═══
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, plan_cobro)
VALUES (:'UFA', :'CLI', 'Borrador', 'Anticipo en UF', 840336, 159664, 1000000, '[]',
        '[{"nombre":"Anticipo","porcentaje":0,"cuando":"aprobar","tipo":"UF","valor":10},{"nombre":"Saldo","porcentaje":0,"cuando":"terminar","tipo":"resto"}]');
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'UFA';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'UFA';
INSERT INTO r (ok, txt) SELECT public.anticipo_pendiente(:'UFA') = 400000, 'Anticipo de 10 UF pendiente: $400.000 (' || public.anticipo_pendiente(:'UFA') || ')' FROM (SELECT 1) x;
INSERT INTO r (ok, txt) SELECT array_agg(monto ORDER BY n) = ARRAY[400000, 600000]::NUMERIC[], 'Lo esperado de cada cobro: 10 UF = $400.000 y el resto $600.000'
  FROM public._montos_plan((SELECT c FROM public.cotizaciones c WHERE id = :'UFA'));
-- Un abono que entra sin sesión (p. ej. el servidor) le avisa a cobranza.
INSERT INTO public.abonos (cotizacion_id, monto) VALUES (:'UFA', 100000);
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Cada abono avisa a cobranza'
  FROM public.notificaciones WHERE usuario_id = :'CESAR' AND tipo = 'abono_recibido' AND titulo LIKE '%$100.000%';

-- ═══ 5. Los pagos de antes pasan a abonos una sola vez ═══
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items)
VALUES (:'ANT', :'CLI', 'Borrador', 'Con pago de antes', 840336, 159664, 1000000, '[]');
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'ANT';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'ANT';
INSERT INTO public.por_facturar (cotizacion_id, cliente_id, descripcion, monto, hito, monto_pagado, fecha_pago, etapa, numero_factura)
VALUES (:'ANT', :'CLI', 'IV · Anticipo', 500000, 'Anticipo', 500000, '2026-11-20', 'facturado', '2001');
INSERT INTO r (ok, txt) SELECT public._pagado_trabajo(:'ANT') = 500000, 'Antes de pasarlo, lo pagado cuenta lo anotado en «Por facturar»' FROM (SELECT 1) x;
\i /tmp/supabase_fase25_cobranza.sql
\i /tmp/supabase_fase25_cobranza.sql
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(monto = 500000 AND fecha = '2026-11-20' AND nota LIKE '%factura 2001%'),
  'El pago anotado en «Por facturar» pasa a ser un abono (una sola vez, aunque se corra dos veces)'
  FROM public.abonos WHERE cotizacion_id = :'ANT';
INSERT INTO r (ok, txt) SELECT public._pagado_trabajo(:'ANT') = 500000, 'Y no se cuenta dos veces' FROM (SELECT 1) x;
INSERT INTO r (ok, txt) SELECT NOT EXISTS (SELECT 1 FROM public.notificaciones WHERE tipo = 'abono_recibido' AND titulo LIKE '%$500.000%' AND cuerpo LIKE 'Con pago de antes%'),
  'Lo traído de antes no avisa como abono nuevo' FROM (SELECT 1) x;

-- ═══ 6. Con la facturación activa, aprobar vuelve a crear «Por facturar» ═══
UPDATE public.ajustes_cotizacion SET facturacion_activa = TRUE WHERE id = 1;
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, plan_cobro)
VALUES (:'FAC', :'CLI', 'Borrador', 'Con factura', 840336, 159664, 1000000, '[]',
        '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]');
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id = :'FAC';
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id = :'FAC';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND max(monto) = 500000, 'Con la facturación activa nace el anticipo en «Por facturar»'
  FROM public.por_facturar WHERE cotizacion_id = :'FAC';
UPDATE public.ajustes_cotizacion SET facturacion_activa = FALSE WHERE id = 1;

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
