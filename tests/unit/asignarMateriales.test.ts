// Registrar una compra con IA (fase 22): claves cortas para la IA, lo que responde, el respaldo por
// palabras, la conversión de unidades, una lista pegada y «Así quedan los materiales». Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asignarPorPalabras, clavesMateriales, convertirUnidad, instruccionesAsignacion, normalizarRespuesta, parsearLista, previaMateriales,
  resolverAsignacion, unidadNormal, type MaterialAsignable,
} from '../../lib/asignarMateriales.ts';

const MATERIALES: MaterialAsignable[] = [
  { id: 'uuid-cable', descripcion: 'Cable 6 mm² libre de halógeno', unidad: 'm', cantidad: 100, partida_id: 'p2', comprado: 30 },
  { id: 'uuid-tablero', descripcion: 'Tablero 24 módulos embutido', unidad: 'un', cantidad: 1, partida_id: 'p4', comprado: 0 },
  { id: 'uuid-automatico', descripcion: 'Automático 2x16A curva C', unidad: 'un', cantidad: 10, partida_id: 'p4', comprado: 0 },
];

test('A la IA van claves cortas (M1, M2…), nunca los id', () => {
  const { claves, idDe } = clavesMateriales(MATERIALES);
  assert.deepEqual(claves.map(c => c.clave), ['M1', 'M2', 'M3']);
  assert.equal(idDe.get('M2'), 'uuid-tablero');
  const prompt = instruccionesAsignacion(claves, 'documento');
  assert.match(prompt, /M1 · Cable 6 mm² libre de halógeno · unidad: m · presupuestado: 100/);
  assert.doesNotMatch(prompt, /uuid-/);
  assert.match(instruccionesAsignacion(claves, 'lista'), /lista de materiales comprados/);
});

test('Lo que responde la IA: claves que existen y la cantidad en la unidad del material', () => {
  const { claves } = clavesMateriales(MATERIALES);
  const r = normalizarRespuesta({
    tipo_doc: 'factura', folio: '881', fecha: '2026-11-25', proveedor_nombre: 'Electro Sur', proveedor_rut: '', neto: 100000, iva: 19000, exento: 0, total: 119000, descripcion: '',
    lineas: [
      { descripcion: 'ROLLO CABLE THHN 6MM 100 MTS', cantidad: 1, unidad: 'rollo', monto: 89000, material: 'm1', cantidad_material: 100 },
      { descripcion: '', cantidad: 1, unidad: 'un', monto: 1, material: 'M2', cantidad_material: 1 },        // sin descripción: se descarta
      { descripcion: 'Cinta aisladora 3M', cantidad: 2, unidad: 'un', monto: 3000, material: 'M9', cantidad_material: 2 },   // clave que no existe
      { descripcion: 'Automático 2x16A', cantidad: 4, unidad: 'un', monto: 27000, material: 'M3', cantidad_material: 'cuatro' },
    ],
  }, claves);
  assert.deepEqual(r.lineas.map(l => [l.descripcion, l.material, l.cantidad_material]), [
    ['ROLLO CABLE THHN 6MM 100 MTS', 'M1', 100],
    ['Cinta aisladora 3M', null, null],
    ['Automático 2x16A', 'M3', null],
  ]);
  assert.equal(r.doc.total, 119000);
});

test('En el navegador: la clave pasa a ser el id; lo que la IA no asignó se sugiere por palabras y la unidad se convierte', () => {
  const { claves, idDe } = clavesMateriales(MATERIALES);
  const r = normalizarRespuesta({
    tipo_doc: 'boleta', total: 50000,
    lineas: [
      { descripcion: 'Rollo cable 6mm2 x 100 m', cantidad: 1, unidad: 'rollo', monto: 40000, material: '', cantidad_material: 0 },
      { descripcion: 'Automático 2x16A', cantidad: 4, unidad: 'un', monto: 8000, material: 'M3', cantidad_material: 4 },
      { descripcion: 'Cinta aisladora 3M', cantidad: 2, unidad: 'un', monto: 2000, material: '', cantidad_material: 0 },
    ],
  }, claves);
  const a = resolverAsignacion(r, MATERIALES, idDe);
  assert.deepEqual(a.lineas.map(l => [l.presupuesto_linea_id, l.cantidad_material, l.sugerida]), [
    ['uuid-cable', 100, 'palabras'],     // 1 rollo de 100 m → 100 m
    ['uuid-automatico', 4, 'ia'],
    [null, 2, null],                     // no cotizado: queda tal cual
  ]);
});

test('Convertir a la unidad del material con lo que dice la descripción', () => {
  assert.deepEqual(convertirUnidad('Cable THHN 6mm2 rollo 100 mts', 2, 'rollo', 'm'), { cantidad: 200, convertida: true });
  assert.deepEqual(convertirUnidad('Tornillos caja x 10', 2, 'caja', 'un'), { cantidad: 20, convertida: true });
  assert.deepEqual(convertirUnidad('Cable 6 mm²', 30, 'mts', 'm'), { cantidad: 30, convertida: false });   // misma unidad
  assert.deepEqual(convertirUnidad('Tablero', 1, 'gl', 'un'), { cantidad: 1, convertida: false });        // no se sabe: igual
  assert.equal(unidadNormal('Mts.'), 'm');
  assert.equal(unidadNormal('c/u'), 'un');
});

test('Una lista pegada sin IA: cantidad, unidad, producto y precio', () => {
  assert.deepEqual(parsearLista([
    '- 10 m Cable 6 mm² $12.500',
    'Automático 2x16A - 4 un - 35.960',
    '2 x Tablero 24 mód.',
    '1 rollo cable THHN 100 m',
    'Cinta aisladora 3M',
    'Total: 50.000',
    '',
  ].join('\n')), [
    { descripcion: 'Cable 6 mm²', cantidad: 10, unidad: 'm', monto: 12500 },
    { descripcion: 'Automático 2x16A', cantidad: 4, unidad: 'un', monto: 35960 },
    { descripcion: 'Tablero 24 mód.', cantidad: 2, unidad: '', monto: 0 },
    { descripcion: 'cable THHN 100 m', cantidad: 1, unidad: 'rollo', monto: 0 },
    { descripcion: 'Cinta aisladora 3M', cantidad: null, unidad: '', monto: 0 },
  ]);
  const asignadas = asignarPorPalabras(parsearLista('1 rollo cable 6mm2 100 m\n4 un automático 2x16A'), MATERIALES);
  assert.deepEqual(asignadas.map(l => [l.presupuesto_linea_id, l.cantidad_material]), [['uuid-cable', 100], ['uuid-automatico', 4]]);
});

test('Así quedan los materiales: comprar 5 de 10 deja 5 pendientes; de más se marca', () => {
  const p = previaMateriales(MATERIALES, [
    { presupuesto_linea_id: 'uuid-automatico', cantidad_material: 5 },
    { presupuesto_linea_id: 'uuid-cable', cantidad_material: 80 },
    { presupuesto_linea_id: null, cantidad_material: 3 },
  ]);
  assert.deepEqual(p.map(x => [x.id, x.antes, x.ahora, x.despues, x.pendiente, x.demas]), [
    ['uuid-cable', 30, 80, 110, 0, 10],
    ['uuid-automatico', 0, 5, 5, 5, 0],
  ]);
});
