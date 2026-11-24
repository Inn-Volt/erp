\set ON_ERROR_STOP 0
\set QUIET 1
-- Calculadora HH (fase 23): semillas, quién configura y quién solo usa la calculadora (RLS y el
-- trigger de los cargos de cada persona), la UF a mano, guardar cálculos y no borrar cargos usados.
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
SELECT set_config('request.jwt.claim.sub', '', false);

-- César es Administrador ('*'); Joaquín solo usa la calculadora (hh.ver).
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
INSERT INTO public.roles (clave, nombre, permisos) VALUES ('prueba_hh', 'Usa la calculadora HH', ARRAY['hh.ver'])
  ON CONFLICT (clave) DO UPDATE SET permisos = EXCLUDED.permisos;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'prueba_hh';

-- ═══ A. Semillas ═══
INSERT INTO r (ok, txt) SELECT count(*) = 11 AND count(*) FILTER (WHERE moneda_base = 'USD') = 3, '11 cargos HH (3 en USD)' FROM public.hh_cargos;
INSERT INTO r (ok, txt) SELECT count(*) = 5 AND bool_and(multiplicador = CASE clave WHEN 'interfaz' THEN 3 WHEN 'logica' THEN 2 WHEN 'integracion' THEN 1.3 ELSE 1 END),
  '5 tipos de tarea con su multiplicador' FROM public.hh_tipos_tarea;
INSERT INTO r (ok, txt) SELECT count(*) = 38 AND bool_and(tipo_tarea_clave IS NOT NULL) AND count(*) FILTER (WHERE categoria = 'Pantallas LED' OR nombre ILIKE '%pantalla%') = 0,
  '38 trabajos tipo con su tipo de tarea (sin pantallas LED)' FROM public.hh_trabajos_tipo;
INSERT INTO r (ok, txt) SELECT count(*) = 4 AND bool_and(t.tipo_tarea_clave = v.tipo), 'Visita y NVR son coordinación; landing es interfaz; MVP es lógica'
  FROM public.hh_trabajos_tipo t JOIN (VALUES ('Visita técnica / diagnóstico', 'coordinacion'), ('Configuración NVR + app + usuarios', 'coordinacion'),
    ('Landing page (1 página)', 'interfaz'), ('App web a medida (MVP)', 'logica')) AS v(nombre, tipo) ON v.nombre = t.nombre;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(c.nombre = 'Instalador eléctrico SEC (declara TE1/TE4)' AND a.nombre = 'Ayudante eléctrico' AND t.hh_apoyo = 6),
  'El cambio de tablero va con instalador SEC y 6 HH de ayudante'
  FROM public.hh_trabajos_tipo t JOIN public.hh_cargos c ON c.id = t.cargo_principal_id JOIN public.hh_cargos a ON a.id = t.cargo_apoyo_id
  WHERE t.nombre = 'Cambio tablero domiciliario (hasta 12 circuitos)';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(horas_facturables_mes = 140 AND factor_costo_empresa = 1.35 AND uf_respaldo = 41350.42 AND redondeo_total = 1000 AND validez_dias = 15 AND gestion_proyecto = 0.10),
  'Una sola fila de parámetros con los valores del Excel (y gestión 10 %)' FROM public.hh_parametros;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'César y Joaquín en el equipo HH, sin cargos' FROM public.hh_personas p
  WHERE nombre IN ('César', 'Joaquín') AND NOT EXISTS (SELECT 1 FROM public.hh_persona_cargos pc WHERE pc.persona_id = p.id);

-- Volver a correr el archivo no pisa una tarifa cambiada ni duplica semillas.
UPDATE public.hh_cargos SET tarifa_base = 0.8 WHERE nombre = 'Instalador eléctrico SEC (declara TE1/TE4)';
\i /tmp/supabase_fase23_calculo_hh.sql
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO r (ok, txt) SELECT (SELECT count(*) FROM public.hh_cargos) = 11 AND (SELECT count(*) FROM public.hh_trabajos_tipo) = 38
  AND (SELECT tarifa_base FROM public.hh_cargos WHERE nombre = 'Instalador eléctrico SEC (declara TE1/TE4)') = 0.8,
  'Idempotente: no duplica semillas ni pisa la tarifa cambiada';

-- Joaquín vinculado a su usuario. Los id de las personas, para usarlos como Joaquín (que no ve a César).
UPDATE public.hh_personas SET profile_id = :'JOAQUIN' WHERE nombre = 'Joaquín';
CREATE TEMP TABLE pers AS SELECT nombre, id FROM public.hh_personas;
GRANT SELECT ON pers TO authenticated;

-- ═══ B. Quien solo usa la calculadora no toca la configuración ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 11, 'Joaquín ve los cargos' FROM public.hh_cargos;
UPDATE public.hh_cargos SET tarifa_base = 2 WHERE nombre = 'Maestro electricista';
UPDATE public.hh_parametros SET utilidad_minima = 0.9;
UPDATE public.hh_tipos_tarea SET multiplicador = 10 WHERE clave = 'interfaz';
DO $$ BEGIN
  INSERT INTO public.hh_cargos (nombre, tarifa_base) VALUES ('Cargo inventado', 5);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No crea cargos');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No crea cargos');
END $$;
DO $$ BEGIN
  INSERT INTO public.hh_indicadores (fecha, uf, usd, fuente) VALUES (CURRENT_DATE, 40000, 900, 'manual');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No fija la UF a mano');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No fija la UF a mano');
END $$;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'No ve usuarios para vincular' FROM public.hh_usuarios_para_vincular();
RESET ROLE;
INSERT INTO r (ok, txt) SELECT (SELECT tarifa_base FROM public.hh_cargos WHERE nombre = 'Maestro electricista') = 0.5
  AND (SELECT utilidad_minima FROM public.hh_parametros) = 0.3 AND (SELECT multiplicador FROM public.hh_tipos_tarea WHERE clave = 'interfaz') = 3,
  'Tarifas, parámetros y multiplicadores quedan como estaban';

-- ═══ C. Mis cargos HH: los suyos, entre los activos, sin tarifa ═══
SELECT set_config('request.jwt.claim.sub', '', false);
UPDATE public.hh_cargos SET activo = FALSE WHERE nombre = 'Diseño UI / UX (dashboards, web)';
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO public.hh_persona_cargos (persona_id, cargo_id, predeterminado)
  SELECT p.id, c.id, TRUE FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'Joaquín' AND c.nombre = 'Maestro electricista';
INSERT INTO public.hh_persona_cargos (persona_id, cargo_id)
  SELECT p.id, c.id FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'Joaquín' AND c.nombre = 'Técnico instalador solar FV';
DO $$ BEGIN
  INSERT INTO public.hh_persona_cargos (persona_id, cargo_id, tarifa_base_propia)
    SELECT p.id, c.id, 2 FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'Joaquín' AND c.nombre = 'Desarrollador full stack';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No se pone una tarifa propia');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%tarifas%', 'No se pone una tarifa propia');
END $$;
DO $$ BEGIN
  INSERT INTO public.hh_persona_cargos (persona_id, cargo_id)
    SELECT p.id, c.id FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'Joaquín' AND c.nombre = 'Diseño UI / UX (dashboards, web)';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No elige un cargo inactivo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%no está activo%', 'No elige un cargo inactivo');
END $$;
DO $$ BEGIN
  INSERT INTO public.hh_persona_cargos (persona_id, cargo_id)
    SELECT p.id, c.id FROM pers p, public.hh_cargos c WHERE p.nombre = 'César' AND c.nombre = 'Ayudante eléctrico';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No le asigna cargos a otra persona');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No le asigna cargos a otra persona');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND count(*) FILTER (WHERE predeterminado) = 1, 'Joaquín eligió 2 cargos (uno predeterminado)'
  FROM public.hh_persona_cargos pc JOIN public.hh_personas p ON p.id = pc.persona_id WHERE p.nombre = 'Joaquín';

-- Quien configura le pone una tarifa propia y le asigna un cargo a César.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
UPDATE public.hh_persona_cargos SET tarifa_base_propia = 0.6
 WHERE cargo_id = (SELECT id FROM public.hh_cargos WHERE nombre = 'Maestro electricista')
   AND persona_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Joaquín');
INSERT INTO public.hh_persona_cargos (persona_id, cargo_id, tarifa_base_propia)
  SELECT p.id, c.id, 40 FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'César' AND c.nombre = 'Desarrollador full stack';
INSERT INTO r (ok, txt) SELECT count(*) >= 2, 'Quien configura ve los usuarios para vincular' FROM public.hh_usuarios_para_vincular();
RESET ROLE;

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
-- Marca otro predeterminado (se desmarca el anterior) y desactiva el que tenía tarifa propia.
UPDATE public.hh_persona_cargos SET predeterminado = TRUE
 WHERE cargo_id = (SELECT id FROM public.hh_cargos WHERE nombre = 'Técnico instalador solar FV')
   AND persona_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Joaquín');
DO $$ BEGIN
  UPDATE public.hh_persona_cargos SET tarifa_base_propia = 0.9
   WHERE cargo_id = (SELECT id FROM public.hh_cargos WHERE nombre = 'Maestro electricista')
     AND persona_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Joaquín');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No cambia su tarifa propia');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%tarifas%', 'No cambia su tarifa propia');
END $$;
UPDATE public.hh_persona_cargos SET activo = FALSE
 WHERE cargo_id = (SELECT id FROM public.hh_cargos WHERE nombre = 'Maestro electricista')
   AND persona_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Joaquín');
-- Lo de César no lo toca ni lo borra; lo suyo no lo borra (lo desactiva).
UPDATE public.hh_persona_cargos SET activo = FALSE WHERE persona_id = (SELECT id FROM pers WHERE nombre = 'César');
DELETE FROM public.hh_persona_cargos;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(c.nombre = 'Técnico instalador solar FV'), 'Un solo predeterminado: el último que marcó'
  FROM public.hh_persona_cargos pc JOIN public.hh_cargos c ON c.id = pc.cargo_id JOIN public.hh_personas p ON p.id = pc.persona_id
  WHERE p.nombre = 'Joaquín' AND pc.predeterminado;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(NOT pc.activo AND pc.tarifa_base_propia = 0.6), 'Al quitarlo queda inactivo y conserva la tarifa propia'
  FROM public.hh_persona_cargos pc JOIN public.hh_cargos c ON c.id = pc.cargo_id JOIN public.hh_personas p ON p.id = pc.persona_id
  WHERE p.nombre = 'Joaquín' AND c.nombre = 'Maestro electricista';
INSERT INTO r (ok, txt) SELECT count(*) = 3 AND count(*) FILTER (WHERE p.nombre = 'César' AND pc.activo) = 1,
  'No borra cargos ni toca los de César' FROM public.hh_persona_cargos pc JOIN public.hh_personas p ON p.id = pc.persona_id;

-- ═══ D. UF a mano y cálculos guardados ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.hh_indicadores (fecha, uf, usd, fuente) VALUES ('2026-11-23', 41400, 950, 'manual')
  ON CONFLICT (fecha) DO UPDATE SET uf = EXCLUDED.uf, usd = EXCLUDED.usd, fuente = EXCLUDED.fuente;
DO $$ BEGIN
  INSERT INTO public.hh_indicadores (fecha, uf, usd, fuente) VALUES ('2026-11-24', 4140, 950, 'manual');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Una UF fuera de rango no se guarda');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Una UF fuera de rango no se guarda');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(fuente = 'manual'), 'Quien configura fija la UF a mano' FROM public.hh_indicadores WHERE fecha = '2026-11-23';

CREATE TEMP TABLE ids (quien TEXT, id UUID);
GRANT ALL ON ids TO authenticated;
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO ids SELECT 'joaquin', public.hh_guardar_calculo(
  jsonb_build_object('nombre', 'Kit cámaras', 'cliente_texto', 'Cliente de prueba', 'uf_usada', 41400, 'usd_usada', 950, 'neto_clp', 300000),
  jsonb_build_array(jsonb_build_object('descripcion', 'Kit 4 cámaras completo', 'cargo_id', (SELECT id FROM public.hh_cargos WHERE nombre = 'Técnico CCTV / control de acceso'),
    'cargo_nombre', 'Técnico CCTV / control de acceso', 'cargo_moneda', 'UF', 'cargo_tarifa_base', 0.5, 'cargo_tarifa_clp', 20700,
    'cantidad', 1, 'horas_reales', 12, 'multiplicador', 1, 'horas_cobradas', 12, 'subtotal_clp', 248400)));
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(c.created_by = '22222222-2222-2222-2222-222222222222' AND (SELECT count(*) FROM public.hh_calculo_lineas l WHERE l.calculo_id = c.id) = 1),
  'Joaquín guarda un cálculo con su línea' FROM public.hh_calculos c JOIN ids ON ids.id = c.id AND ids.quien = 'joaquin';

SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO ids SELECT 'cesar', public.hh_guardar_calculo(jsonb_build_object('nombre', 'Landing', 'uf_usada', 41400, 'usd_usada', 950,
  'materiales_clp', 100000, 'margen_materiales', 0.25, 'materiales_venta_clp', 120000, 'gestion_pct', 0.12,
  'operacion', jsonb_build_array(jsonb_build_object('descripcion', 'Traslado', 'monto', 25000))), '[]'::JSONB);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(materiales_venta_clp = 120000 AND gestion_pct = 0.12 AND operacion->0->>'descripcion' = 'Traslado'
  AND (operacion->0->>'monto')::NUMERIC = 25000), 'Se guardan el precio de los materiales, la operación y la gestión'
  FROM public.hh_calculos WHERE id = (SELECT id FROM ids WHERE quien = 'cesar');

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Joaquín ve sus cálculos, no los de César (está sobre él)' FROM public.hh_calculos;
DO $$ BEGIN
  PERFORM public.hh_guardar_calculo(jsonb_build_object('id', (SELECT id FROM ids WHERE quien = 'cesar'), 'nombre', 'Cambiado', 'uf_usada', 41400, 'usd_usada', 950), '[]'::JSONB);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No cambia el cálculo de otro');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%otra persona%', 'No cambia el cálculo de otro');
END $$;
DELETE FROM public.hh_calculos WHERE id = (SELECT id FROM ids WHERE quien = 'cesar');
-- Al volver a guardar el suyo, las líneas se reemplazan (sin duplicarse).
SELECT public.hh_guardar_calculo(
  jsonb_build_object('id', (SELECT id FROM ids WHERE quien = 'joaquin'), 'nombre', 'Kit cámaras v2', 'uf_usada', 41400, 'usd_usada', 950),
  jsonb_build_array(
    jsonb_build_object('descripcion', 'Kit', 'cargo_id', (SELECT id FROM public.hh_cargos WHERE nombre = 'Técnico CCTV / control de acceso'), 'cargo_nombre', 'Técnico CCTV',
      'cargo_moneda', 'UF', 'cargo_tarifa_base', 0.5, 'cargo_tarifa_clp', 20700, 'cantidad', 1, 'horas_reales', 10, 'horas_cobradas', 10, 'subtotal_clp', 207000),
    jsonb_build_object('descripcion', 'Configuración NVR', 'cargo_id', (SELECT id FROM public.hh_cargos WHERE nombre = 'Técnico CCTV / control de acceso'), 'cargo_nombre', 'Técnico CCTV',
      'cargo_moneda', 'UF', 'cargo_tarifa_base', 0.5, 'cargo_tarifa_clp', 20700, 'cantidad', 1, 'horas_reales', 2, 'horas_cobradas', 2, 'subtotal_clp', 41400))) \gset ignorar_
RESET ROLE;
INSERT INTO r (ok, txt) SELECT (SELECT nombre FROM public.hh_calculos WHERE id = (SELECT id FROM ids WHERE quien = 'cesar')) = 'Landing',
  'No borra el cálculo de otro';
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND bool_or(orden = 1 AND descripcion = 'Configuración NVR'), 'Volver a guardar reemplaza las líneas en orden'
  FROM public.hh_calculo_lineas WHERE calculo_id = (SELECT id FROM ids WHERE quien = 'joaquin');

-- ═══ E. Un cargo usado no se borra (se desactiva) y anon no ve nada ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  DELETE FROM public.hh_cargos WHERE nombre = 'Técnico CCTV / control de acceso';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Un cargo usado no se puede borrar');
EXCEPTION WHEN foreign_key_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Un cargo usado no se puede borrar');
END $$;
INSERT INTO public.hh_cargos (nombre, tarifa_base) VALUES ('Cargo de prueba sin usar', 1);
DELETE FROM public.hh_cargos WHERE nombre = 'Cargo de prueba sin usar';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'Uno sin usar sí se borra' FROM public.hh_cargos WHERE nombre = 'Cargo de prueba sin usar';

SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
DO $$ BEGIN
  PERFORM 1 FROM public.hh_cargos;
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Sin sesión no se ve nada');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Sin sesión no se ve nada');
END $$;
RESET ROLE;

-- ═══ F. Equipo por jerarquía: César → Joaquín → Pedro ═══
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Joaquín quedó a cargo de César'
  FROM public.hh_personas j JOIN public.hh_personas c ON c.id = j.jefe_id WHERE j.nombre = 'Joaquín' AND c.nombre = 'César';

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(nombre = 'Joaquín'), 'Joaquín ve su persona, no a César' FROM public.hh_personas;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'No ve los cargos ni las tarifas de César'
  FROM public.hh_persona_cargos WHERE persona_id = (SELECT id FROM pers WHERE nombre = 'César');
-- Agrega a Pedro a su cargo y le maneja cargo y tarifa (de su equipo hacia abajo).
INSERT INTO public.hh_personas (nombre, jefe_id) VALUES ('Pedro (ayudante)', (SELECT id FROM pers WHERE nombre = 'Joaquín'));
INSERT INTO public.hh_persona_cargos (persona_id, cargo_id, tarifa_base_propia, predeterminado)
  SELECT p.id, c.id, 0.25, TRUE FROM public.hh_personas p, public.hh_cargos c WHERE p.nombre = 'Pedro (ayudante)' AND c.nombre = 'Ayudante eléctrico';
UPDATE public.hh_persona_cargos SET tarifa_base_propia = 0.28 WHERE persona_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Pedro (ayudante)');
DO $$ BEGIN
  INSERT INTO public.hh_personas (nombre, jefe_id) VALUES ('Bajo César', (SELECT id FROM pers WHERE nombre = 'César'));
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No agrega personas fuera de su equipo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No agrega personas fuera de su equipo');
END $$;
DO $$ BEGIN
  INSERT INTO public.hh_personas (nombre, jefe_id, profile_id) VALUES ('Con usuario', (SELECT id FROM pers WHERE nombre = 'Joaquín'), '11111111-1111-1111-1111-111111111111');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No vincula usuarios');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'No vincula usuarios');
END $$;
UPDATE public.hh_personas SET jefe_id = NULL WHERE nombre = 'Joaquín';
UPDATE public.hh_personas SET nombre = 'César cambiado' WHERE id = (SELECT id FROM pers WHERE nombre = 'César');
-- Calcula con Pedro, no con César.
INSERT INTO ids SELECT 'pedro', public.hh_guardar_calculo(
  jsonb_build_object('nombre', 'Con Pedro', 'uf_usada', 41400, 'usd_usada', 950),
  jsonb_build_array(jsonb_build_object('descripcion', 'Apoyo', 'persona_id', (SELECT id FROM public.hh_personas WHERE nombre = 'Pedro (ayudante)'),
    'persona_nombre', 'Pedro (ayudante)', 'cargo_id', (SELECT id FROM public.hh_cargos WHERE nombre = 'Ayudante eléctrico'), 'cargo_nombre', 'Ayudante eléctrico',
    'cargo_moneda', 'UF', 'cargo_tarifa_base', 0.28, 'cargo_tarifa_clp', 11600, 'cantidad', 1, 'horas_reales', 4, 'horas_cobradas', 4, 'subtotal_clp', 46400)));
DO $$ BEGIN
  PERFORM public.hh_guardar_calculo(jsonb_build_object('nombre', 'Con César', 'uf_usada', 41400, 'usd_usada', 950),
    jsonb_build_array(jsonb_build_object('descripcion', 'Desarrollo', 'persona_id', (SELECT id FROM pers WHERE nombre = 'César'), 'persona_nombre', 'César',
      'cargo_id', (SELECT id FROM public.hh_cargos WHERE nombre = 'Desarrollador full stack'), 'cargo_nombre', 'Desarrollador full stack',
      'cargo_moneda', 'USD', 'cargo_tarifa_base', 40, 'cargo_tarifa_clp', 38000, 'cantidad', 1, 'horas_reales', 1, 'horas_cobradas', 1, 'subtotal_clp', 38000)));
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No calcula con las HH de César');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%tu equipo%', 'No calcula con las HH de César');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(pc.tarifa_base_propia = 0.28 AND j.nombre = 'Joaquín'), 'Pedro quedó a cargo de Joaquín con su tarifa'
  FROM public.hh_personas p JOIN public.hh_personas j ON j.id = p.jefe_id JOIN public.hh_persona_cargos pc ON pc.persona_id = p.id
  WHERE p.nombre = 'Pedro (ayudante)';
INSERT INTO r (ok, txt) SELECT (SELECT count(*) FROM public.hh_personas WHERE nombre = 'César') = 1
  AND (SELECT c.nombre FROM public.hh_personas j JOIN public.hh_personas c ON c.id = j.jefe_id WHERE j.nombre = 'Joaquín') = 'César',
  'No toca a César ni se saca de su jefe';
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Su cálculo con Pedro se guardó' FROM public.hh_calculos WHERE id = (SELECT id FROM ids WHERE quien = 'pedro');

-- Quien configura ve y maneja todo; el equipo no admite círculos.
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) >= 3, 'César ve a todo el equipo' FROM public.hh_personas;
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'César ve los cálculos de Joaquín' FROM public.hh_calculos WHERE created_by = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  UPDATE public.hh_personas SET jefe_id = (SELECT id FROM public.hh_personas WHERE nombre = 'Pedro (ayudante)') WHERE nombre = 'César';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Sin círculos en el equipo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%círculo%', 'Sin círculos en el equipo');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
