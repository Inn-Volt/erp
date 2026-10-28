// Cuentas de la cotización: descuento propio de la partida y cargos operacionales. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, montoDeCargo } from '../../lib/cotizador/calculo.ts';
import type { Linea, PartidaCot } from '../../lib/cotizador/tipos.ts';

const linea = (id: string, partidaId: string, precio: number, extra: Partial<Linea> = {}): Linea => ({
  id, partidaId, descripcion: id, categoria: 'material', unidad: 'un', cantidad: 1, costo: precio / 2, imprevistos: 0, margen: 0,
  precio, iva: 19, descuento: 0, itemId: `cat-${id}`, ...extra,
}) as Linea;

test('Sin descuento de partida, todo sigue igual que antes', () => {
  const r = calcular([linea('a', 'p1', 100000), linea('b', 'p1', 50000, { descuento: 10 })], [{ id: 'p1', nombre: 'P', cantidad: 1, unidad: 'global' }], 'CLP');
  assert.equal(r.totales.subtotal, 150000);
  assert.equal(r.totales.descuento, 5000);
  assert.equal(r.totales.neto, 145000);
  assert.equal(r.totales.iva, 27550);
  assert.equal(r.partidas.get('p1')!.neto, 145000);
  assert.equal(r.partidas.get('p1')!.descuentoPartida, 0);
});

test('El descuento de la partida va sobre su neto, ya con el de cada línea', () => {
  const partidas: PartidaCot[] = [{ id: 'p1', nombre: 'Equipos', cantidad: 1, unidad: 'global', descuento: 5 }, { id: 'p2', nombre: 'Otra', cantidad: 1, unidad: 'global' }];
  const r = calcular([linea('a', 'p1', 100000), linea('b', 'p1', 50000, { descuento: 20 }), linea('c', 'p2', 30000)], partidas, 'CLP');
  const p1 = r.partidas.get('p1')!;
  assert.equal(p1.netoLineas, 140000);          // 100.000 + 40.000
  assert.equal(p1.descuentoPartida, 7000);      // 5 % de 140.000
  assert.equal(p1.neto, 133000);
  assert.equal(p1.descuento, 17000);            // 10.000 de la línea + 7.000 de la partida
  assert.equal(r.totales.subtotal, 180000);
  assert.equal(r.totales.descuento, 17000);
  assert.equal(r.totales.neto, 163000);
  assert.equal(r.totales.iva, 30970);
  assert.equal(r.totales.total, 193970);
  assert.equal(r.internos.utilidad, 163000 - 90000);
});

test('El descuento de la partida se reparte entre lo afecto y lo exento (el IVA cuadra)', () => {
  const r = calcular([linea('a', 'p1', 100000), linea('e', 'p1', 100000, { iva: 0 })], [{ id: 'p1', nombre: 'P', cantidad: 1, unidad: 'global', descuento: 10 }], 'CLP');
  assert.equal(r.totales.neto, 180000);
  assert.equal(r.totales.exento, 90000);
  assert.equal(r.totales.afecto, 90000);
  assert.equal(r.totales.iva, 17100);
});

test('Cargo operacional calculado como %', () => {
  const partidas: PartidaCot[] = [
    { id: 'eq', nombre: 'Equipos', cantidad: 1, unidad: 'global', descuento: 5 },
    { id: 'cg', nombre: 'Cargo operacional', cantidad: 1, unidad: 'global', tipo: 'cargo', descuento: 50 },
  ];
  const lineas = [
    linea('prod', 'eq', 100000), linea('mo', 'eq', 40000, { categoria: 'mano_obra' }),
    linea('log', 'cg', 0, { categoria: 'operacion', fuera: true, itemId: null, costo: 14000, ganancia: 0 }),
  ];
  const r = calcular(lineas, partidas, 'CLP');
  // Logística 10 % de Equipos: sobre la partida ANTES de su descuento propio (140.000).
  assert.equal(montoDeCargo({ pct: 10, base: 'eq' }, lineas, partidas, r), 14000);
  // 8 % de la mano de obra (con el 5 % de su partida): 8 % de 38.000.
  assert.equal(montoDeCargo({ pct: 8, base: 'mano_obra' }, lineas, partidas, r), 3040);
  // 10 % de toda la cotización: nunca cuenta los cargos (133.000).
  assert.equal(montoDeCargo({ pct: 10, base: 'total' }, lineas, partidas, r), 13300);
  // Un cargo no lleva descuento de partida y se cobra tal cual (precio = costo).
  assert.equal(r.partidas.get('cg')!.neto, 14000);
  assert.equal(r.lineas.get('log')!.utilidad, 0);
  // Si la partida base ya no está, no hay monto (queda el de antes).
  assert.equal(montoDeCargo({ pct: 10, base: 'no-existe' }, lineas, partidas, r), null);
});
