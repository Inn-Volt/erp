\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set VENDE '33333333-3333-3333-3333-333333333333'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (:'VENDE', 'vende@innvolt.cl', '{"nombre":"Vende"}') ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'VENDE';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'VENDE', id FROM public.roles WHERE clave = 'comercial';
UPDATE public.ajustes_cotizacion SET descuento_max = NULL, utilidad_min = NULL WHERE id = 1;
DELETE FROM public.descuentos_maximos;

-- Línea con 10 % en una partida con 5 %: en total 14,5 %. El cargo operacional no cuenta.
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, costo_directo, vendedor_id, items, partidas)
VALUES ('c1700000-0000-0000-0000-000000000001', :'CLI', 'Borrador', 'Con descuento de partida', 100000, 19000, 119000, 50000, :'VENDE',
        '[{"id":"l1","partidaId":"p1","descripcion":"Algo","descuento":10},{"id":"l2","partidaId":"p2","descripcion":"Logística","descuento":0}]',
        '[{"id":"p1","nombre":"Equipos","descuento":5},{"id":"p2","nombre":"Cargo","tipo":"cargo","descuento":50}]');

-- 1. El descuento mayor junta el de la línea y el de su partida
INSERT INTO r (ok, txt) SELECT public.cot_descuento_mayor(c) = 14.5, 'Descuento mayor: 10 % de la línea + 5 % de la partida = 14,5 % (' || public.cot_descuento_mayor(c) || ')'
  FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';

-- 2. Sin topes, nada cambia
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) IS NULL, 'Sin topes no pide aprobación' FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';

-- 3. El tope de los ajustes ya considera el descuento de la partida
UPDATE public.ajustes_cotizacion SET descuento_max = 12 WHERE id = 1;
SELECT set_config('request.jwt.claim.sub', :'VENDE', false);
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) = 'Descuento de 14,5 % (máximo sin aprobación: 12 %)',
  'Tope de los ajustes con el de la partida: ' || COALESCE(public.cot_motivo_aprobacion(c), 'nada') FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';
UPDATE public.ajustes_cotizacion SET descuento_max = 20 WHERE id = 1;
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) IS NULL, 'Bajo el tope de los ajustes, no pide' FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';

-- 4. Solo quien gestiona usuarios fija el máximo de cada uno
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.descuentos_maximos (usuario_id, maximo) VALUES ('33333333-3333-3333-3333-333333333333', 50);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El vendedor no se fija su propio máximo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El vendedor no se fija su propio máximo');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'CESAR', false);
SET ROLE authenticated;
INSERT INTO public.descuentos_maximos (usuario_id, maximo) VALUES (:'VENDE', 10);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT maximo = 10 AND actualizado_por = :'CESAR', 'El gerente fija el máximo y queda quién lo hizo' FROM public.descuentos_maximos WHERE usuario_id = :'VENDE';

-- 5. El vendedor ve el suyo
SELECT set_config('request.jwt.claim.sub', :'VENDE', false);
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'El vendedor ve su máximo' FROM public.descuentos_maximos WHERE usuario_id = :'VENDE';
RESET ROLE;

-- 6. Pasar el máximo propio pide aprobación (aunque esté bajo el de los ajustes)
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) = 'Descuento de 14,5 % (tu máximo: 10 %)', 'Máximo propio: ' || COALESCE(public.cot_motivo_aprobacion(c), 'nada')
  FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.cot_enviar('c1700000-0000-0000-0000-000000000001', 'enlace', NULL);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Sobre su máximo, el vendedor no la envía sin aprobación');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE 'APROBACION_REQUERIDA%tu máximo%', 'Sobre su máximo, el vendedor no la envía sin aprobación');
END $$;
RESET ROLE;

-- 7. A otro usuario (sin máximo propio) no le aplica el del vendedor
SELECT set_config('request.jwt.claim.sub', :'CESAR', false);
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) IS NULL, 'El máximo es de cada persona' FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';

-- 8. Un máximo más alto que el de los ajustes: manda el de los ajustes
UPDATE public.descuentos_maximos SET maximo = 30 WHERE usuario_id = :'VENDE';
UPDATE public.ajustes_cotizacion SET descuento_max = 12 WHERE id = 1;
SELECT set_config('request.jwt.claim.sub', :'VENDE', false);
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) LIKE '%máximo sin aprobación: 12 %', 'Manda el tope más bajo: ' || COALESCE(public.cot_motivo_aprobacion(c), 'nada')
  FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000001';

INSERT INTO r (ok, txt) SELECT public.cot_pct_texto(20) = '20' AND public.cot_pct_texto(12.25) = '12,25' AND public.cot_pct_texto(0.5) = '0,5' AND public.cot_pct_texto(100) = '100',
  'Los % se leen como en Chile (20 · 12,25 · 0,5)';

-- 9. Las cotizaciones de antes (sin partidas en el JSON) siguen igual
UPDATE public.ajustes_cotizacion SET descuento_max = 10 WHERE id = 1;
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, vendedor_id, items)
VALUES ('c1700000-0000-0000-0000-000000000002', :'CLI', 'Borrador', 'De antes', 100000, 19000, 119000, :'VENDE', '[{"id":"l1","descripcion":"Algo","descuento":20}]');
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) LIKE 'Descuento de 20 %', 'Cotización de antes: ' || COALESCE(public.cot_motivo_aprobacion(c), 'nada')
  FROM public.cotizaciones c WHERE id = 'c1700000-0000-0000-0000-000000000002';

UPDATE public.ajustes_cotizacion SET descuento_max = NULL WHERE id = 1;
DELETE FROM public.descuentos_maximos;
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
