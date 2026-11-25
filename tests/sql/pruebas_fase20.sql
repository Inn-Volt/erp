-- Pruebas de la fase 20 (control de proyecto): partida y tipo de costo, equipo y mano de obra,
-- aprobar con primer pago, plan del flujo y cotizaciones copiadas. Corre después de todas las fases.
\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
\set COT 'f2000000-0000-0000-0000-000000000001'
\set ENV 'f2000000-0000-0000-0000-000000000003'
\set INT 'f20e0000-0000-0000-0000-000000000001'
\set EXT 'f20e0000-0000-0000-0000-000000000002'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = :'JOAQUIN';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
-- Producción tiene la primera versión de esta fase (ficha con sueldo bruto): se simula y se pone al
-- día volviendo a correr el archivo, como se hará allá.
ALTER TABLE public.trabajadores DROP COLUMN IF EXISTS sueldo_liquido, DROP COLUMN IF EXISTS afp_pct, DROP COLUMN IF EXISTS salud_pct,
  DROP COLUMN IF EXISTS cesantia_pct, DROP COLUMN IF EXISTS otros_descuentos;
ALTER TABLE public.trabajadores ADD COLUMN IF NOT EXISTS sueldo_bruto NUMERIC(12,0) NOT NULL DEFAULT 0;
\i /tmp/supabase_fase20_control_proyecto.sql
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO r (ok, txt) SELECT count(*) FILTER (WHERE column_name = 'sueldo_bruto') = 0 AND count(*) FILTER (WHERE column_name IN ('sueldo_liquido','afp_pct','salud_pct','cesantia_pct','otros_descuentos')) = 5,
  'La ficha de la primera versión (sueldo bruto) queda con el líquido y los descuentos'
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trabajadores';
-- Con la facturación activa (fase 25): aprobar crea los cobros en «Por facturar».
UPDATE public.ajustes_cotizacion SET facturacion_activa = TRUE WHERE id = 1;
UPDATE public.ajustes_cotizacion SET retencion_honorarios = 15.25,
  plan_cobro = '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]' WHERE id = 1;

-- Un trabajo aprobado con dos partidas.
INSERT INTO public.cotizaciones (id, cliente_id, estado, trabajo_estado, titulo, subtotal, iva, total, costo_directo, items, partidas)
VALUES (:'COT', :'CLI', 'Aprobada', 'por_iniciar', 'Control de proyecto', 1000000, 0, 1000000, 800000,
  '[{"id":"l1","descripcion":"Cable","categoria":"material","cantidad":1,"unidad":"un","costo":300000,"imprevistos":0,"margen":0,"precio":400000,"iva":0,"partidaId":"p1"},
    {"id":"l2","descripcion":"Instalación","categoria":"mano_obra","cantidad":1,"unidad":"un","costo":500000,"imprevistos":0,"margen":0,"precio":600000,"iva":0,"partidaId":"p2"}]',
  '[{"id":"p1","nombre":"Materiales","cantidad":1,"unidad":"global"},{"id":"p2","nombre":"Instalación","cantidad":1,"unidad":"global"}]');

-- ═══ 1. Columnas nuevas: vacías y con sus reglas ═══
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'Gastos y compras tienen partida_id'
  FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'partida_id' AND table_name IN ('gastos','compras');
INSERT INTO r (ok, txt) SELECT NOT EXISTS (SELECT 1 FROM public.gastos WHERE partida_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.compras WHERE partida_id IS NOT NULL OR tipo_costo IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.cotizaciones WHERE flujo_plan IS NOT NULL), 'Lo de antes queda «Sin partida», material y sin plan';
DO $$ BEGIN
  INSERT INTO public.compras (proveedor_nombre, neto, iva, total, tipo_costo) VALUES ('Prueba', 1, 0, 1, 'otro');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El tipo de costo es uno de los 4 (rechaza «otro»)');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El tipo de costo es uno de los 4 (rechaza «otro»)');
END $$;
DO $$ BEGIN
  UPDATE public.cotizaciones SET flujo_plan = '[1, 2]' WHERE id = 'f2000000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El plan del flujo es un objeto (rechaza una lista)');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El plan del flujo es un objeto (rechaza una lista)');
END $$;

-- ═══ 2. El plan del flujo se guarda con el trabajo aprobado ═══
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
DO $$ BEGIN
  UPDATE public.cotizaciones SET flujo_plan = '{"inicio":"2026-11-23","semanas":4,"distribucion":{"p1":[100,0,0,0],"p2":[25,25,25,25]},"hitos":{"Anticipo":1,"Saldo":4}}'
   WHERE id = 'f2000000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (TRUE, 'Quien edita cotizaciones guarda el plan del flujo con el trabajo aprobado');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (FALSE, 'Quien edita cotizaciones guarda el plan del flujo con el trabajo aprobado (' || left(SQLERRM, 80) || ')');
END $$;
DO $$ BEGIN
  UPDATE public.cotizaciones SET plan_cobro = '[{"nombre":"Total","porcentaje":100,"cuando":"terminar"}]' WHERE id = 'f2000000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El plan de cobro sigue sin cambiarse fuera de borrador');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%borrador%', 'El plan de cobro sigue sin cambiarse fuera de borrador');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT (flujo_plan->>'semanas')::INT = 4 AND estado = 'Aprobada' AND revision = 0,
  'El plan quedó guardado sin tocar el estado ni la revisión' FROM public.cotizaciones WHERE id = :'COT';
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
UPDATE public.cotizaciones SET flujo_plan = '{"semanas":1}' WHERE id = :'COT';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT (flujo_plan->>'semanas')::INT = 4, 'El técnico no cambia el plan del flujo' FROM public.cotizaciones WHERE id = :'COT';

-- ═══ 3. Partida al rendir y al comprar ═══
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
DO $$ BEGIN
  INSERT INTO public.gastos (monto, categoria, cotizacion_id, partida_id, boleta_path)
  VALUES (20000, 'combustible', 'f2000000-0000-0000-0000-000000000001', 'p2', 'gastos/f20.jpg');
  INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico rinde un gasto con su partida');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico rinde un gasto con su partida (' || left(SQLERRM, 80) || ')');
END $$;
RESET ROLE;
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.compras (proveedor_nombre, tipo_doc, neto, iva, total, cotizacion_id, partida_id, tipo_costo)
VALUES ('Distribuidora', 'factura', 100000, 19000, 119000, :'COT', 'p1', 'material');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'El gasto quedó en la partida p2' FROM public.gastos WHERE cotizacion_id = :'COT' AND partida_id = 'p2';
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'La compra quedó en la partida p1 como material' FROM public.compras WHERE cotizacion_id = :'COT' AND partida_id = 'p1' AND tipo_costo = 'material';

-- ═══ 4. Equipo y mano de obra ═══
-- Interno: $728.100 líquidos con AFP 11,5 % + salud 7 % + cesantía 0,6 % = $900.000 brutos;
-- + 5 % de aportes ÷ 22 días + colación 3.000 + movilización 2.000 = $47.955 al día (9 h).
INSERT INTO public.trabajadores (id, tipo, nombre, usuario_id, sueldo_liquido, afp_pct, salud_pct, cesantia_pct, aportes_pct, dias_mes, horas_dia, colacion_dia, movilizacion_dia)
VALUES (:'INT', 'interno', 'Joaquín', :'JOAQUIN', 728100, 11.5, 7, 0.6, 5, 22, 9, 3000, 2000);
INSERT INTO public.trabajadores (id, tipo, nombre, valor_jornada, honorarios) VALUES (:'EXT', 'externo', 'Pedro (ayudante)', 50000, TRUE);
INSERT INTO r (ok, txt) SELECT public.trabajador_sueldo_bruto(t) = 900000, 'Del líquido y sus descuentos sale el bruto: $900.000 (' || public.trabajador_sueldo_bruto(t) || ')'
  FROM public.trabajadores t WHERE id = :'INT';
INSERT INTO r (ok, txt) SELECT public.trabajador_costo_dia(t) = 47955, 'Costo del día del interno: $47.955 (' || public.trabajador_costo_dia(t) || ')'
  FROM public.trabajadores t WHERE id = :'INT';
DO $$ BEGIN
  INSERT INTO public.trabajadores (tipo, nombre, afp_pct, salud_pct, cesantia_pct) VALUES ('interno', 'Imposible', 60, 30, 10);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Los descuentos no pueden sumar 100 % o más');
EXCEPTION WHEN check_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'Los descuentos no pueden sumar 100 % o más');
END $$;

SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve los sueldos' FROM public.trabajadores;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(es_yo) AND bool_and(costo_dia IS NULL), 'Para registrar, el técnico solo se ve a sí mismo (sin costos)'
  FROM public.trabajadores_para_registrar();
INSERT INTO public.mano_obra (cotizacion_id, partida_id, trabajador_id, tipo, horas) VALUES (:'COT', 'p2', :'INT', 'interno', 4.5);
DO $$ BEGIN
  INSERT INTO public.mano_obra (cotizacion_id, trabajador_id, tipo, monto_liquido) VALUES ('f2000000-0000-0000-0000-000000000001', 'f20e0000-0000-0000-0000-000000000002', 'externo', 50000);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no registra pagos a otros');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no registra pagos a otros');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT costo = 23978 AND nombre = 'Joaquín', 'Sus 4,5 h cuestan la mitad del día: $23.978 (' || costo || ')'
  FROM public.mano_obra WHERE trabajador_id = :'INT';

SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND bool_and(costo_dia IS NOT NULL OR tipo = 'externo'), 'Quien paga ve a todo el equipo con su costo'
  FROM public.trabajadores_para_registrar();
INSERT INTO public.mano_obra (cotizacion_id, partida_id, trabajador_id, tipo, monto_liquido, honorarios) VALUES (:'COT', 'p2', :'EXT', 'externo', 50000, TRUE);
INSERT INTO public.mano_obra (cotizacion_id, tipo, nombre, monto_liquido, honorarios, pagado) VALUES (:'COT', 'externo', 'Flete sin ficha', 30000, FALSE, TRUE);
DO $$ BEGIN
  INSERT INTO public.mano_obra (cotizacion_id, tipo, horas, nombre) VALUES ('f2000000-0000-0000-0000-000000000001', 'interno', 8, 'Alguien');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Las horas internas exigen la ficha de la persona');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%ficha%', 'Las horas internas exigen la ficha de la persona');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT costo = 58997 AND retencion_pct = 15.25, 'Externo con boleta de honorarios: $50.000 líquidos cuestan $58.997 (' || costo || ')'
  FROM public.mano_obra WHERE trabajador_id = :'EXT';
INSERT INTO r (ok, txt) SELECT costo = 30000 AND fecha_pago IS NOT NULL, 'Sin boleta cuesta lo líquido; pagado queda con su fecha'
  FROM public.mano_obra WHERE nombre = 'Flete sin ficha';
UPDATE public.trabajadores SET sueldo_liquido = 2000000 WHERE id = :'INT';
INSERT INTO r (ok, txt) SELECT costo = 23978, 'Si después cambia el sueldo, lo ya registrado no cambia' FROM public.mano_obra WHERE trabajador_id = :'INT';
INSERT INTO r (ok, txt) SELECT gastos = 20000 AND compras = 100000 AND mano_obra = 23978 + 58997 + 30000,
  'El resultado del trabajo suma la mano de obra (' || mano_obra || ')' FROM public.cotizacion_resultado WHERE cotizacion_id = :'COT';

-- ═══ 5. Aprobar fijando el primer pago ═══
-- La cotización enviada la crea «el servidor» (sin sesión): con sesión, la base la dejaría en borrador.
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, items, enviada_at, valida_hasta)
VALUES (:'ENV', :'CLI', 'Enviada', 'Para aprobar', 840336, 159664, 1000000, '[]', NOW(), CURRENT_DATE + 10);
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
SELECT public.cot_aprobar_con_anticipo(:'ENV', 'Correo del cliente', NULL, NULL, 300000);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'Aprobada' AND jsonb_array_length(plan_cobro) = 2, 'Se aprueba con el primer pago' FROM public.cotizaciones WHERE id = :'ENV';
INSERT INTO r (ok, txt) SELECT COALESCE(max(monto), 0) = 300000, 'El anticipo nace exacto en Por facturar: $300.000 (' || COALESCE(max(monto), 0) || ')'
  FROM public.por_facturar WHERE cotizacion_id = :'ENV' AND hito = 'Anticipo';
INSERT INTO r (ok, txt) SELECT round((plan_cobro->1->>'porcentaje')::NUMERIC, 6) = 70 AND plan_cobro->1->>'cuando' = 'terminar', 'El saldo queda en 70 % al terminar'
  FROM public.cotizaciones WHERE id = :'ENV';

-- ═══ 6. Una copia (o una cotización nueva) nace limpia ═══
UPDATE public.cotizaciones SET inicio_sin_anticipo = 'Cliente paga mañana', aprobacion_estado = 'aprobada', aprobacion_at = NOW() WHERE id = :'COT';
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
SELECT set_config('prueba.copia', public.cot_clonar('f2000000-0000-0000-0000-000000000001')::TEXT, false);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT flujo_plan IS NULL AND estado = 'Borrador', 'La copia nace en borrador y sin plan del flujo'
  FROM public.cotizaciones WHERE id = current_setting('prueba.copia')::UUID;
INSERT INTO r (ok, txt) SELECT inicio_sin_anticipo IS NULL AND aprobacion_estado IS NULL AND aprobacion_at IS NULL,
  'La copia no hereda «partió sin anticipo» ni la aprobación de descuento' FROM public.cotizaciones WHERE id = current_setting('prueba.copia')::UUID;
INSERT INTO r (ok, txt) SELECT flujo_plan IS NOT NULL AND aprobacion_estado = 'aprobada', 'La original conserva lo suyo' FROM public.cotizaciones WHERE id = :'COT';
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, flujo_plan) VALUES ('f2000000-0000-0000-0000-000000000002', :'CLI', 'Borrador', 'Nueva', '{"semanas":2}');
INSERT INTO r (ok, txt) SELECT flujo_plan IS NULL, 'Una cotización nueva nace sin plan del flujo' FROM public.cotizaciones WHERE id = 'f2000000-0000-0000-0000-000000000002';

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
