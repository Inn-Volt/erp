// Anteproyecto (fase 21): el presupuesto de ejecución, el detalle de boletas y facturas, y las tres
// capas del control (cobrado, presupuesto y real). Caso: la forma de IV-0080 (fixture_iv0080.ts). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cuadreDocumento, ejecucionDe, lineasDesdeCotizacion, palabras, realDeLineas, resumenPresupuesto, sugerirLinea, totalLinea, type LineaPresupuesto,
} from '../../lib/anteproyecto.ts';
import {
  control, flujoSemanal, kpis, movimientos, planPorDefecto, presupuesto, repartoDocumento, SIN_PARTIDA,
  type CompraCP, type DocumentoLineaCP, type GastoCP, type ManoObraCP,
} from '../../lib/controlProyecto.ts';
import { COSTO_IV0080, IV0080, PLAN_COBRO_IV0080, TOTAL_IV0080 } from './fixture_iv0080.ts';

const conIds = (ls: LineaPresupuesto[]) => ls.map((l, i) => ({ ...l, id: `L${i}` }));

test('El presupuesto nace copiando la cotización: mismas líneas y el mismo costo por partida', () => {
  const lineas = lineasDesdeCotizacion(IV0080);
  assert.equal(lineas.length, 8);
  const r = resumenPresupuesto(lineas);
  assert.equal(r.total, COSTO_IV0080);
  const p = presupuesto(IV0080);
  for (const x of p.partidas) assert.equal(r.porPartida.get(x.id), x.costo, `partida ${x.numero}`);
  assert.deepEqual(r.porTipo, p.costoPorTipo);
  const cable = lineas.find(l => l.linea_id === 'cable')!;
  assert.deepEqual([cable.partida_id, cable.tipo, cable.cantidad, cable.costo_unitario], ['p2', 'material', 1, 600000]);
});

test('Sin cambios, presupuesto = cotizado; al ajustarlo, el control compara contra el presupuesto', () => {
  const p = presupuesto(IV0080);
  const lineas = lineasDesdeCotizacion(IV0080);
  const igual = control(p, [], ejecucionDe(lineas));
  assert.equal(igual.total.presupuesto, COSTO_IV0080);
  assert.equal(igual.total.cotizado, COSTO_IV0080);
  // Se consigue el cable más barato (500.000) y se agrega canaleta no cotizada (80.000) en la partida 2.
  const ajustado = lineas.map(l => (l.linea_id === 'cable' ? { ...l, costo_unitario: 500000 } : l));
  ajustado.push({ partida_id: 'p2', tipo: 'material', descripcion: 'Canaleta adicional', unidad: 'm', cantidad: 20, costo_unitario: 4000, linea_id: null, trabajador_id: null, orden: 99 });
  const c = control(p, [], ejecucionDe(ajustado));
  const p2 = c.filas.find(f => f.id === 'p2')!;
  assert.equal(p2.cotizado, 1500000);
  assert.equal(p2.presupuesto, 1500000 - 100000 + 80000);
  assert.equal(Math.round(p2.margenPlan! * 10), Math.round(((1799417 - 1480000) / 1799417) * 1000));
  assert.equal(c.total.presupuesto, COSTO_IV0080 - 20000);
  const k = kpis(c, [], [], TOTAL_IV0080);
  assert.equal(k.margenPlan, TOTAL_IV0080 - (COSTO_IV0080 - 20000));
});

test('Una factura con detalle se reparte entre sus líneas: cada una a su partida y a su línea del presupuesto', () => {
  const compra: CompraCP = { id: 'k1', fecha: '2026-11-25', tipo_doc: 'factura', proveedor_nombre: 'Ferretería', neto: 100000, exento: 0, iva: 19000, total: 119000, pagada: false };
  const lineas: DocumentoLineaCP[] = [
    { id: 'd1', compra_id: 'k1', gasto_id: null, partida_id: 'p2', presupuesto_linea_id: 'L1', tipo: 'material', descripcion: 'CABLE THHN 6MM', cantidad: 30, monto: 71400 },
    { id: 'd2', compra_id: 'k1', gasto_id: null, partida_id: 'p4', presupuesto_linea_id: null, tipo: 'material', descripcion: 'Enchufe adicional', cantidad: 2, monto: 47600 },
  ];
  // Las líneas vienen con IVA (suman 119.000): el costo del documento es el neto (100.000) y se reparte 60/40.
  const m = movimientos({ compras: [compra], lineas });
  assert.equal(m.length, 2);
  assert.deepEqual(m.map(x => [x.partidaId, x.monto, x.presupuestoLineaId, x.detallado, x.cantidad]), [['p2', 60000, 'L1', true, 30], ['p4', 40000, null, true, 2]]);
  const c = control(presupuesto(IV0080), m);
  assert.equal(c.filas.find(f => f.id === 'p2')!.real, 60000);
  assert.equal(c.filas.find(f => f.id === 'p4')!.real, 40000);
  assert.equal(c.realPorOrigen.compra, 100000);   // cuadra con cotizacion_resultado
});

test('Un gasto rendido con detalle también se reparte (la boleta trae el total con IVA)', () => {
  const g: GastoCP = { id: 'g1', fecha: '2026-11-26', monto: 11900, categoria: 'materiales', estado: 'rendido' };
  const l: DocumentoLineaCP[] = [
    { id: 'a', compra_id: null, gasto_id: 'g1', partida_id: 'p5', presupuesto_linea_id: null, tipo: 'material', descripcion: 'Tornillos', cantidad: 100, monto: 5950 },
    { id: 'b', compra_id: null, gasto_id: 'g1', partida_id: 'p5', presupuesto_linea_id: null, tipo: 'operacion', descripcion: 'Bolsa', cantidad: 1, monto: 5950 },
  ];
  const m = movimientos({ gastos: [g], lineas: l });
  assert.deepEqual(m.map(x => [x.tipo, x.monto]), [['material', 5950], ['operacion', 5950]]);
});

test('Reparto del documento: suma exacta aunque los montos no calcen, y sin montos se reparte parejo', () => {
  assert.deepEqual(repartoDocumento(100000, [33333, 33333, 33334]), [33333, 33333, 33334]);
  assert.equal(repartoDocumento(100001, [1, 1, 1]).reduce((s, v) => s + v, 0), 100001);
  assert.deepEqual(repartoDocumento(9, [0, 0, 0]), [3, 3, 3]);
  assert.deepEqual(repartoDocumento(-50000, [1, 1]), [-25000, -25000]);
});

test('¿Las líneas cuadran con el documento? (neto de la factura o total con IVA)', () => {
  assert.deepEqual(cuadreDocumento([60000, 40000], 100000, 119000), { suma: 100000, cuadra: true, diferencia: 0 });
  assert.equal(cuadreDocumento([71400, 47600], 100000, 119000).cuadra, true);
  assert.deepEqual(cuadreDocumento([50000], 100000), { suma: 50000, cuadra: false, diferencia: -50000 });
});

test('Lo comprado de cada material y lo gastado en mano de obra por persona', () => {
  const lineas = conIds([
    { partida_id: 'p2', tipo: 'material', descripcion: 'Cable 6 mm²', unidad: 'm', cantidad: 50, costo_unitario: 1200, linea_id: 'l1', trabajador_id: null, orden: 0 },
    { partida_id: 'p2', tipo: 'mano_obra', descripcion: 'Joaquín', unidad: 'día', cantidad: 3, costo_unitario: 47955, linea_id: null, trabajador_id: 'T1', orden: 1 },
  ]);
  const compra: CompraCP = { id: 'k', fecha: '2026-11-25', tipo_doc: 'boleta', proveedor_nombre: 'X', neto: 0, exento: 0, total: 36000, pagada: true };
  const mo: ManoObraCP = { id: 'm', fecha: '2026-11-26', tipo: 'interno', nombre: 'Joaquín', horas: 9, monto_liquido: null, honorarios: false, costo: 47955, pagado: false, fecha_pago: null, partida_id: 'p2', trabajador_id: 'T1' };
  const m = movimientos({
    compras: [compra], manoObra: [mo],
    lineas: [{ id: 'd', compra_id: 'k', gasto_id: null, partida_id: 'p2', presupuesto_linea_id: 'L0', tipo: 'material', descripcion: 'Cable', cantidad: 30, monto: 36000 }],
  });
  const r = realDeLineas(lineas, m);
  assert.deepEqual(r.get('L0'), { cantidad: 30, monto: 36000 });
  assert.deepEqual(r.get('L1'), { cantidad: 9, monto: 47955 });
  assert.equal(totalLinea(lineas[0]), 60000);
});

test('Sugerir a qué material corresponde lo que dice la boleta', () => {
  const cands = [
    { id: 'cable', descripcion: 'Cable 6 mm² libre de halógeno', tipo: 'material' },
    { id: 'tablero', descripcion: 'Tablero 24 módulos embutido', tipo: 'material' },
    { id: 'mo', descripcion: 'Instalación de cable', tipo: 'mano_obra' },
  ];
  assert.equal(sugerirLinea('CABLE THHN 6MM2 X MT', cands), 'cable');
  assert.equal(sugerirLinea('Tablero embutido 24 mod', cands), 'tablero');
  assert.equal(sugerirLinea('Cinta aisladora 3M', cands), null);      // no cotizado
  assert.deepEqual([...palabras('Cable 6 mm²')], ['cable', '6', 'mm2']);
});

test('Flujo: con anteproyecto, el egreso plan sale del presupuesto', () => {
  const p = presupuesto(IV0080);
  const lineas = lineasDesdeCotizacion(IV0080).map(l => (l.linea_id === 'cable' ? { ...l, costo_unitario: 500000 } : l));
  const plan = planPorDefecto({ inicio: '2026-11-23', presupuesto: p, planCobro: PLAN_COBRO_IV0080 });
  const f = flujoSemanal({ plan, presupuesto: p, planCobro: PLAN_COBRO_IV0080, totalCotizacion: TOTAL_IV0080, cobros: [], movimientos: [], ejecucion: ejecucionDe(lineas) });
  assert.equal(f.reduce((s, x) => s + x.egresoPlan, 0), COSTO_IV0080 - 100000);
  assert.equal(ejecucionDe([]), null);
  assert.equal(SIN_PARTIDA, '');
});
