// Pruebas de «importar planilla» al cotizador. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPlanilla, numeroCelda, tipoCelda, planEnTexto, introduccionDePlanilla, PLANILLA_EJEMPLO } from '../../lib/cotizador/planilla.ts';

test('Números con formato chileno, de Excel y porcentajes', () => {
  assert.equal(numeroCelda('$1.050.000'), 1050000);
  assert.equal(numeroCelda('2,5'), 2.5);
  assert.equal(numeroCelda(800000), 800000);
  assert.equal(numeroCelda('10 %'), 10);
  assert.ok(Number.isNaN(numeroCelda('')));
});

test('Tipos escritos de varias formas', () => {
  assert.equal(tipoCelda('Mano de obra'), 'mano_obra');
  assert.equal(tipoCelda('M.O.'), 'mano_obra');
  assert.equal(tipoCelda('Equipos'), 'material');
  assert.equal(tipoCelda('Servicio'), 'servicio');
  assert.equal(tipoCelda('Operación'), 'operacion');
  assert.equal(tipoCelda(''), 'material');
  assert.equal(tipoCelda('cualquier cosa'), null);
});

test('La planilla de ejemplo se lee completa', () => {
  const r = leerPlanilla(PLANILLA_EJEMPLO);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.titulo, 'Normalización de tablero eléctrico');
  assert.equal(r.partidas.length, 2);
  const [tablero, pruebas] = r.partidas;
  assert.equal(tablero.nombre, 'Tablero general');
  assert.equal(tablero.descripcion, 'Suministro, armado y montaje de tablero nuevo');
  assert.equal(tablero.componentes.length, 3);
  assert.deepEqual(tablero.componentes[1], {
    descripcion: 'Interruptor caja moldeada 160 A 3P', categoria: 'material', unidad: 'un', cantidad: 2, costo: 400000, matched: false, imprevistos: 10,
  });
  assert.equal(tablero.componentes[2].categoria, 'mano_obra');
  assert.equal(pruebas.componentes[0].categoria, 'servicio');
  assert.equal(r.textos.length, 2);
  assert.deepEqual(r.etapas.map(e => [e.inicio, e.dias]), [[1, 2], [3, 2], [5, 2]]);
  assert.match(introduccionDePlanilla(r), /\*\*Exclusiones:\*\*\n- Obras civiles\n- Trámites SEC/);
});

test('Encabezados con otro orden, títulos arriba, totales y filas sin partida', () => {
  const r = leerPlanilla([{ nombre: 'Hoja1', filas: [
    ['COTIZACIÓN INNVOLT'],
    [],
    ['Ítem', 'Costo unitario', 'Partida', 'Cantidad', 'Utilidad %'],
    ['Cable huérfano', 1000, '', 1, ''],
    ['Gabinete', '$1.800.000', 'Tablero 2', 1, 0.3],
    ['Barras', '1.250.000', '', '1', '30 %'],
    ['', '', 'SUBTOTAL', '', ''],
    ['TOTAL', 3050000, '', '', ''],
    ['', '', 'IVA 19 %', '', ''],
    ['Sin costo', '', 'Tablero 2', 2, ''],
  ] }]);
  assert.equal(r.partidas.length, 1);
  assert.deepEqual(r.partidas[0].componentes.map(c => [c.descripcion, c.costo, c.cantidad, c.utilidad]), [
    ['Gabinete', 1800000, 1, 30], ['Barras', 1250000, 1, 30], ['Sin costo', 0, 2, undefined],
  ]);
  assert.equal(r.avisos.length, 2);
  assert.match(r.avisos[0], /no tiene partida/);
  assert.match(r.avisos[1], /sin costo/);
});

test('Sin hoja de ítems avisa', () => {
  const r = leerPlanilla([{ nombre: 'x', filas: [['a', 'b'], [1, 2]] }]);
  assert.equal(r.partidas.length, 0);
  assert.match(r.avisos[0], /No se encontró la hoja de ítems/);
});

test('Plan sin columna de inicio: una etapa tras otra', () => {
  const r = leerPlanilla([{ nombre: 'Plan', filas: [['Etapa', 'Días'], ['Ingeniería', 2], ['Taller', 5], ['Total', 7]] }]);
  assert.deepEqual(r.etapas, [{ nombre: 'Ingeniería', inicio: 1, dias: 2 }, { nombre: 'Taller', inicio: 3, dias: 5 }]);
  assert.equal(planEnTexto(r.etapas), '**Plan de ejecución (días hábiles):**\n- Ingeniería: días 1–2 (2 días)\n- Taller: días 3–7 (5 días)\n- Plazo total estimado: 7 días hábiles.');
});
