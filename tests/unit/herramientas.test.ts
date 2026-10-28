// Herramientas traídas del cotizador de antes: cuadrilla, traslado por km, materiales y Excel. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../lib/cotizador/calculo.ts';
import { costoCuadrilla, costoTrasladoKm, descripcionCuadrilla, hojasExcel, materialesConsolidados } from '../../lib/cotizador/herramientas.ts';
import { leerPlanilla } from '../../lib/cotizador/planilla.ts';
import type { CotizacionDoc, Linea, PartidaCot } from '../../lib/cotizador/tipos.ts';

const linea = (id: string, partidaId: string, extra: Partial<Linea> = {}): Linea => ({
  id, partidaId, descripcion: id, categoria: 'material', unidad: 'un', cantidad: 1, costo: 10000, imprevistos: 0, margen: 0,
  precio: 0, iva: 19, descuento: 0, fuera: true, ganancia: 50, ...extra,
}) as Linea;

test('Cuadrilla: 2 técnicos y 1 ayudante por 3 días', () => {
  const c = costoCuadrilla({ tecnicos: 2, ayudantes: 1, dias: 3, costoDiaTecnico: 60000, costoDiaAyudante: 40000, extra: 10 });
  assert.equal(c.personas, 3);
  assert.equal(c.hh, 72);
  assert.equal(c.porDia, 176000);   // (120.000 + 40.000) × 1,1
  assert.equal(c.total, 528000);
  assert.equal(descripcionCuadrilla({ tecnicos: 2, ayudantes: 1 }), 'Mano de obra: 2 técnicos y 1 ayudante');
  assert.equal(descripcionCuadrilla({ tecnicos: 1, ayudantes: 0 }), 'Mano de obra: 1 técnico');
});

test('Traslado por km: ida y vuelta, peajes y horas del equipo', () => {
  // 80 km × 2 × $350 + $4.200 de peajes + 2 h × 2 personas × $8.000
  assert.equal(costoTrasladoKm({ km: 80, valorKm: 350, peajes: 4200, horas: 2, personas: 2, valorHora: 8000 }), 92200);
  assert.equal(costoTrasladoKm({ km: -5, valorKm: 350, peajes: 0, horas: 0, personas: 0, valorHora: 0 }), 0);
});

test('Materiales: el mismo producto de dos partidas en una fila; sin mano de obra ni cargos', () => {
  const partidas: PartidaCot[] = [
    { id: 'p1', nombre: 'Piso 1', cantidad: 1, unidad: 'global' }, { id: 'p2', nombre: 'Piso 2', cantidad: 1, unidad: 'global' },
    { id: 'cg', nombre: 'Cargos', cantidad: 1, unidad: 'global', tipo: 'cargo' },
  ];
  const lineas = [
    linea('a', 'p1', { descripcion: 'Cable 2,5 mm', unidad: 'm', cantidad: 20, itemId: 'cab', fuera: false }),
    linea('b', 'p2', { descripcion: 'Cable 2,5 mm', unidad: 'm', cantidad: 20, itemId: 'cab', fuera: false }),
    linea('c', 'p2', { descripcion: 'Enchufe doble', cantidad: 4 }),
    linea('d', 'p2', { descripcion: 'enchufe  doble', cantidad: 2 }),
    linea('mo', 'p1', { descripcion: 'Instalación', categoria: 'mano_obra', cantidad: 5 }),
    linea('cero', 'p1', { descripcion: 'Por confirmar', cantidad: 0 }),
    linea('x', 'cg', { descripcion: 'Logística', cantidad: 1 }),
  ];
  const m = materialesConsolidados(lineas, partidas);
  assert.deepEqual(m.map(x => [x.descripcion, x.cantidad, x.unidad, x.partidas.join('+')]), [
    ['Cable 2,5 mm', 40, 'm', 'Piso 1+Piso 2'],
    ['Enchufe doble', 6, 'un', 'Piso 2'],
  ]);
});

test('El Excel se vuelve a importar con las mismas partidas, cantidades, costos y utilidad', () => {
  const partidas: PartidaCot[] = [
    { id: 'p1', nombre: 'Tablero', descripcion: '**Suministro** y montaje', cantidad: 3, unidad: 'puerta', descuento: 5 },
    { id: 'p2', nombre: 'Tablero', cantidad: 1, unidad: 'global' },
  ];
  const items = [
    linea('Gabinete', 'p1', { cantidad: 2, costo: 100000, ganancia: 50, imprevistos: 10, codigo: 'GAB-1' }),
    linea('Armado', 'p1', { categoria: 'mano_obra', unidad: 'global', costo: 80000, ganancia: 100 }),
    linea('Pruebas', 'p2', { categoria: 'servicio', costo: 50000, ganancia: 25 }),
  ];
  const doc = { titulo: 'Tablero nuevo', descripcion_general: 'Intro', items, partidas, moneda: 'CLP' } as unknown as CotizacionDoc;
  const hojas = hojasExcel(doc, calcular(items, partidas, 'CLP'));
  // Como lo entrega Excel: encabezados y filas de celdas.
  const aCeldas = (filas: Record<string, unknown>[]) => [Object.keys(filas[0]), ...filas.map(f => Object.values(f))];
  const leida = leerPlanilla(hojas.map(h => ({ nombre: h.nombre, filas: aCeldas(h.filas) })));
  assert.deepEqual(leida.avisos, []);
  assert.equal(leida.titulo, 'Tablero nuevo');
  assert.deepEqual(leida.partidas.map(p => [p.nombre, p.cantidad, p.unidad, p.descripcion, p.componentes.length]),
    [['Tablero', 3, 'puerta', 'Suministro y montaje', 2], ['Tablero (2)', 1, 'global', '', 1]]);
  const gab = leida.partidas[0].componentes[0];
  assert.equal(gab.costo, 100000);
  assert.equal(gab.cantidad, 2);
  assert.equal(gab.imprevistos, 10);
  assert.equal(gab.codigo, 'GAB-1');
  // Ganancia 50 % sobre el costo con imprevistos = utilidad 33,33 % sobre el precio.
  assert.ok(Math.abs((gab.utilidad ?? 0) - 33.33) < 0.01, String(gab.utilidad));
  assert.equal(leida.partidas[0].componentes[1].categoria, 'mano_obra');
  assert.equal(leida.partidas[1].componentes[0].categoria, 'servicio');
  // El resumen y el total cuadran con el cálculo.
  const total = hojas[1].filas.find(f => String(f['Partida']).startsWith('Total'));
  assert.equal(total?.['Neto'], calcular(items, partidas, 'CLP').totales.total);
});
