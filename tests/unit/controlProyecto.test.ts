// Control de proyecto (fase 20): presupuesto vs real por partida, por tipo de costo, KPIs, cuadre con
// cotizacion_resultado y flujo de caja semanal. Caso: la forma de IV-0080 (fixture_iv0080.ts). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajustarSemanas, control, costoCompra, cuadre, distribucionInvalida, estadoControl, flujoSemanal, hojasControl, inicioPorDefecto,
  kpis, montosHitos, movimientos, nombreArchivoControl, normalizarPlan, opcionesDePartida, partidaValida, planPorDefecto, presupuesto, presupuestoPorPartida,
  repartirEntero, repartoParejo, semanaDe, SIN_PARTIDA, UMBRAL_ALERTA, type CompraCP, type GastoCP, type HoraCP, type ManoObraCP,
} from '../../lib/controlProyecto.ts';
import { calcular } from '../../lib/cotizador/calculo.ts';
import type { Linea, PartidaCot } from '../../lib/cotizador/tipos.ts';
import { COSTO_IV0080, IV0080, PLAN_COBRO_IV0080, TOTAL_IV0080, VENTA_POR_PARTIDA } from './fixture_iv0080.ts';

// Los movimientos del caso de prueba: una factura en la partida 4, bencina sin partida y 8 h internas en la 2.
const compra = (extra: Partial<CompraCP> = {}): CompraCP => ({
  id: 'k1', fecha: '2026-11-25', tipo_doc: 'factura', folio: '555', proveedor_nombre: 'Distribuidora', neto: 100000, exento: 0, iva: 19000,
  total: 119000, pagada: true, fecha_pago: '2026-12-02', partida_id: 'p4', tipo_costo: null, ...extra,
});
const gasto = (extra: Partial<GastoCP> = {}): GastoCP => ({
  id: 'g1', fecha: '2026-11-24', monto: 20000, categoria: 'combustible', descripcion: 'Bencina', estado: 'rendido', partida_id: null, usuario_id: 'u1', ...extra,
});
const mo = (extra: Partial<ManoObraCP> = {}): ManoObraCP => ({
  id: 'm1', fecha: '2026-11-26', tipo: 'interno', nombre: 'Joaquín', horas: 8, monto_liquido: null, honorarios: false, costo: 80000,
  pagado: false, fecha_pago: null, partida_id: 'p2', ...extra,
});
const movsCaso = () => movimientos({ gastos: [gasto()], compras: [compra()], manoObra: [mo()] });

test('IV-0080: la venta neta de cada partida (con sus descuentos) suma $3.903.591', () => {
  const p = presupuesto(IV0080);
  assert.deepEqual(Object.fromEntries(p.partidas.map(x => [x.id, x.venta])), VENTA_POR_PARTIDA);
  assert.equal(p.venta, TOTAL_IV0080);
  assert.equal(p.costo, COSTO_IV0080);
  // Lo mismo que guarda el editor (subtotal y costo_directo).
  const r = calcular(IV0080.items, IV0080.partidas, 'CLP');
  assert.equal(r.totales.neto, p.venta);
  assert.equal(r.internos.costoConImprevistos, p.costo);
  assert.equal(r.totales.descuento, 189375);
  assert.equal(p.sinPartida.venta + p.sinPartida.costo, 0);
  assert.deepEqual(p.costoPorTipo, { material: 1300000, mano_obra: 1200000, servicio: 650000, operacion: 0 });
});

test('Una factura de neto $100.000 en la partida 4 suma $100.000 a su real (el IVA se recupera)', () => {
  const c = control(presupuesto(IV0080), movsCaso());
  const p4 = c.filas.find(f => f.id === 'p4')!;
  assert.equal(p4.real, 100000);
  assert.equal(p4.desviacion, 100000 - 750000);
  assert.equal(c.porTipo.find(t => t.tipo === 'material')!.real, 100000);   // sin tipo = material
});

test('Bencina de $20.000 sin partida aparece en «Sin partida» como operación', () => {
  const c = control(presupuesto(IV0080), movsCaso());
  const sin = c.filas.find(f => f.id === SIN_PARTIDA)!;
  assert.equal(sin.nombre, 'Sin partida');
  assert.equal(sin.cotizado, 0);
  assert.equal(sin.real, 20000);
  assert.equal(sin.estado, 'sin_presupuesto');
  assert.equal(c.porTipo.find(t => t.tipo === 'operacion')!.real, 20000);
});

test('8 horas internas ($10.000 la hora) en la partida 2 suman $80.000 de mano de obra', () => {
  const c = control(presupuesto(IV0080), movsCaso());
  assert.equal(c.filas.find(f => f.id === 'p2')!.real, 80000);
  assert.equal(c.porTipo.find(t => t.tipo === 'mano_obra')!.real, 80000);
});

test('El real total es $200.000 y cuadra al peso con cotizacion_resultado (= costoReal)', () => {
  const c = control(presupuesto(IV0080), movsCaso());
  assert.equal(c.total.real, 200000);
  const base = { venta_neta: TOTAL_IV0080, costo_cotizado: COSTO_IV0080, gastos: 20000, compras: 100000, mano_obra: 80000, costo_horas: 0 };
  assert.equal(base.gastos + base.compras + base.mano_obra + base.costo_horas, c.total.real);   // costoReal()
  assert.deepEqual(cuadre(c, base), []);
  // Si la base dice otra cosa, se muestra la diferencia.
  assert.deepEqual(cuadre(c, { ...base, compras: 90000 }).map(d => [d.campo, d.diferencia]), [['compras', 10000]]);
});

test('Estado de cada partida: OK, ALERTA desde el 90 %, SOBRE PRESUPUESTO y SIN PRESUPUESTO', () => {
  assert.equal(UMBRAL_ALERTA, 0.9);
  assert.equal(estadoControl(100000, 50000), 'ok');
  assert.equal(estadoControl(100000, 89999), 'ok');
  assert.equal(estadoControl(100000, 90000), 'alerta');
  assert.equal(estadoControl(100000, 100000), 'alerta');
  assert.equal(estadoControl(100000, 100001), 'sobre');
  assert.equal(estadoControl(0, 1), 'sin_presupuesto');
  assert.equal(estadoControl(0, 0), 'ok');
});

test('Costo de una compra como costo_compra(): factura neto + exento, boleta el total, la nota de crédito resta', () => {
  assert.equal(costoCompra({ tipo_doc: 'factura', neto: 100, exento: 5, total: 124 }), 105);
  assert.equal(costoCompra({ tipo_doc: 'factura_exenta', neto: 0, exento: 80, total: 80 }), 80);
  assert.equal(costoCompra({ tipo_doc: 'boleta', neto: 0, exento: 0, total: 23800 }), 23800);
  assert.equal(costoCompra({ tipo_doc: 'otro', neto: 0, exento: 0, total: 500 }), 500);
  assert.equal(costoCompra({ tipo_doc: 'nota_credito', neto: 50, exento: 0, total: 59.5 }), -50);
});

test('Un gasto rechazado no cuenta; uno de materiales es material; una partida que ya no está cae en «Sin partida»', () => {
  const m = movimientos({
    gastos: [gasto({ id: 'r', estado: 'rechazado', monto: 999 }), gasto({ id: 'm', categoria: 'materiales', monto: 5000, partida_id: 'p1' })],
    manoObra: [mo({ id: 'x', partida_id: 'borrada', costo: 10000 })],
  });
  assert.deepEqual(m.map(x => x.id).sort(), ['m', 'x']);
  assert.equal(m.find(x => x.id === 'm')!.tipo, 'material');
  const c = control(presupuesto(IV0080), m);
  assert.equal(c.filas.find(f => f.id === SIN_PARTIDA)!.real, 10000);
  assert.equal(c.filas.find(f => f.id === 'p1')!.real, 5000);
});

test('Externos: cuentan al costo al registrarse, pero salen de la caja (y del flujo real) cuando se pagan', () => {
  const p = presupuesto(IV0080);
  const ext = (extra: Partial<ManoObraCP>) => mo({ id: 'e', tipo: 'externo', nombre: 'Pedro', horas: null, monto_liquido: 50000, honorarios: true, costo: 58997, ...extra });
  const debe = movimientos({ manoObra: [ext({})] });
  assert.equal(control(p, debe).total.real, 58997);
  assert.equal(kpis(control(p, debe), debe, [], TOTAL_IV0080).caja, 0);
  assert.equal(debe[0].documento, 'Boleta de honorarios');
  const pagado = movimientos({ manoObra: [ext({ pagado: true, fecha_pago: '2026-12-10', documento: '77' })] });
  assert.equal(kpis(control(p, pagado), pagado, [], TOTAL_IV0080).caja, -58997);
  assert.equal(pagado[0].fechaCaja, '2026-12-10');
  assert.equal(pagado[0].documento, 'Boleta de honorarios 77');
});

test('Las horas de antes (horas_trabajo) siguen contando, en «Sin partida»', () => {
  const h: HoraCP = { id: 'h', fecha: '2026-11-26', horas: 2, costo_hora: 9000, usuario_id: 'u1' };
  const c = control(presupuesto(IV0080), movimientos({ horas: [h] }));
  assert.equal(c.filas.find(f => f.id === SIN_PARTIDA)!.real, 18000);
  assert.equal(c.realPorOrigen.hora, 18000);
});

test('Margen y costo proyectado: el proyectado es el mayor entre lo cotizado y lo real', () => {
  const c = control(presupuesto(IV0080), [...movsCaso(), ...movimientos({ compras: [compra({ id: 'k2', folio: '556', neto: 200000, partida_id: 'p1' })] })]);
  const p1 = c.filas.find(f => f.id === 'p1')!;
  assert.equal(p1.cotizado, 150000);
  assert.equal(p1.real, 200000);
  assert.equal(p1.proyectado, 200000);
  assert.equal(p1.estado, 'sobre');
  assert.equal(Math.round(p1.ejecutado!), 133);
  assert.equal(c.total.proyectado, c.filas.reduce((s, f) => s + f.proyectado, 0));
  assert.equal(Math.round(p1.margenCotizado! * 10) / 10, Math.round(((190589 - 150000) / 190589) * 1000) / 10);
});

test('KPIs: cobrado, por cobrar y caja del trabajo (las compras por pagar no salen todavía)', () => {
  const cobros = [{ monto: 1951796, monto_pagado: 1951796, fecha_pago: '2026-11-23', hito: 'Anticipo' }];
  const p = presupuesto(IV0080);
  const m = movsCaso();
  const k = kpis(control(p, m), m, cobros, TOTAL_IV0080);
  assert.equal(k.cobrado, 1951796);
  assert.equal(k.porCobrar, 1951795);
  assert.equal(k.caja, 1951796 - 200000);
  assert.equal(Math.round(k.pctGastado! * 100) / 100, Math.round((200000 / COSTO_IV0080) * 10000) / 100);
  const sinPagar = movimientos({ gastos: [gasto()], compras: [compra({ pagada: false, fecha_pago: null })], manoObra: [mo()] });
  assert.equal(kpis(control(p, sinPagar), sinPagar, cobros, TOTAL_IV0080).caja, 1951796 - 100000);
});

test('En UF cada partida pasa a pesos y la suma da lo mismo que cotizacion_resultado', () => {
  const l = (id: string, p: string, precio: number, costo: number) => ({
    id, partidaId: p, descripcion: id, categoria: 'material', unidad: 'un', cantidad: 3, costo, imprevistos: 0, margen: 0, precio, iva: 19, itemId: `c-${id}`,
  }) as Linea;
  const partidas = [{ id: 'a', nombre: 'A', cantidad: 1, unidad: 'gl', descuento: 7 }, { id: 'b', nombre: 'B', cantidad: 1, unidad: 'gl' },
    { id: 'c', nombre: 'C', cantidad: 1, unidad: 'gl' }] as PartidaCot[];
  const items = [l('1', 'a', 1.2345, 0.8765), l('2', 'b', 2.3333, 1.7777), l('3', 'c', 0.3337, 0.1111), l('4', 'suelta', 1.1111, 0.5)];
  const uf = 39123.45;
  const p = presupuesto({ items, partidas, moneda: 'UF', valor_uf: uf });
  const r = calcular(items, partidas, 'UF', uf);
  assert.equal(p.venta, Math.round(r.totales.neto * uf));                     // venta_neta de la vista
  assert.equal(p.costo, Math.round(r.internos.costoConImprevistos * uf));     // costo_cotizado de la vista
  assert.ok(p.sinPartida.venta > 0, 'la línea suelta va a «Sin partida»');
  for (const x of [...p.partidas, p.sinPartida]) assert.equal(x.costoPorTipo.material, x.costo);
});

test('Reparto entero por resto mayor: suma exacta', () => {
  assert.deepEqual(repartirEntero(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(repartirEntero(0, [0, 0]), [0, 0]);
  assert.equal(repartirEntero(1000001, [0.3, 0.3, 0.4]).reduce((s, v) => s + v, 0), 1000001);
});

test('Partidas para elegir: numeradas como en la cotización; una que no está no se guarda', () => {
  const op = opcionesDePartida(IV0080.partidas);
  assert.deepEqual(op.map(p => p.numero), [1, 2, 3, 4, 5]);
  assert.equal(op[3].nombre, 'Tablero e instalación de negocio');
  assert.ok(partidaValida('', op));
  assert.ok(partidaValida('p4', op));
  assert.ok(!partidaValida('otra', op));
});

// ── Flujo de caja ──
const inicio = '2026-11-23';

test('Flujo: con inicio el 23-11-2026 y el plan por omisión, el anticipo cae en la semana 1 y el saldo en la 4', () => {
  const p = presupuesto(IV0080);
  const plan = planPorDefecto({ inicio, presupuesto: p, planCobro: PLAN_COBRO_IV0080 });
  assert.equal(plan.semanas, 4);
  assert.deepEqual(plan.hitos, { Anticipo: 1, Saldo: 4 });
  const f = flujoSemanal({ plan, presupuesto: p, planCobro: PLAN_COBRO_IV0080, totalCotizacion: TOTAL_IV0080, cobros: [], movimientos: [] });
  assert.equal(f.length, 5);   // 4 semanas + «Posterior»
  assert.equal(f[0].ingresoPlan, 1951796);
  assert.equal(f[3].ingresoPlan, 1951795);
  assert.equal(f.reduce((s, x) => s + x.ingresoPlan, 0), TOTAL_IV0080);
  assert.equal(f.reduce((s, x) => s + x.egresoPlan, 0), COSTO_IV0080);
  assert.equal(f[4].acumPlan, TOTAL_IV0080 - COSTO_IV0080);
  assert.deepEqual([f[0].desde, f[0].hasta, f[3].desde, f[3].hasta], ['2026-11-23', '2026-11-29', '2026-12-14', '2026-12-20']);
});

test('Flujo real: cobros por fecha de pago; compras pagadas por su fecha de pago; antes del inicio es la semana 1; después, «Posterior»', () => {
  const p = presupuesto(IV0080);
  const plan = planPorDefecto({ inicio, presupuesto: p, planCobro: PLAN_COBRO_IV0080 });
  const movs = movimientos({
    gastos: [gasto(), gasto({ id: 'antes', fecha: '2026-11-10', monto: 1000 }), gasto({ id: 'despues', fecha: '2026-12-25', monto: 3000 })],
    compras: [compra(), compra({ id: 'k2', folio: '9', fecha: '2026-12-15', pagada: false, fecha_pago: null, neto: 50000 })],
    manoObra: [mo()],
  });
  const cobros = [{ monto: 1951796, monto_pagado: 1951796, fecha_pago: '2026-11-24' }, { monto: 1951795, monto_pagado: 500000, fecha_pago: null, fecha_factura: '2026-12-16' }];
  const f = flujoSemanal({ plan, presupuesto: p, planCobro: PLAN_COBRO_IV0080, totalCotizacion: TOTAL_IV0080, cobros, movimientos: movs });
  assert.equal(f[0].egresoReal, 20000 + 1000 + 80000);   // bencina, lo de antes y las horas
  assert.equal(f[1].egresoReal, 100000);                 // la factura pagada el 02-12
  assert.equal(f[3].egresoReal, 50000);                  // la impaga, por su fecha
  assert.equal(f[4].egresoReal, 3000);                   // después de la semana 4
  assert.equal(f[0].ingresoReal, 1951796);
  assert.equal(f[3].ingresoReal, 500000);                // sin fecha de pago: la de la factura
  assert.equal(f[4].acumReal, 1951796 + 500000 - 254000);
  assert.equal(f[1].desvEgreso, f[1].egresoReal - f[1].egresoPlan);
});

test('Plan por omisión: una partida solo de materiales va 100 % en la semana 1; el resto parejo', () => {
  const items = [...IV0080.items, { ...IV0080.items[1], id: 'solo', partidaId: 'p6' }] as Linea[];
  const partidas = [...IV0080.partidas, { id: 'p6', nombre: 'Equipos', cantidad: 1, unidad: 'gl' }] as PartidaCot[];
  const plan = planPorDefecto({ inicio, presupuesto: presupuesto({ items, partidas, moneda: 'CLP' }), planCobro: PLAN_COBRO_IV0080 });
  assert.deepEqual(plan.distribucion.p6, [100, 0, 0, 0]);
  assert.deepEqual(plan.distribucion.p2, [25, 25, 25, 25]);
});

test('Reparto parejo con dos decimales que suma 100; cambiar semanas no pierde %', () => {
  assert.deepEqual(repartoParejo(3), [33.33, 33.33, 33.34]);
  assert.deepEqual(repartoParejo(4), [25, 25, 25, 25]);
  const plan = planPorDefecto({ inicio, presupuesto: presupuesto(IV0080), planCobro: PLAN_COBRO_IV0080 });
  const dos = ajustarSemanas(plan, 2);
  assert.deepEqual(dos.distribucion.p1, [25, 75]);
  assert.deepEqual(dos.hitos, { Anticipo: 1, Saldo: 2 });
  const seis = ajustarSemanas(plan, 6);
  assert.deepEqual(seis.distribucion.p1, [25, 25, 25, 25, 0, 0]);
});

test('Una partida que no suma 100 % se marca; el plan guardado se completa con el de por omisión', () => {
  const p = presupuesto(IV0080);
  const base = planPorDefecto({ inicio, presupuesto: p, planCobro: PLAN_COBRO_IV0080 });
  const malo = { ...base, distribucion: { ...base.distribucion, p3: [50, 40, 0, 0] } };
  const costos = presupuestoPorPartida(p);
  assert.deepEqual(distribucionInvalida(malo, costos), [{ id: 'p3', suma: 90 }]);
  assert.deepEqual(distribucionInvalida(base, costos), []);
  // Una partida sin % guardados se reparte pareja: no se marca.
  assert.deepEqual(distribucionInvalida({ ...base, distribucion: {} }, costos), []);
  const n = normalizarPlan({ inicio: '2026-12-01', semanas: 3, distribucion: { p1: [10, 20, 70] }, hitos: { Saldo: 9 } }, base);
  assert.equal(n.inicio, '2026-12-01');
  assert.equal(n.semanas, 3);
  assert.deepEqual(n.distribucion.p1, [10, 20, 70]);
  assert.deepEqual(n.distribucion.p2, [25, 25, 50]);        // no estaba: la de por omisión, ajustada a 3 semanas
  assert.deepEqual(n.hitos, { Anticipo: 1, Saldo: 3 });     // semana 9 no existe: la última
  assert.equal(normalizarPlan(null, base).semanas, 4);
});

test('Cobros del plan con el redondeo por acumulado de la base: la suma da exacta', () => {
  const tres = montosHitos(1000001, [
    { nombre: 'A', porcentaje: 33.33, cuando: 'aprobar' }, { nombre: 'B', porcentaje: 33.33, cuando: 'terminar' }, { nombre: 'C', porcentaje: 33.34, cuando: 'terminar' },
  ]);
  assert.equal(tres.reduce((s, h) => s + h.monto, 0), 1000001);
  assert.deepEqual(montosHitos(TOTAL_IV0080, PLAN_COBRO_IV0080).map(h => h.monto), [1951796, 1951795]);
});

test('Semanas: antes del inicio es la 1; después de la última, «Posterior» (0)', () => {
  assert.equal(semanaDe('2026-11-01', inicio, 4), 1);
  assert.equal(semanaDe('2026-11-29', inicio, 4), 1);
  assert.equal(semanaDe('2026-11-30', inicio, 4), 2);
  assert.equal(semanaDe('2026-12-20', inicio, 4), 4);
  assert.equal(semanaDe('2026-12-21', inicio, 4), 0);
});

test('Inicio por omisión: el del trabajo, si no el día (en Chile) en que se aprobó, si no hoy', () => {
  assert.equal(inicioPorDefecto('2026-11-23', '2026-11-01T12:00:00Z', '2026-12-01'), '2026-11-23');
  assert.equal(inicioPorDefecto(null, '2026-11-23T02:00:00Z', '2026-12-01'), '2026-11-22');
  assert.equal(inicioPorDefecto(null, null, '2026-12-01'), '2026-12-01');
});

test('Excel: hojas Control, PorTipo, Flujo y Movimientos; nombre IV-0080_control_<fecha>.xlsx', () => {
  const p = presupuesto(IV0080);
  const m = movsCaso();
  const c = control(p, m);
  const plan = planPorDefecto({ inicio, presupuesto: p, planCobro: PLAN_COBRO_IV0080 });
  const hojas = hojasControl({
    control: c, kpis: kpis(c, m, [], TOTAL_IV0080), presupuesto: p, movimientos: m, nombres: { u1: 'Joaquín' }, categorias: { combustible: 'Combustible' },
    flujo: flujoSemanal({ plan, presupuesto: p, planCobro: PLAN_COBRO_IV0080, totalCotizacion: TOTAL_IV0080, cobros: [], movimientos: m }),
  });
  assert.deepEqual(hojas.map(h => h.nombre), ['Control', 'PorTipo', 'Flujo', 'Movimientos']);
  const mov = hojas[3].filas;
  assert.equal(mov.length, 3);
  assert.deepEqual(mov.find(f => f.Origen === 'Gasto'), {
    Fecha: '2026-11-24', Origen: 'Gasto', Documento: 'Combustible', 'Proveedor o persona': 'Joaquín', Detalle: 'Bencina', Cantidad: '', Partida: 'Sin partida',
    'Tipo de costo': 'Operación', 'En el presupuesto': '', 'Monto considerado': 20000, Pagada: '', 'Fecha de caja': '2026-11-24',
  });
  assert.equal(mov.find(f => f.Origen === 'Compra')!.Partida, '4. Tablero e instalación de negocio');
  assert.equal(nombreArchivoControl(80, '2026-11-23'), 'IV-0080_control_2026-11-23.xlsx');
});
