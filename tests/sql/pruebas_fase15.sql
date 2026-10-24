\set ON_ERROR_STOP 0
\set QUIET 1
CREATE TEMP TABLE r (n SERIAL, ok BOOLEAN, txt TEXT);
GRANT ALL ON r TO authenticated; GRANT ALL ON SEQUENCE r_n_seq TO authenticated;
CREATE OR REPLACE FUNCTION pg_temp.como(uid TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', uid, false); $$;
\set CESAR '11111111-1111-1111-1111-111111111111'
\set JOAQUIN '22222222-2222-2222-2222-222222222222'
\set VENDE '33333333-3333-3333-3333-333333333333'
\set CLI 'aaaaaaaa-0000-0000-0000-000000000001'
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (:'VENDE', 'vende@innvolt.cl', '{"nombre":"Vende"}') ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'CESAR', id FROM public.roles WHERE clave = 'admin' ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id IN (:'JOAQUIN', :'VENDE');
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'JOAQUIN', id FROM public.roles WHERE clave = 'tecnico';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT :'VENDE', id FROM public.roles WHERE clave = 'comercial';
DELETE FROM public.notificaciones;

-- 1. RUT
INSERT INTO r (ok, txt) SELECT public.rut_valido('12.345.678-5') AND public.rut_valido('11.111.111-1') AND public.rut_valido('76543210-3')
  AND NOT public.rut_valido('12.345.678-9') AND NOT public.rut_valido('') AND NOT public.rut_valido('abc'), 'RUT: valida el dígito verificador';

-- 2. La solicitud sigue a su visita
INSERT INTO public.solicitudes (id, cliente_id, descripcion, estado, origen, contacto_telefono)
VALUES ('5a000000-0000-0000-0000-000000000001', :'CLI', 'Tres boxes nuevos: enchufes, LED y tablero', 'NUEVA', 'Instagram', '+56 9 1111 1111');
INSERT INTO r (ok, txt) SELECT origen = 'Instagram' AND contacto_telefono IS NOT NULL, 'La solicitud guarda origen y teléfono' FROM public.solicitudes WHERE id = '5a000000-0000-0000-0000-000000000001';
INSERT INTO public.agendamientos (id, titulo, fecha, solicitud_id, cliente_id, contacto_sitio, telefono_sitio)
VALUES ('a1500000-0000-0000-0000-000000000001', 'Visita técnica', '2026-11-10', '5a000000-0000-0000-0000-000000000001', :'CLI', 'Dra. Rojas', '+56 9 1111 1111');
INSERT INTO r (ok, txt) SELECT estado = 'VISITA_AGENDADA' AND historial::TEXT LIKE '%Visita agendada para el 10-11-2026%', 'Agendar la visita: la solicitud pasa a «Visita agendada»' FROM public.solicitudes WHERE id = '5a000000-0000-0000-0000-000000000001';
UPDATE public.agendamientos SET estado = 'Realizada' WHERE id = 'a1500000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT estado = 'LISTA_COTIZAR', 'Visita realizada: la solicitud queda «Lista para cotizar»' FROM public.solicitudes WHERE id = '5a000000-0000-0000-0000-000000000001';
UPDATE public.solicitudes SET estado = 'COTIZACION_GENERADA' WHERE id = '5a000000-0000-0000-0000-000000000001';
UPDATE public.agendamientos SET estado = 'Reprogramada', fecha = '2026-11-12' WHERE id = 'a1500000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT estado = 'COTIZACION_GENERADA', 'Una solicitud ya cotizada no retrocede por la agenda' FROM public.solicitudes WHERE id = '5a000000-0000-0000-0000-000000000001';

-- 3. Avisos por rol: la solicitud nueva no le llega al técnico
INSERT INTO r (ok, txt) SELECT NOT EXISTS (SELECT 1 FROM public.notificaciones WHERE usuario_id = :'JOAQUIN' AND tipo = 'solicitud_nueva')
  AND EXISTS (SELECT 1 FROM public.notificaciones WHERE usuario_id = :'VENDE' AND tipo = 'solicitud_nueva'), 'Solicitud nueva: le llega al vendedor, no al técnico';

-- 4. Trabajo y anticipo
UPDATE public.ajustes_cotizacion SET plan_cobro = '[{"nombre":"Anticipo","porcentaje":50,"cuando":"aprobar"},{"nombre":"Saldo","porcentaje":50,"cuando":"terminar"}]'::JSONB, costo_hora = 8000 WHERE id = 1;
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, costo_directo, vendedor_id, items)
VALUES ('c1500000-0000-0000-0000-000000000001', :'CLI', 'Borrador', 'Boxes clínica', 1000000, 190000, 1190000, 600000, :'VENDE', '[]'),
       ('c1500000-0000-0000-0000-000000000002', :'CLI', 'Borrador', 'Otra obra', 500000, 95000, 595000, 300000, :'VENDE', '[]');
SET LOCAL innvolt.transicion = 'on';
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() WHERE id IN ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002');
UPDATE public.cotizaciones SET estado = 'Aprobada' WHERE id IN ('c1500000-0000-0000-0000-000000000001','c1500000-0000-0000-0000-000000000002');
INSERT INTO r (ok, txt) SELECT count(*) = 2 AND sum(monto) = 1190000 / 2 + 595000 / 2 + 0.5 - 0.5, 'Al aprobar nacen los anticipos'
  FROM public.por_facturar WHERE hito = 'Anticipo';
INSERT INTO r (ok, txt) SELECT public.anticipo_pendiente('c1500000-0000-0000-0000-000000000001') = 595000, 'Anticipo pendiente: $595.000';
SELECT pg_temp.como(:'CESAR');
DO $$ BEGIN
  UPDATE public.cotizaciones SET trabajo_estado = 'en_ejecucion' WHERE id = 'c1500000-0000-0000-0000-000000000001';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'No parte con el anticipo impago');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE 'ANTICIPO_PENDIENTE%$595.000%', 'No parte con el anticipo impago (' || left(SQLERRM, 70) || ')');
END $$;
UPDATE public.cotizaciones SET trabajo_estado = 'en_ejecucion', inicio_sin_anticipo = 'Cliente paga mañana por transferencia' WHERE id = 'c1500000-0000-0000-0000-000000000001';
INSERT INTO r (ok, txt) SELECT trabajo_estado = 'en_ejecucion' AND inicio_sin_anticipo IS NOT NULL, 'Con motivo, parte y queda registrado por qué' FROM public.cotizaciones WHERE id = 'c1500000-0000-0000-0000-000000000001';
UPDATE public.por_facturar SET monto_pagado = monto, etapa = 'facturado', numero_factura = '1001' WHERE cotizacion_id = 'c1500000-0000-0000-0000-000000000002' AND hito = 'Anticipo';
UPDATE public.cotizaciones SET trabajo_estado = 'en_ejecucion' WHERE id = 'c1500000-0000-0000-0000-000000000002';
INSERT INTO r (ok, txt) SELECT trabajo_estado = 'en_ejecucion', 'Con el anticipo pagado parte sin preguntar' FROM public.cotizaciones WHERE id = 'c1500000-0000-0000-0000-000000000002';

-- 5. Factura única y aviso «Por facturar» también a quien terminó
DO $$ BEGIN
  UPDATE public.por_facturar SET numero_factura = '1001' WHERE cotizacion_id = 'c1500000-0000-0000-0000-000000000001' AND hito = 'Anticipo';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La misma factura no se repite en otro trabajo');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE '%1001%otro trabajo%', 'La misma factura no se repite en otro trabajo');
END $$;
UPDATE public.cotizaciones SET trabajo_estado = 'terminado' WHERE id = 'c1500000-0000-0000-0000-000000000002';
UPDATE public.por_facturar SET numero_factura = '1001' WHERE cotizacion_id = 'c1500000-0000-0000-0000-000000000002' AND hito = 'Saldo';
INSERT INTO r (ok, txt) SELECT count(*) = 2, 'Una factura sí puede cubrir dos cobros del mismo trabajo' FROM public.por_facturar WHERE numero_factura = '1001';
INSERT INTO r (ok, txt) SELECT count(*) >= 1, '«Por facturar: Saldo» le llega también a quien terminó el trabajo'
  FROM public.notificaciones WHERE usuario_id = :'CESAR' AND tipo = 'por_facturar' AND titulo LIKE '%Saldo%';
INSERT INTO r (ok, txt) SELECT NOT EXISTS (SELECT 1 FROM public.notificaciones WHERE usuario_id = :'JOAQUIN' AND tipo IN ('trabajo_terminado','cotizacion_aceptada')),
  'Trabajo terminado y cotización aceptada no le llegan al técnico';

-- 6. Compras y horas → resultado real
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve las compras' FROM public.compras;
DO $$ BEGIN
  INSERT INTO public.compras (proveedor_nombre, neto, iva, total) VALUES ('Sodimac', 100, 19, 119);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no registra compras');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no registra compras');
END $$;
INSERT INTO public.horas_trabajo (cotizacion_id, horas, costo_hora, nota) VALUES ('c1500000-0000-0000-0000-000000000001', 6, 999999, 'Canalización');
INSERT INTO r (ok, txt) SELECT costo_hora = 8000 AND usuario_id = '22222222-2222-2222-2222-222222222222', 'El técnico anota sus horas; el costo hora lo pone el sistema (no él)' FROM public.horas_trabajo;
DO $$ BEGIN
  INSERT INTO public.horas_trabajo (cotizacion_id, usuario_id, horas) VALUES ('c1500000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no anota horas a nombre de otro');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no anota horas a nombre de otro');
END $$;
RESET ROLE;
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO public.compras (proveedor_rut, proveedor_nombre, tipo_doc, folio, neto, iva, total, cotizacion_id)
VALUES ('76.123.456-0', 'Distribuidora Eléctrica', 'factura', '555', 300000, 57000, 357000, 'c1500000-0000-0000-0000-000000000001'),
       (NULL, 'Ferretería del barrio', 'boleta', NULL, 0, 0, 23800, 'c1500000-0000-0000-0000-000000000001');
DO $$ BEGIN
  INSERT INTO public.compras (proveedor_rut, proveedor_nombre, tipo_doc, folio, neto, iva, total) VALUES ('76123456-0', 'Distribuidora Eléctrica', 'factura', ' 555 ', 1, 0, 1);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La misma factura de un proveedor no se ingresa dos veces');
EXCEPTION WHEN unique_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La misma factura de un proveedor no se ingresa dos veces');
END $$;
INSERT INTO r (ok, txt) SELECT compras = 323800 AND horas = 6 AND costo_horas = 48000 AND gastos = 0,
  'Resultado del trabajo: compras netas $323.800 (factura sin IVA + boleta) y 6 h = $48.000 (' || compras || ' / ' || costo_horas || ')'
  FROM public.cotizacion_resultado WHERE cotizacion_id = 'c1500000-0000-0000-0000-000000000001';
RESET ROLE;

-- 7. Seguimiento automático
SELECT set_config('request.jwt.claim.sub', '', false);
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, vendedor_id, items, enviada_at, valida_hasta)
VALUES ('c1500000-0000-0000-0000-000000000003', :'CLI', 'Borrador', 'Seguimiento', 100000, 19000, 119000, :'VENDE', '[]', NULL, NULL);
UPDATE public.cotizaciones SET estado = 'Enviada', enviada_at = NOW() - INTERVAL '4 days', valida_hasta = (NOW() AT TIME ZONE 'America/Santiago')::DATE + 1
 WHERE id = 'c1500000-0000-0000-0000-000000000003';
DELETE FROM public.tareas;
INSERT INTO r (ok, txt) SELECT public.seguimiento_cotizaciones() >= 2, 'Seguimiento: crea la tarea y el aviso por vencer';
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(asignado_id = :'VENDE') AND bool_and(titulo LIKE 'Llamar a %'), 'Tarea «Llamar…» al responsable' FROM public.tareas;
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(titulo LIKE '%vence mañana'), 'Aviso «vence mañana» al responsable'
  FROM public.notificaciones WHERE usuario_id = :'VENDE' AND tipo = 'cotizacion_por_vencer';
INSERT INTO r (ok, txt) SELECT public.seguimiento_cotizaciones() = 0, 'No se repite al día siguiente';
UPDATE public.cotizaciones SET enviada_at = NOW() - INTERVAL '5 days' WHERE id = 'c1500000-0000-0000-0000-000000000003';
INSERT INTO r (ok, txt) SELECT seguimiento_at IS NULL AND aviso_vence_at IS NULL, 'Al reenviarla, los recordatorios se reprograman' FROM public.cotizaciones WHERE id = 'c1500000-0000-0000-0000-000000000003';

-- 8. Aprobación del gerente
UPDATE public.ajustes_cotizacion SET descuento_max = 10, utilidad_min = 30 WHERE id = 1;
INSERT INTO public.cotizaciones (id, cliente_id, estado, titulo, subtotal, iva, total, costo_directo, vendedor_id, items)
VALUES ('c1500000-0000-0000-0000-000000000004', :'CLI', 'Borrador', 'Con descuento', 100000, 19000, 119000, 80000, :'VENDE',
        '[{"id":"l1","descripcion":"Algo","descuento":20}]');
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) LIKE 'Descuento de 20 %%Utilidad de 20 %%', 'Motivo: ' || public.cot_motivo_aprobacion(c) FROM public.cotizaciones c WHERE id = 'c1500000-0000-0000-0000-000000000004';
SELECT pg_temp.como(:'VENDE');
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.cot_enviar('c1500000-0000-0000-0000-000000000004', 'enlace', NULL);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El vendedor no la envía sin aprobación');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE 'APROBACION_REQUERIDA%', 'El vendedor no la envía sin aprobación');
END $$;
UPDATE public.cotizaciones SET aprobacion_estado = 'pendiente', aprobacion_motivo = 'Cliente frecuente' WHERE id = 'c1500000-0000-0000-0000-000000000004';
DO $$ BEGIN
  UPDATE public.cotizaciones SET aprobacion_estado = 'aprobada' WHERE id = 'c1500000-0000-0000-0000-000000000004';
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El vendedor no se aprueba a sí mismo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El vendedor no se aprueba a sí mismo');
END $$;
RESET ROLE;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Al gerente le llega «Aprobar IV-…»' FROM public.notificaciones WHERE usuario_id = :'CESAR' AND tipo = 'aprobacion_pedida';
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
UPDATE public.cotizaciones SET aprobacion_estado = 'aprobada', aprobacion_nota = 'Ok, cliente frecuente' WHERE id = 'c1500000-0000-0000-0000-000000000004';
RESET ROLE;
INSERT INTO r (ok, txt) SELECT aprobacion_por = :'CESAR' AND aprobacion_at IS NOT NULL, 'Queda quién aprobó y cuándo' FROM public.cotizaciones WHERE id = 'c1500000-0000-0000-0000-000000000004';
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'Al vendedor le llega «aprobada, ya puedes enviarla»' FROM public.notificaciones WHERE usuario_id = :'VENDE' AND tipo = 'aprobacion_respuesta';
SELECT pg_temp.como(:'VENDE');
SET ROLE authenticated;
SELECT public.cot_enviar('c1500000-0000-0000-0000-000000000004', 'enlace', NULL);
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'Enviada', 'Aprobada, el vendedor la envía' FROM public.cotizaciones WHERE id = 'c1500000-0000-0000-0000-000000000004';
UPDATE public.ajustes_cotizacion SET descuento_max = NULL, utilidad_min = NULL WHERE id = 1;
INSERT INTO r (ok, txt) SELECT public.cot_motivo_aprobacion(c) IS NULL, 'Sin umbrales, nunca pide aprobación' FROM public.cotizaciones c WHERE id = 'c1500000-0000-0000-0000-000000000004';

-- 9. Errores de la app y conciliación
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO public.errores_app (mensaje, url) VALUES ('TypeError: x is undefined', '/visita/1');
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'Un usuario registra errores pero no los lee' FROM public.errores_app;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve la cartola' FROM public.movimientos_banco;
RESET ROLE;
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'El administrador ve los errores' FROM public.errores_app;
INSERT INTO public.movimientos_banco (fecha, descripcion, monto, huella) VALUES ('2026-10-25', 'TRANSF CLINICA', 595000, 'h1');
DO $$ BEGIN
  INSERT INTO public.movimientos_banco (fecha, descripcion, monto, huella) VALUES ('2026-10-25', 'TRANSF CLINICA', 595000, 'h1');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La misma línea de la cartola no se importa dos veces');
EXCEPTION WHEN unique_violation THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La misma línea de la cartola no se importa dos veces');
END $$;
RESET ROLE;

-- 9b. Cerrar visita sin informe (con motivo), costo por hora protegido, DTE cerrado
INSERT INTO public.agendamientos (id, titulo, fecha, cliente_id, tecnico_id, notas_visita)
VALUES ('a1500000-0000-0000-0000-000000000002', 'Visita sin informe', '2026-11-20', :'CLI', :'JOAQUIN', 'Tablero antiguo');
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
SELECT public.visita_cerrar('a1500000-0000-0000-0000-000000000002', 'El cliente no estaba; solo se midió');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT estado = 'Realizada' AND notas_visita LIKE 'Tablero antiguo%Cerrada sin informe: El cliente no estaba%',
  'El técnico cierra su visita sin informe y queda el motivo' FROM public.agendamientos WHERE id = 'a1500000-0000-0000-0000-000000000002';
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('44444444-4444-4444-4444-444444444444', 'lector@innvolt.cl', '{"nombre":"Lector"}') ON CONFLICT DO NOTHING;
DELETE FROM public.usuario_roles WHERE usuario_id = '44444444-4444-4444-4444-444444444444';
INSERT INTO public.usuario_roles (usuario_id, rol_id) SELECT '44444444-4444-4444-4444-444444444444', id FROM public.roles WHERE clave = 'solo_lectura';
SELECT pg_temp.como('44444444-4444-4444-4444-444444444444');
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.visita_cerrar('a1500000-0000-0000-0000-000000000001', 'x');
  INSERT INTO r (ok, txt) VALUES (FALSE, 'Quien no es el técnico ni gestiona la agenda no cierra visitas');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (SQLERRM LIKE 'No tienes permiso%', 'Quien no es el técnico ni gestiona la agenda no cierra visitas');
END $$;
RESET ROLE;
INSERT INTO public.costos_hora (usuario_id, costo_hora) VALUES (:'JOAQUIN', 12000) ON CONFLICT (usuario_id) DO UPDATE SET costo_hora = 12000;
SELECT pg_temp.como(:'JOAQUIN');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 0, 'El técnico no ve los costos por hora (ni el suyo)' FROM public.costos_hora;
DO $$ BEGIN
  INSERT INTO public.costos_hora (usuario_id, costo_hora) VALUES ('22222222-2222-2222-2222-222222222222', 1);
  INSERT INTO r (ok, txt) VALUES (FALSE, 'El técnico no se fija su propio costo');
EXCEPTION WHEN OTHERS THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'El técnico no se fija su propio costo');
END $$;
INSERT INTO public.horas_trabajo (cotizacion_id, horas, nota) VALUES ('c1500000-0000-0000-0000-000000000002', 2, 'Cableado');
RESET ROLE;
INSERT INTO r (ok, txt) SELECT costo_hora = 12000, 'Las horas toman el costo propio de la persona ($12.000), no el general'
  FROM public.horas_trabajo WHERE nota = 'Cableado';
SELECT pg_temp.como(:'CESAR');
SET ROLE authenticated;
INSERT INTO r (ok, txt) SELECT count(*) = 1, 'El administrador ve los costos por hora' FROM public.costos_hora;
DO $$ BEGIN
  PERFORM 1 FROM public.dte_config;
  INSERT INTO r (ok, txt) VALUES (FALSE, 'La clave de la factura electrónica no se lee desde la app (ni el administrador)');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r (ok, txt) VALUES (TRUE, 'La clave de la factura electrónica no se lee desde la app (ni el administrador)');
END $$;
RESET ROLE;

-- 10. Plantilla de protocolo y estado nuevo
INSERT INTO r (ok, txt) SELECT count(*) = 1 AND bool_and(tipo = 'entrega') AND bool_and(jsonb_array_length(campos) > 20), 'Plantilla «Protocolo de pruebas eléctricas» de entrega' FROM public.informe_plantillas WHERE codigo = 'PROT-PRU';

SELECT CASE WHEN ok THEN 'OK   ' ELSE 'FALLA' END || ' ' || n || '. ' || txt FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' OK / ' || count(*) FILTER (WHERE NOT ok) || ' fallas' FROM r;
