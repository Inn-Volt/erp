// Análisis de proyecto (fase 22): para gastar, gastado, queda y margen proyectado; materiales
// (cotizado, comprado, pendiente, de más, adicional); mano de obra por día; servicios por hora;
// operación; el resumen partida × tipo y «Para mirar». Caso: la forma de IV-0080. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar, costoRegistro, diasDeLinea, hojasAnalisis, semaforo, valorDeLinea, type LineaEntrada } from '../../lib/analisisProyecto.ts';
import { lineasDesdeCotizacion } from '../../lib/anteproyecto.ts';
import {
  movimientos, presupuesto, SIN_PARTIDA, type CompraCP, type DocumentoLineaCP, type GastoCP, type HoraCP, type ManoObraCP,
} from '../../lib/controlProyecto.ts';
import { COSTO_IV0080, IV0080, TOTAL_IV0080 } from './fixture_iv0080.ts';

const P = presupuesto(IV0080);
/** Las líneas copiadas de la cotización, con id (como si estuvieran guardadas). */
const copia = (): LineaEntrada[] => lineasDesdeCotizacion(IV0080).map(l => ({ ...l, id: `L-${l.linea_id}`, clave: `L-${l.linea_id}` }));
const linea = (extra: Partial<LineaEntrada> & Pick<LineaEntrada, 'tipo'>): LineaEntrada => ({
  id: `L-${extra.descripcion}`, clave: `L-${extra.descripcion}`, partida_id: 'p2', descripcion: 'x', unidad: 'un', cantidad: 1, costo_unitario: 0,
  linea_id: null, trabajador_id: null, orden: 50, ...extra,
});
const compra = (extra: Partial<CompraCP> = {}): CompraCP => ({
  id: 'k1', fecha: '2026-11-25', tipo_doc: 'factura', proveedor_nombre: 'Ferretería', neto: 100000, exento: 0, iva: 19000, total: 119000, pagada: false, ...extra,
});
const dl = (extra: Partial<DocumentoLineaCP>): DocumentoLineaCP => ({
  id: 'd', compra_id: 'k1', gasto_id: null, partida_id: 'p2', presupuesto_linea_id: null, tipo: 'material', descripcion: 'x', cantidad: null, monto: 0, ...extra,
});
const mo = (extra: Partial<ManoObraCP>): ManoObraCP => ({
  id: 'm', fecha: '2026-11-26', tipo: 'interno', nombre: 'Joaquín', horas: null, jornadas: null, monto_liquido: null, honorarios: false, costo: 0,
  pagado: false, fecha_pago: null, partida_id: 'p2', trabajador_id: 'T1', clase: 'mano_obra', presupuesto_linea_id: null, ...extra,
});
const gasto = (extra: Partial<GastoCP>): GastoCP => ({ id: 'g', fecha: '2026-11-27', monto: 0, categoria: 'combustible', estado: 'rendido', partida_id: 'p2', ...extra });

test('Sin nada gastado: para gastar = lo cotizado, queda todo y el margen proyectado es el del presupuesto', () => {
  const a = analizar({ presupuesto: P, lineas: copia(), movimientos: [] });
  assert.equal(a.paraGastar, COSTO_IV0080);
  assert.equal(a.gastado, 0);
  assert.equal(a.queda, COSTO_IV0080);
  assert.equal(a.venta, TOTAL_IV0080);
  assert.equal(a.margenProyectado, TOTAL_IV0080 - COSTO_IV0080);
  assert.deepEqual(a.paraMirar.map(x => x.clave), ['pendientes']);   // los 3 materiales están por comprar
});

test('Comprar 5 de 10 deja 5 pendientes; comprar de más se marca «de más»', () => {
  const lineas = [...copia(), linea({ tipo: 'material', descripcion: 'Cable 6 mm²', unidad: 'm', cantidad: 10, costo_unitario: 1000 })];
  const cinco = movimientos({ compras: [compra({ neto: 5000, iva: 950, total: 5950 })], lineas: [dl({ presupuesto_linea_id: 'L-Cable 6 mm²', cantidad: 5, monto: 5950 })] });
  const a = analizar({ presupuesto: P, lineas, movimientos: cinco });
  const cable = a.lineas.find(x => x.linea.descripcion === 'Cable 6 mm²')!;
  assert.deepEqual([cable.hecho, cable.pendiente, cable.demas, cable.gastado, cable.queda], [5, 5, 0, 5000, 5000]);
  assert.equal(cable.cotizado, null);   // agregada en el presupuesto: no cotizada

  const doce = movimientos({
    compras: [compra({ neto: 12000, iva: 2280, total: 14280 })],
    lineas: [dl({ presupuesto_linea_id: 'L-Cable 6 mm²', cantidad: 12, monto: 14280 })],
  });
  const b = analizar({ presupuesto: P, lineas, movimientos: doce });
  const c2 = b.lineas.find(x => x.linea.descripcion === 'Cable 6 mm²')!;
  assert.deepEqual([c2.pendiente, c2.demas, c2.estado], [0, 2, 'sobre']);
  assert.ok(b.paraMirar.some(x => x.clave === `d:${c2.linea.clave}` && /de más/.test(x.texto)));
});

test('Materiales cotizados: lo cotizado sale de la cotización; lo no cotizado es adicional y una compra sin detalle va aparte', () => {
  const cotizado = Object.fromEntries(IV0080.items.map(i => [i.id, i.cantidad]));
  const movs = movimientos({
    compras: [compra(), compra({ id: 'k2', tipo_doc: 'boleta', neto: 0, iva: 0, total: 30000, proveedor_nombre: 'Sodimac', folio: '77', partida_id: 'p4' })],
    lineas: [
      dl({ id: 'a', presupuesto_linea_id: 'L-cable', cantidad: 1, monto: 60000 }),
      dl({ id: 'b', descripcion: 'Cinta aisladora 3M', cantidad: 4, monto: 40000 }),
    ],
  });
  const a = analizar({ presupuesto: P, lineas: copia(), movimientos: movs, cotizado });
  const cable = a.lineas.find(x => x.linea.linea_id === 'cable')!;
  assert.deepEqual([cable.cotizado, cable.hecho, cable.pendiente, cable.gastado], [1, 1, 0, 60000]);
  const cinta = a.sinLinea.find(s => s.etiqueta === 'Cinta aisladora 3M')!;
  assert.deepEqual([cinta.partidaId, cinta.sinDetalle, cinta.gastado, cinta.hecho], ['p2', false, 40000, 4]);
  const sodimac = a.sinLinea.find(s => s.sinDetalle)!;
  assert.deepEqual([sodimac.partidaId, sodimac.etiqueta, sodimac.gastado], ['p4', 'Boleta 77 · Sodimac', 30000]);
  assert.ok(a.paraMirar.some(x => x.clave === 'adicional' && /\$40\.000/.test(x.texto)));
  assert.equal(a.gastado, 130000);
});

test('Mano de obra por día: jornadas hechas y las que faltan; las horas valen su parte del día; lo de antes va a la línea de esa persona una sola vez', () => {
  const lmo = linea({ tipo: 'mano_obra', descripcion: 'Maestro y ayudante', unidad: 'día', cantidad: 6, personas: 2, costo_unitario: 47955, trabajador_id: 'T1', modalidad: 'interno' });
  assert.equal(diasDeLinea(lmo), 3);
  const movs = movimientos({
    manoObra: [
      mo({ id: 'm1', jornadas: 2, costo: 95910, presupuesto_linea_id: lmo.id }),
      mo({ id: 'm2', horas: 4.5, costo: 23978 }),                                // de antes: sin línea, misma persona y partida
      mo({ id: 'm3', horas: 9, costo: 47955, partida_id: 'p4' }),               // otra partida: no es de esa línea
      mo({ id: 'm4', tipo: 'liquido', nombre: 'Socio', trabajador_id: null, jornadas: 1, monto_liquido: 60000, costo: 60000 }),
    ],
  });
  const a = analizar({ presupuesto: P, lineas: [lmo], movimientos: movs, horasDia: { T1: 9 } });
  const l = a.lineas[0];
  assert.deepEqual([l.hecho, l.pendiente, l.gastado, l.presupuesto], [2.5, 3.5, 95910 + 23978, 287730]);
  assert.deepEqual(a.sinLinea.map(s => [s.partidaId, s.etiqueta, s.hecho, s.gastado]), [['p4', 'Joaquín', 1, 47955], ['p2', 'Socio', 1, 60000]]);
  // Nada se cuenta dos veces: lo gastado en las líneas más lo sin línea es lo real.
  assert.equal(a.lineas.reduce((s, x) => s + x.gastado, 0) + a.sinLinea.reduce((s, x) => s + x.gastado, 0), a.gastado);
});

test('Servicios por hora: horas hechas y faltan; cuenta como «servicio» en el resumen', () => {
  const lsv = linea({ tipo: 'servicio', descripcion: 'Ingeniería y planos', unidad: 'h', cantidad: 10, costo_unitario: 23599, partida_id: 'p1', trabajador_id: 'T2', modalidad: 'externo' });
  const movs = movimientos({
    manoObra: [mo({ id: 's1', tipo: 'externo', clase: 'servicio', horas: 4, monto_liquido: 80000, honorarios: true, costo: 94395, partida_id: 'p1', trabajador_id: 'T2', presupuesto_linea_id: lsv.id })],
  });
  assert.equal(movs[0].tipo, 'servicio');
  const a = analizar({ presupuesto: P, lineas: [lsv], movimientos: movs });
  assert.deepEqual([a.lineas[0].hecho, a.lineas[0].pendiente, a.lineas[0].gastado], [4, 6, 94395]);
  const p1 = a.partidas.find(f => f.id === 'p1')!;
  assert.deepEqual([p1.celdas.servicio.presupuesto, p1.celdas.servicio.gastado, p1.celdas.mano_obra.gastado], [235990, 94395, 0]);
});

test('Operación: un gasto sin línea va a la línea de operación de su partida; sin ella queda «sin línea»; desglose por categoría', () => {
  const lop = linea({ tipo: 'operacion', descripcion: 'Combustible y almuerzos', cantidad: 1, costo_unitario: 50000 });
  const movs = movimientos({
    gastos: [
      gasto({ id: 'g1', monto: 20000, categoria: 'combustible' }),
      gasto({ id: 'g2', monto: 10000, categoria: 'alimentacion' }),
      gasto({ id: 'g3', monto: 3000, categoria: 'peajes', partida_id: 'p5' }),
    ],
  });
  const a = analizar({ presupuesto: P, lineas: [lop], movimientos: movs, categorias: { combustible: 'Combustible', alimentacion: 'Alimentación', peajes: 'Peajes' } });
  assert.deepEqual([a.lineas[0].gastado, a.lineas[0].queda], [30000, 20000]);
  assert.deepEqual(a.sinLinea.map(s => [s.partidaId, s.etiqueta, s.gastado, s.sinDetalle]), [['p5', 'Peajes', 3000, true]]);
  assert.deepEqual(a.operacionPorCategoria.map(c => [c.nombre, c.monto]), [['Combustible', 20000], ['Alimentación', 10000], ['Peajes', 3000]]);
});

test('Resumen: partidas × tipos, totales, «Sin partida» solo si hay algo, y margen proyectado con lo mayor de cada partida', () => {
  const movs = movimientos({ compras: [compra({ neto: 900000, iva: 171000, total: 1071000, partida_id: 'p4' })], horas: [{ id: 'h', fecha: '2026-11-26', horas: 2, costo_hora: 9000, usuario_id: 'u1' } as HoraCP] });
  const a = analizar({ presupuesto: P, lineas: copia(), movimientos: movs, nombres: { u1: 'Ana' } });
  const p4 = a.partidas.find(f => f.id === 'p4')!;
  assert.deepEqual([p4.celdas.material.presupuesto, p4.celdas.material.gastado, p4.celdas.material.estado], [500000, 900000, 'sobre']);
  assert.deepEqual([p4.total.presupuesto, p4.total.gastado], [750000, 900000]);
  const sin = a.partidas.find(f => f.id === SIN_PARTIDA)!;
  assert.deepEqual([sin.total.presupuesto, sin.total.gastado], [0, 18000]);
  assert.equal(a.total.gastado, 918000);
  assert.equal(a.porTipo.material.gastado, 900000);
  // p4 cuesta lo gastado (900.000 > 750.000); «Sin partida», 18.000; las demás, lo presupuestado.
  assert.equal(a.margenProyectado, TOTAL_IV0080 - (COSTO_IV0080 - 750000 + 900000 + 18000));
  assert.ok(a.paraMirar.some(x => x.clave === 'p:p4' && /se pasó en \$150\.000/.test(x.texto)));
  assert.ok(a.paraMirar.some(x => x.clave === `p:${SIN_PARTIDA}` && /sin presupuesto/.test(x.texto)));
  assert.equal(a.sinLinea.find(s => s.partidaId === SIN_PARTIDA)!.etiqueta, 'Ana');
  const hojas = hojasAnalisis(a, id => id || 'Sin partida');
  assert.deepEqual(hojas.map(h => h.nombre), ['Análisis', 'Presupuesto']);
  assert.equal(hojas[0].filas.at(-1)!['Total gastado'], 918000);
});

test('Semáforo: verde, amarillo desde el 90 %, rojo si se pasa (o si se gasta sin presupuesto)', () => {
  assert.deepEqual([semaforo(100, 89), semaforo(100, 90), semaforo(100, 100), semaforo(100, 101), semaforo(0, 1), semaforo(0, 0)],
    ['ok', 'alerta', 'alerta', 'sobre', 'sobre', 'ok']);
});

test('El valor de una línea y el costo de un registro: lo mismo que calcula la base', () => {
  const ficha = { costo_dia: 47955, horas_dia: 9 };
  assert.equal(valorDeLinea({ tipo: 'mano_obra', modalidad: 'interno' }, ficha, 15.25), 47955);
  assert.equal(valorDeLinea({ tipo: 'servicio', modalidad: 'interno' }, ficha, 15.25), 5328);
  assert.equal(valorDeLinea({ tipo: 'servicio', modalidad: 'externo', valor_liquido: 20000, honorarios: true }, null, 15.25), 23599);
  assert.equal(valorDeLinea({ tipo: 'mano_obra', modalidad: 'liquido', valor_liquido: 50000 }, null, 15.25), 50000);
  assert.equal(valorDeLinea({ tipo: 'mano_obra', modalidad: 'interno' }, { costo_dia: null, horas_dia: 9 }, 15.25), null);
  // Los mismos casos de tests/sql/pruebas_fase22.sql.
  assert.equal(costoRegistro({ modalidad: 'interno', clase: 'mano_obra', cantidad: 2, valor: 0, honorarios: false }, ficha, 15.25), 95910);
  assert.equal(costoRegistro({ modalidad: 'interno', clase: 'servicio', cantidad: 4.5, valor: 0, honorarios: false }, ficha, 15.25), 23978);
  assert.equal(costoRegistro({ modalidad: 'externo', clase: 'servicio', cantidad: 4, valor: 20000, honorarios: true }, null, 15.25), 94395);
  assert.equal(costoRegistro({ modalidad: 'liquido', clase: 'mano_obra', cantidad: 3, valor: 50000, honorarios: true }, null, 15.25), 150000);
});
