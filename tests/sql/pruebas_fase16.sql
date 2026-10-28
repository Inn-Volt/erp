\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set VENDE '33333333-3333-3333-3333-333333333333'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (:'VENDE', 'vende@innvolt.cl', '{"nombre":"Vende"}') ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'VENDE';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'VENDE', id FROM public.roles WHERE clave = 'comercial';
DELETE FROM public.notificaciones;

INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, vendedor_id, items, enviada_at)
VALUES ('c1600000-0000-0000-0000-000000000001', :'CLI', 'Borrador', 'Tablero', 100000, 19000, 119000, :'VENDE', '[]', NOW());
SET LOCAL innvolt.transicion = 'on';
UPDATE public.cotizaciones SET estado = 'Enviada' WHERE id = 'c1600000-0000-0000-0000-000000000001';

-- 1. Primera apertura: vista_at y el aviso de siempre
SET ROLE service_role;
SELECT public.registrar_apertura_cotizacion('c1600000-0000-0000-0000-000000000001', 'Mozilla/5.0 prueba');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT vista_at IS NOT NULL, 'Primera apertura: marca vista_at' FROM public.cotizaciones WHERE id = 'c1600000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Primera apertura: queda anotada' FROM public.cotizacion_aperturas WHERE cotizacion_id = 'c1600000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT count(*) >= 1 AND count(*) FILTER (WHERE titulo LIKE 'El cliente volvió%') = 0, 'Primera apertura: aviso «abrió», no «volvió a abrir»'
  FROM public.notificaciones WHERE tipo = 'cotizacion_vista';

-- 2. Recargar enseguida no cuenta ni avisa
SET ROLE service_role;
SELECT public.registrar_apertura_cotizacion('c1600000-0000-0000-0000-000000000001', 'Mozilla/5.0 prueba');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Recargar dentro de 10 minutos no es otra apertura' FROM public.cotizacion_aperturas WHERE cotizacion_id = 'c1600000-0000-0000-0000-000000000001';

-- 3. Volver a abrirla más tarde: aviso al responsable
UPDATE public.cotizacion_aperturas SET created_at = NOW() - INTERVAL '2 hours' WHERE cotizacion_id = 'c1600000-0000-0000-0000-000000000001';
SET ROLE service_role;
SELECT public.registrar_apertura_cotizacion('c1600000-0000-0000-0000-000000000001', 'Mozilla/5.0 prueba');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'Volver a abrirla queda anotado (2 aperturas)' FROM public.cotizacion_aperturas WHERE cotizacion_id = 'c1600000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(cuerpo LIKE '%por 2.ª vez y aún no responde%'),
  'Aviso «volvió a abrir» al responsable (' || COALESCE(max(cuerpo), 'nada') || ')'
  FROM public.notificaciones WHERE usuario_id = :'VENDE' AND titulo = 'El cliente volvió a abrir IV-' || lpad((SELECT folio FROM public.cotizaciones WHERE id = 'c1600000-0000-0000-0000-000000000001')::TEXT, 4, '0');
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El «volvió a abrir» no le llega a todo el equipo, solo al responsable'
  FROM public.notificaciones WHERE usuario_id = :'CESAR' AND titulo LIKE 'El cliente volvió%';

-- 4. Nadie con sesión registra aperturas a mano; el equipo sí las ve
SELECT set_config('request.jwt.claim.sub', :'VENDE', false);
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.registrar_apertura_cotizacion('c1600000-0000-0000-0000-000000000001', 'x');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Un usuario no puede registrar aperturas');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Un usuario no puede registrar aperturas');
END $$;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'El vendedor ve las aperturas' FROM public.cotizacion_aperturas WHERE cotizacion_id = 'c1600000-0000-0000-0000-000000000001';
RESET ROLE;

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
