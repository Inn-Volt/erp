-- Pruebas de la fase 22 (análisis de proyecto): mano de obra por día, servicios por hora, pagos
-- líquidos, línea del presupuesto en cada registro y lo que puede hacer el técnico. Corre después de
-- todas las fases. Cada prueba que lee una fila usa un agregado (count, bool_and, max): si la fila no
-- está (porque el INSERT falló), la prueba igual queda registrada como FALLA.
\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
\set COT 'f2200000-0000-0000-0000-000000000001'
\set OTRA 'f2200000-0000-0000-0000-000000000002'
\set INT 'f22e0000-0000-0000-0000-000000000001'
\set EXT 'f22e0000-0000-0000-0000-000000000002'
\set LMO 'f22a0000-0000-0000-0000-000000000001'
\set LSV 'f22a0000-0000-0000-0000-000000000002'
\set LOT 'f22a0000-0000-0000-0000-000000000003'
SELECT set_config('request.jwt.claim.sub', '', false);

-- pruebas_fase20 vuelve a correr la fase 20 (que trae su propio mano_obra_reglas): se vuelve a correr
-- la 22, y así se prueba también que se puede correr de nuevo.
\i /tmp/supabase_fase22_analisis_proyecto.sql
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO r (ok, txt)
SELECT count(*) FILTER (WHERE d LIKE '%tipo%') = 2 AND count(*) FILTER (WHERE d LIKE '%tipo%' AND d NOT LIKE '%''liquido''%') = 0,
       'Al volver a correrla, mano_obra queda con sus dos CHECK del tipo (los dos conocen «liquido»; el de la fase 20 que nombra monto_liquido se borró) ('
       || count(*) FILTER (WHERE d LIKE '%tipo%') || ')'
FROM (SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'public.mano_obra'::regclass AND contype = 'c') x;
INSERT INTO r (ok, txt) SELECT prosrc LIKE '%liquido%', 'El trigger de la mano de obra es el de la fase 22'
  FROM pg_proc WHERE proname = 'mano_obra_reglas';

UPDATE public.ajustes_cotizacion SET retencion_honorarios = 15.25 WHERE id = 1;
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
-- La ficha de Joaquín de las pruebas de la fase 20 queda sin cuenta: aquí tiene una nueva.
-- $728.100 líquidos con AFP 11,5 % + salud 7 % + cesantía 0,6 % = $900.000 brutos; + 5 % de aportes
-- ÷ 22 días + colación 3.000 + movilización 2.000 = $47.955 al día (9 h).
UPDATE public.trabajadores SET usuario_id = NULL WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.trabajadores (id, tipo, nombre, usuario_id, sueldo_liquido, afp_pct, salud_pct, cesantia_pct, aportes_pct, dias_mes, horas_dia, colacion_dia, movilizacion_dia)
VALUES (:'INT', 'interno', 'Joaquín Soto', :'JOAQUIN', 728100, 11.5, 7, 0.6, 5, 22, 9, 3000, 2000);
INSERT INTO public.trabajadores (id, tipo, nombre, valor_jornada, honorarios) VALUES (:'EXT', 'externo', 'Ingeniera Ríos', 20000, TRUE);
INSERT INTO public.cotizaciones (id, cliente_id, estado, trabajo_estado, titulo, subtotal, total, items, partidas) VALUES
  (:'COT', :'CLI', 'Aprobada', 'por_iniciar', 'Análisis de proyecto', 2000000, 2000000, '[]',
   '[{"id":"p1","nombre":"Canalización","cantidad":1,"unidad":"gl"},{"id":"p2","nombre":"Ingeniería","cantidad":1,"unidad":"gl"}]'),
  (:'OTRA', :'CLI', 'Aprobada', 'por_iniciar', 'Otra obra', 100000, 100000, '[]', '[]');

-- ═══ 1. Presupuesto: mano de obra por día y servicios por hora ═══
INSERT INTO public.presupuesto_lineas (id, cotizacion_id, partida_id, tipo, descripcion, unidad, cantidad, personas, costo_unitario, trabajador_id, modalidad) VALUES
  (:'LMO', :'COT', 'p1', 'mano_obra', 'Maestro y ayudante', 'día', 6, 2, 47955, :'INT', 'interno'),
  (:'LSV', :'COT', 'p2', 'servicio', 'Ingeniería y planos', 'h', 10, 1, 23599, :'EXT', 'externo'),
  (:'LOT', :'OTRA', NULL, 'mano_obra', 'De otra obra', 'día', 1, 1, 1000, NULL, 'liquido');
UPDATE public.presupuesto_lineas SET honorarios = TRUE, valor_liquido = 20000 WHERE id = :'LSV';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(cantidad * costo_unitario = 287730 AND personas = 2),
  'Mano de obra: 2 personas × 3 días = 6 jornadas; el total sigue siendo cantidad × costo ($287.730)'
  FROM public.presupuesto_lineas WHERE id = :'LMO';
DO $$ BEGIN
  INSERT INTO public.presupuesto_lineas (cotizacion_id, descripcion, personas) VALUES ('f2200000-0000-0000-0000-000000000001', 'Nadie', 0);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Las personas de una línea son más que 0');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Las personas de una línea son más que 0');
END $$;
DO $$ BEGIN
  INSERT INTO public.presupuesto_lineas (cotizacion_id, descripcion, modalidad) VALUES ('f2200000-0000-0000-0000-000000000001', 'Rara', 'trueque');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La modalidad es interno, externo o líquido');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La modalidad es interno, externo o líquido');
END $$;

-- ═══ 2. Interno por días ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.mano_obra (cotizacion_id, trabajador_id, tipo, jornadas, presupuesto_linea_id) VALUES (:'COT', :'INT', 'interno', 2, :'LMO');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(costo = 95910 AND partida_id = 'p1' AND clase = 'mano_obra' AND nombre = 'Joaquín Soto'),
  'Interno por días: 2 jornadas = $95.910, toma la partida de la línea (' || COALESCE(max(costo)::TEXT, 'no se registró') || ')'
  FROM public.mano_obra WHERE presupuesto_linea_id = :'LMO' AND jornadas = 2;

-- ═══ 3. Pagos líquidos (con y sin ficha) ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.mano_obra (cotizacion_id, partida_id, tipo, nombre, monto_liquido, jornadas, honorarios) VALUES (:'COT', 'p1', 'liquido', 'Socio César', 150000, 3, TRUE);
INSERT INTO public.mano_obra (cotizacion_id, partida_id, tipo, trabajador_id, monto_liquido, jornadas) VALUES (:'COT', 'p1', 'liquido', :'EXT', 100000, 2);
INSERT INTO public.mano_obra (cotizacion_id, partida_id, tipo, trabajador_id, monto_liquido, jornadas, pagado) VALUES (:'COT', 'p1', 'liquido', :'INT', 60000, 1, TRUE);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(costo = 150000 AND NOT honorarios AND retencion_pct = 0),
  'Líquido sin ficha: cuesta exactamente lo ingresado, sin retención (' || COALESCE(max(costo)::TEXT, 'no se registró') || ')'
  FROM public.mano_obra WHERE nombre = 'Socio César';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(tipo = 'liquido' AND nombre = 'Ingeniera Ríos' AND costo = 100000),
  'Líquido con ficha de externo: no toma el tipo de la ficha (sí el nombre) y cuesta lo ingresado'
  FROM public.mano_obra WHERE trabajador_id = :'EXT' AND monto_liquido = 100000;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(tipo = 'liquido' AND costo = 60000 AND fecha_pago IS NOT NULL),
  'Líquido con ficha de interno: tampoco toma el tipo; pagado queda con su fecha'
  FROM public.mano_obra WHERE trabajador_id = :'INT' AND monto_liquido = 60000;

-- ═══ 4. Servicio externo por horas ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.mano_obra (cotizacion_id, trabajador_id, tipo, horas, monto_liquido, honorarios, presupuesto_linea_id)
VALUES (:'COT', :'EXT', 'externo', 4, 80000, TRUE, :'LSV');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(clase = 'servicio' AND partida_id = 'p2' AND horas = 4 AND costo = 94395 AND retencion_pct = 15.25),
  'Servicio externo por horas: 4 h × $20.000 líquidos con boleta = $94.395, va a «servicio» (' || COALESCE(max(costo)::TEXT, 'no se registró') || ')'
  FROM public.mano_obra WHERE presupuesto_linea_id = :'LSV';

-- ═══ 5. La línea tiene que ser del mismo trabajo ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.mano_obra (cotizacion_id, tipo, nombre, monto_liquido, presupuesto_linea_id)
  VALUES ('f2200000-0000-0000-0000-000000000001', 'liquido', 'Mal asignado', 1000, 'f22a0000-0000-0000-0000-000000000003');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Una línea del presupuesto de otro trabajo se rechaza');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%no es de este trabajo%', 'Una línea del presupuesto de otro trabajo se rechaza');
END $$;
RESET ROLE;

-- ═══ 6. El técnico: sus horas internas, nada más ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND bool_or(personas = 2) AND bool_or(trabajador_id IS NOT NULL),
  'El técnico ve las líneas del trabajo sin costos (con personas y persona) para cargar sus horas'
  FROM public.presupuesto_para_asignar('f2200000-0000-0000-0000-000000000001');
INSERT INTO public.mano_obra (cotizacion_id, trabajador_id, tipo, horas, presupuesto_linea_id) VALUES (:'COT', :'INT', 'interno', 4.5, :'LMO');
DO $$ BEGIN
  INSERT INTO public.mano_obra (cotizacion_id, trabajador_id, tipo, monto_liquido) VALUES ('f2200000-0000-0000-0000-000000000001', 'f22e0000-0000-0000-0000-000000000001', 'liquido', 500000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no puede hacerse un pago líquido');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no puede hacerse un pago líquido');
END $$;
DO $$ BEGIN
  INSERT INTO public.mano_obra (cotizacion_id, tipo, nombre, monto_liquido) VALUES ('f2200000-0000-0000-0000-000000000001', 'externo', 'Amigo', 90000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no puede registrar pagos a externos');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no puede registrar pagos a externos');
END $$;
-- Convertir sus horas en un pago líquido: la RLS de la fase 20 no mira el tipo al cambiar; lo frena el trigger.
DO $$ BEGIN
  UPDATE public.mano_obra SET tipo = 'liquido', monto_liquido = 999999
   WHERE trabajador_id = 'f22e0000-0000-0000-0000-000000000001' AND horas = 4.5;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(tipo = 'interno' AND costo = 23978 AND monto_liquido IS NULL AND partida_id = 'p1'),
  'Sus 4,5 h cuestan $23.978 y no se pueden convertir en un pago líquido (' || COALESCE(max(tipo) || ', ' || max(costo), 'no se registró') || ')'
  FROM public.mano_obra WHERE trabajador_id = :'INT' AND horas = 4.5;

-- ═══ 7. Borrar la línea deja el registro en su partida ═══
-- Con la sesión del técnico todavía puesta: vaciar la referencia no es «cambiar el pago», así que el
-- trigger no lo frena (antes bloqueaba borrar la línea o la ficha).
DELETE FROM public.presupuesto_lineas WHERE id = :'LSV';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(presupuesto_linea_id IS NULL AND partida_id = 'p2' AND costo = 94395 AND clase = 'servicio'),
  'Si se borra la línea del presupuesto, el registro queda en su partida y con su costo'
  FROM public.mano_obra WHERE trabajador_id = :'EXT' AND horas = 4;

-- ═══ 8. El resultado del trabajo sigue sumando mano_obra.costo ═══
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(mano_obra = 95910 + 150000 + 100000 + 60000 + 94395 + 23978),
  'cotizacion_resultado suma la mano de obra, los líquidos y los servicios (' || COALESCE(max(mano_obra)::TEXT, '-') || ')'
  FROM public.cotizacion_resultado WHERE cotizacion_id = :'COT';

-- ═══ 9. Borrar una ficha del equipo no se bloquea por lo registrado ═══
-- Lo registrado de esa persona queda con su nombre y su costo (no se recalcula).
DELETE FROM public.trabajadores WHERE id = :'EXT';
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND bool_and(trabajador_id IS NULL AND nombre = 'Ingeniera Ríos') AND sum(costo) = 100000 + 94395,
  'Al borrar la ficha de un externo, sus registros quedan con su nombre y su costo (' || count(*) || ')'
  FROM public.mano_obra WHERE cotizacion_id = :'COT' AND nombre = 'Ingeniera Ríos';

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE ok IS NOT TRUE) || ' fallas' FROM r;
