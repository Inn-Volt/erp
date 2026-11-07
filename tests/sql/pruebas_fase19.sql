\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set PR 'f1900000-0000-0000-0000-000000000001'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
INSERT INTO public.proyectos (id, nombre, estado) VALUES (:'PR', 'Obra de prueba', 'en_curso') ON CONFLICT DO NOTHING;
DELETE FROM public.notificaciones;
CREATE TEMP VIEW cuentas AS SELECT * FROM public.fondo_cuentas('22222222-2222-2222-2222-222222222222');
GRANT SELECT ON cuentas TO authenticated;

-- ═══ A. Lo de antes pasa a fondos, sin cambiar ningún saldo ═══
DELETE FROM public.fondo_movimientos;
DELETE FROM public.gastos WHERE usuario_id = :'JOAQUIN';
DELETE FROM public.anticipos WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.anticipos (usuario_id, monto, fecha, motivo, estado) VALUES
  (:'JOAQUIN', 100000, '2026-09-30', 'Semana 40', 'entregado'),
  (:'JOAQUIN', 50000, '2026-09-30', 'Mal ingresado', 'anulado');
INSERT INTO public.gastos (id, usuario_id, monto, fecha, categoria, descripcion, proyecto_id, estado, anticipo_id) VALUES
  ('f19a0000-0000-0000-0000-000000000001', :'JOAQUIN', 20000, '2026-09-15', 'peaje', 'Pagado antes', :'PR', 'reembolsado', NULL),
  ('f19a0000-0000-0000-0000-000000000002', :'JOAQUIN', 30000, '2026-10-01', 'combustible', 'Contra anticipo', :'PR', 'rendido',
     (SELECT id FROM public.anticipos WHERE usuario_id = :'JOAQUIN' AND estado = 'entregado')),
  ('f19a0000-0000-0000-0000-000000000003', :'JOAQUIN', 90000, '2026-10-02', 'materiales', 'De su bolsillo', :'PR', 'rendido', NULL);
\i /tmp/supabase_fase19_fondos.sql
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND sum(monto) = 100000, 'Cada anticipo no anulado es una entrega' FROM public.fondo_movimientos WHERE usuario_id = :'JOAQUIN' AND tipo = 'entrega';
INSERT INTO r (ok, txt) SELECT monto_fondo = 30000 AND monto_propio = 0 AND pagado_con = 'fondo', 'Lo rendido contra el anticipo sale del fondo' FROM public.gastos WHERE id = 'f19a0000-0000-0000-0000-000000000002';
INSERT INTO r (ok, txt) SELECT monto_fondo = 70000 AND monto_propio = 20000 AND pagado_con = 'mixto', 'Lo que sobraba en el fondo cubre lo que puso (70.000 + 20.000)' FROM public.gastos WHERE id = 'f19a0000-0000-0000-0000-000000000003';
INSERT INTO r (ok, txt) SELECT monto_propio = 20000 AND estado = 'reembolsado', 'Lo ya reembolsado queda como pagado' FROM public.gastos WHERE id = 'f19a0000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT en_fondo = 0 AND disponible = 0 AND debemos = 20000, 'Mismo neto que antes: fondo en 0, se le deben 20.000 (' || en_fondo || ' / ' || debemos || ')' FROM cuentas;

-- ═══ B. El día a día ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.gastos (monto, categoria, proyecto_id) VALUES (5000, 'peaje', 'f1900000-0000-0000-0000-000000000001');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Sin la foto de la boleta no se rinde');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%boleta%', 'Sin la foto de la boleta no se rinde');
END $$;
RESET ROLE;

-- Entrega: se suma a su fondo y le llega el aviso.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, nota) VALUES (:'JOAQUIN', 'entrega', 50000, 'Para la semana');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT disponible = 50000, 'La entrega se suma al fondo (disponible 50.000)' FROM cuentas;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'A la persona le llega «Te entregaron $50.000»' FROM public.notificaciones WHERE usuario_id = :'JOAQUIN' AND tipo = 'fondo_entrega';

-- ¿Con qué pagaste? Del fondo lo que alcance; el resto lo puso.
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO public.gastos (id, monto, categoria, proyecto_id, boleta_path, pagado_con)
  VALUES ('f19b0000-0000-0000-0000-000000000001', 30000, 'combustible', :'PR', 'gastos/b1.jpg', 'fondo');
INSERT INTO public.gastos (id, monto, categoria, proyecto_id, sin_boleta, pagado_con)
  VALUES ('f19b0000-0000-0000-0000-000000000002', 25000, 'alimentacion', :'PR', TRUE, 'fondo');
DO $$ BEGIN
  INSERT INTO public.gastos (monto, categoria, proyecto_id, boleta_path, pagado_con) VALUES (1000, 'otro', 'f1900000-0000-0000-0000-000000000001', 'x.jpg', 'empresa');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La tarjeta de la empresa es solo de quien paga las rendiciones');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La tarjeta de la empresa es solo de quien paga las rendiciones');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT monto_fondo = 30000 AND pagado_con = 'fondo', 'Si el fondo alcanza, sale todo del fondo' FROM public.gastos WHERE id = 'f19b0000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT monto_fondo = 20000 AND monto_propio = 5000 AND pagado_con = 'mixto', 'Si alcanza a medias: 20.000 del fondo y 5.000 de su bolsillo' FROM public.gastos WHERE id = 'f19b0000-0000-0000-0000-000000000002';
INSERT INTO r (ok, txt) SELECT disponible = 0 AND debemos = 25000, 'El fondo nunca queda negativo; se le deben 25.000' FROM cuentas;

-- Devoluciones: la declara con comprobante, hasta lo disponible, y la confirma quien paga.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto) VALUES (:'JOAQUIN', 'entrega', 40000);
RESET ROLE;
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, estado) VALUES ('22222222-2222-2222-2222-222222222222', 'devolucion', 15000, 'por_confirmar');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La devolución pide el comprobante');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%comprobante%', 'La devolución pide el comprobante');
END $$;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, estado, comprobante_path) VALUES ('22222222-2222-2222-2222-222222222222', 'devolucion', 50000, 'por_confirmar', 'fondos/c.jpg');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No se devuelve más de lo disponible');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%disponible%', 'No se devuelve más de lo disponible');
END $$;
INSERT INTO public.fondo_movimientos (id, usuario_id, tipo, monto, estado, comprobante_path)
  VALUES ('f19c0000-0000-0000-0000-000000000001', :'JOAQUIN', 'devolucion', 15000, 'por_confirmar', 'fondos/c.jpg');
DO $$ BEGIN
  UPDATE public.fondo_movimientos SET estado = 'confirmado' WHERE id = 'f19c0000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La persona no confirma su propia devolución');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La persona no confirma su propia devolución');
END $$;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto) VALUES ('22222222-2222-2222-2222-222222222222', 'entrega', 99999);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La persona no se entrega plata a sí misma');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La persona no se entrega plata a sí misma');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT disponible = 25000 AND por_confirmar = 15000 AND en_fondo = 40000, 'La declarada queda reservada (disponible 25.000, por confirmar 15.000)' FROM cuentas;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'A quien paga le llega «declaró una devolución»' FROM public.notificaciones WHERE usuario_id = :'CESAR' AND tipo = 'fondo_devolucion';
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  UPDATE public.fondo_movimientos SET estado = 'descartado' WHERE id = 'f19c0000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (FALSE, '«No llegó» pide el motivo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%no llegó%', '«No llegó» pide el motivo');
END $$;
UPDATE public.fondo_movimientos SET estado = 'confirmado' WHERE id = 'f19c0000-0000-0000-0000-000000000001';
DO $$ BEGIN
  UPDATE public.fondo_movimientos SET monto = 1 WHERE tipo = 'entrega' AND usuario_id = '22222222-2222-2222-2222-222222222222' AND anticipo_id IS NULL;
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Los movimientos no se editan');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%no se editan%', 'Los movimientos no se editan');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT en_fondo = 25000 AND disponible = 25000 AND por_confirmar = 0, 'Confirmada, sale del fondo (25.000)' FROM cuentas;

-- Observar: no se paga hasta que la persona lo corrige.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
UPDATE public.gastos SET estado = 'observado', motivo_rechazo = 'Falta el detalle' WHERE id = 'f19b0000-0000-0000-0000-000000000002';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT debemos = 20000 AND en_revision = 5000, 'Lo observado no se paga (debemos 20.000, en revisión 5.000)' FROM cuentas;
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
UPDATE public.gastos SET descripcion = 'Almuerzo de la cuadrilla' WHERE id = 'f19b0000-0000-0000-0000-000000000002';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'rendido' AND motivo_rechazo IS NULL, 'Al corregirlo vuelve a «rendido»' FROM public.gastos WHERE id = 'f19b0000-0000-0000-0000-000000000002';
INSERT INTO r (ok, txt) SELECT debemos = 25000 AND en_revision = 0, 'Corregido, vuelve a lo que se le debe (25.000)' FROM cuentas;

-- Pagarle lo que puso: por transferencia o descontándolo de su fondo.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto) VALUES ('22222222-2222-2222-2222-222222222222', 'pago', 30000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No se paga más de lo que se le debe');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%se le debe%', 'No se paga más de lo que se le debe');
END $$;
INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, nota) VALUES (:'JOAQUIN', 'pago', 20000, 'Transferencia 123');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT debemos = 5000, 'Pago parcial: quedan 5.000' FROM cuentas;
INSERT INTO r (ok, txt) SELECT estado = 'rendido', 'Con pago parcial los gastos siguen rendidos' FROM public.gastos WHERE id = 'f19b0000-0000-0000-0000-000000000002';
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto) VALUES ('22222222-2222-2222-2222-222222222222', 'compensacion', 10000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Descontar del fondo: no más de lo que se le debe');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Descontar del fondo: no más de lo que se le debe');
END $$;
INSERT INTO public.fondo_movimientos (id, usuario_id, tipo, monto) VALUES ('f19c0000-0000-0000-0000-000000000002', :'JOAQUIN', 'compensacion', 5000);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT debemos = 0 AND en_fondo = 20000, 'Descontado del fondo: nada que pagarle, fondo 20.000' FROM cuentas;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'Pagado todo, sus gastos quedan «reembolsados»'
  FROM public.gastos WHERE usuario_id = :'JOAQUIN' AND estado = 'reembolsado' AND id IN ('f19a0000-0000-0000-0000-000000000003', 'f19b0000-0000-0000-0000-000000000002');

-- Revertir: con motivo, una vez, sin dejar el fondo negativo.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, revierte_id, motivo)
  SELECT '22222222-2222-2222-2222-222222222222', 'reversa', 1, id, 'Prueba' FROM public.fondo_movimientos
  WHERE usuario_id = '22222222-2222-2222-2222-222222222222' AND tipo = 'entrega' AND monto = 40000;
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Revertir no deja el fondo negativo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%negativo%', 'Revertir no deja el fondo negativo');
END $$;
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, revierte_id) VALUES ('22222222-2222-2222-2222-222222222222', 'reversa', 1, 'f19c0000-0000-0000-0000-000000000002');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Revertir pide el motivo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%revierte%', 'Revertir pide el motivo');
END $$;
INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, revierte_id, motivo) VALUES (:'JOAQUIN', 'reversa', 1, 'f19c0000-0000-0000-0000-000000000002', 'Se pagó por transferencia');
DO $$ BEGIN
  INSERT INTO public.fondo_movimientos (usuario_id, tipo, monto, revierte_id, motivo) VALUES ('22222222-2222-2222-2222-222222222222', 'reversa', 1, 'f19c0000-0000-0000-0000-000000000002', 'Otra vez');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Un movimiento se revierte una sola vez');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Un movimiento se revierte una sola vez');
END $$;
-- La tarjeta de la empresa no toca ningún fondo.
INSERT INTO public.gastos (id, monto, categoria, proyecto_id, boleta_path, pagado_con)
  VALUES ('f19b0000-0000-0000-0000-000000000003', 12000, 'peaje', :'PR', 'gastos/t.jpg', 'empresa');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT en_fondo = 25000 AND debemos = 5000, 'Revertida la compensación: fondo 25.000 y se le deben 5.000 otra vez' FROM cuentas;
INSERT INTO r (ok, txt) SELECT revertido, 'El revertido queda marcado' FROM public.fondo_movimientos WHERE id = 'f19c0000-0000-0000-0000-000000000002';
INSERT INTO r (ok, txt) SELECT monto_fondo = 0 AND monto_propio = 0 AND pagado_con = 'empresa', 'Con la tarjeta de la empresa no sale del fondo ni se le debe' FROM public.gastos WHERE id = 'f19b0000-0000-0000-0000-000000000003';

-- Quién ve qué.
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT disponible = 25000, 'La persona ve su fondo' FROM public.fondo_situacion();
DO $$ BEGIN
  PERFORM * FROM public.fondo_situacion('11111111-1111-1111-1111-111111111111');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No ve el fondo de otro');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No ve el fondo de otro');
END $$;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'No ve los movimientos de otros' FROM public.fondo_movimientos WHERE usuario_id <> '22222222-2222-2222-2222-222222222222';
RESET ROLE;
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(disponible = 25000), 'Quien paga ve los fondos del equipo' FROM public.fondos_equipo() WHERE usuario_id = '22222222-2222-2222-2222-222222222222';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
