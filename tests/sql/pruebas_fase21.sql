-- Pruebas de la fase 21 (anteproyecto y detalle de boletas y facturas). Corre después de todas las fases.
\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
\set COT 'f2100000-0000-0000-0000-000000000001'
\set OTRA 'f2100000-0000-0000-0000-000000000002'
\set L1 'f21a0000-0000-0000-0000-000000000001'
\set L9 'f21a0000-0000-0000-0000-000000000009'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
INSERT INTO public.cotizaciones (id, cliente_id, estado, trabajo_estado, titulo, subtotal, total, items, partidas) VALUES
  (:'COT', :'CLI', 'Aprobada', 'por_iniciar', 'Anteproyecto', 1000000, 1000000, '[]', '[{"id":"p1","nombre":"Tablero","cantidad":1,"unidad":"gl"}]'),
  (:'OTRA', :'CLI', 'Aprobada', 'por_iniciar', 'Otra obra', 500000, 500000, '[]', '[]');
INSERT INTO public.trabajo_materiales (cotizacion_id, linea_id, descripcion, unidad, cantidad) VALUES (:'COT', 'l1', 'Cable 6 mm2', 'm', 50);

-- ═══ 1. Presupuesto de ejecución ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.presupuesto_lineas (id, cotizacion_id, partida_id, tipo, descripcion, unidad, cantidad, costo_unitario, linea_id)
VALUES (:'L1', :'COT', 'p1', 'material', 'Cable 6 mm2', 'm', 50, 1200, 'l1');
DO $$ BEGIN
  INSERT INTO public.presupuesto_lineas (cotizacion_id, descripcion, linea_id) VALUES ('f2100000-0000-0000-0000-000000000001', 'Copia repetida', 'l1');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Copiar la cotización dos veces no duplica líneas');
EXCEPTION WHEN unique_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Copiar la cotización dos veces no duplica líneas');
END $$;
INSERT INTO public.presupuesto_lineas (cotizacion_id, partida_id, tipo, descripcion, cantidad, costo_unitario)
VALUES (:'COT', 'p1', 'material', 'Canaleta adicional', 10, 3000);
INSERT INTO public.presupuesto_lineas (id, cotizacion_id, descripcion, cantidad, costo_unitario) VALUES (:'L9', :'OTRA', 'De otra obra', 1, 1000);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND sum(cantidad * costo_unitario) = 90000, 'El presupuesto del trabajo: 2 líneas, $90.000'
  FROM public.presupuesto_lineas WHERE cotizacion_id = :'COT';

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve el presupuesto (tiene costos)' FROM public.presupuesto_lineas;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'Para asignar lo comprado, el técnico ve las líneas sin costos' FROM public.presupuesto_para_asignar('f2100000-0000-0000-0000-000000000001');
DO $$ BEGIN
  INSERT INTO public.presupuesto_lineas (cotizacion_id, descripcion) VALUES ('f2100000-0000-0000-0000-000000000001', 'Del técnico');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no cambia el presupuesto');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no cambia el presupuesto');
END $$;
RESET ROLE;

-- ═══ 2. Detalle de una compra ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.compras (id, proveedor_nombre, tipo_doc, neto, iva, total, cotizacion_id)
VALUES ('f21c0000-0000-0000-0000-000000000001', 'Ferretería', 'factura', 100000, 19000, 119000, :'COT');
INSERT INTO public.documento_lineas (compra_id, partida_id, presupuesto_linea_id, descripcion, cantidad, unidad, monto) VALUES
  ('f21c0000-0000-0000-0000-000000000001', 'p1', :'L1', 'CABLE THHN 6MM', 30, 'm', 36000),
  ('f21c0000-0000-0000-0000-000000000001', 'p1', NULL, 'Cinta aisladora', 2, 'un', 4000);
DO $$ BEGIN
  INSERT INTO public.documento_lineas (compra_id, presupuesto_linea_id, descripcion, monto)
  VALUES ('f21c0000-0000-0000-0000-000000000001', 'f21a0000-0000-0000-0000-000000000009', 'Mal asignada', 1);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Una línea no se asigna al presupuesto de otro trabajo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%otro%' OR SQLERRM LIKE '%no es del trabajo%', 'Una línea no se asigna al presupuesto de otro trabajo');
END $$;
DO $$ BEGIN
  INSERT INTO public.documento_lineas (descripcion, monto) VALUES ('Sin documento', 1);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Cada línea es de una compra o de un gasto');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Cada línea es de una compra o de un gasto');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND count(*) FILTER (WHERE presupuesto_linea_id IS NULL) = 1, 'La factura quedó con 2 líneas: una del presupuesto y una no cotizada'
  FROM public.documento_lineas WHERE compra_id = 'f21c0000-0000-0000-0000-000000000001';

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve el detalle de las compras' FROM public.documento_lineas WHERE compra_id IS NOT NULL;
RESET ROLE;

-- ═══ 3. Detalle de un gasto rendido ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO public.gastos (id, monto, categoria, cotizacion_id, boleta_path)
VALUES ('f21b0000-0000-0000-0000-000000000001', 15000, 'materiales', :'COT', 'gastos/f21.jpg');
DO $$ BEGIN
  INSERT INTO public.documento_lineas (gasto_id, partida_id, presupuesto_linea_id, descripcion, cantidad, unidad, monto)
  VALUES ('f21b0000-0000-0000-0000-000000000001', 'p1', 'f21a0000-0000-0000-0000-000000000001', 'Cable 6', 10, 'm', 15000);
  INSERT INTO r (ok, txt) VALUES (TRUE, 'Quien rinde detalla su boleta y la asigna al presupuesto');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (FALSE, 'Quien rinde detalla su boleta y la asigna al presupuesto (' || left(SQLERRM, 80) || ')');
END $$;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Ve el detalle de su propio gasto' FROM public.documento_lineas WHERE gasto_id = 'f21b0000-0000-0000-0000-000000000001';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'pendiente', 'Con 40 de 50 m comprados, el material sigue «por comprar»' FROM public.trabajo_materiales WHERE cotizacion_id = :'COT' AND linea_id = 'l1';
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO public.documento_lineas (gasto_id, partida_id, presupuesto_linea_id, descripcion, cantidad, unidad, monto)
VALUES ('f21b0000-0000-0000-0000-000000000001', 'p1', :'L1', 'Cable 6 (otra tienda)', 10, 'm', 0);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'comprado', 'Al completar los 50 m, el material pasa solo a «comprado» en la lista de los técnicos'
  FROM public.trabajo_materiales WHERE cotizacion_id = :'COT' AND linea_id = 'l1';

-- ═══ 4. Borrar el documento borra su detalle ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DELETE FROM public.compras WHERE id = 'f21c0000-0000-0000-0000-000000000001';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'Al borrar la compra se borra su detalle' FROM public.documento_lineas WHERE compra_id = 'f21c0000-0000-0000-0000-000000000001';
DELETE FROM public.presupuesto_lineas WHERE id = :'L1';
INSERT INTO r (ok, txt) SELECT bool_and(presupuesto_linea_id IS NULL), 'Si se borra la línea del presupuesto, lo comprado queda como no cotizado'
  FROM public.documento_lineas WHERE gasto_id = 'f21b0000-0000-0000-0000-000000000001';

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE ok IS NOT TRUE) || ' fallas' FROM r;
