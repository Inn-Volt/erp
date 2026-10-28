// «Revisar y enviar»: líneas en $0 y bajo el costo (con el descuento de la partida). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../lib/cotizador/calculo.ts';
import { revisar } from '../../lib/cotizador/revision.ts';
import type { CotizacionDoc, Linea, PartidaCot } from '../../lib/cotizador/tipos.ts';

const linea = (id: string, precio: number, extra: Partial<Linea> = {}): Linea => ({
  id, partidaId: 'p1', descripcion: id, categoria: 'material', unidad: 'un', cantidad: 1, costo: 50000, imprevistos: 0, margen: 0,
  precio, iva: 19, descuento: 0, itemId: `cat-${id}`, ...extra,
}) as Linea;

const avisos = (items: Linea[], partidas: PartidaCot[], esQuienCotiza = true) => {
  const doc = { items, partidas, moneda: 'CLP', que_ve_cliente: 'partidas', secciones: [], descripcion_general: 'x', aclaraciones: 'y', titulo: 'T' } as unknown as CotizacionDoc;
  return revisar(doc, calcular(items, partidas, 'CLP'), { id: 'c', nombre_cliente: 'Cliente', rut: '1-9', email: 'a@b.cl' } as never,
    { hoy: '2026-10-28', diasDeSiempre: 15, esQuienCotiza });
};
const P = (descuento?: number): PartidaCot[] => [{ id: 'p1', nombre: 'Equipos', cantidad: 1, unidad: 'global', descuento }];

test('Una línea en $0 no deja enviar', () => {
  const a = avisos([linea('a', 100000), linea('gratis', 0, { costo: 0 })], P());
  assert.ok(a.some(x => x.nivel === 'rojo' && x.texto.includes('«gratis» sale en $0') && !x.confirmar));
});

test('Con 100 % de descuento también sale en $0', () => {
  const a = avisos([linea('a', 100000, { descuento: 100 })], P());
  assert.ok(a.some(x => x.nivel === 'rojo' && x.texto.includes('100 % de descuento')));
});

test('Bajo el costo por el descuento de la partida: se envía solo confirmándolo', () => {
  // 60.000 sobre un costo de 50.000 está bien; con 20 % de la partida queda en 48.000.
  assert.ok(!avisos([linea('a', 60000)], P()).some(x => x.confirmar));
  const a = avisos([linea('a', 60000)], P(20));
  const perdida = a.find(x => x.confirmar === 'perdida');
  assert.ok(perdida && perdida.nivel === 'rojo' && perdida.texto.includes('con los descuentos'));
});

test('Un cargo operacional no se marca sin utilidad ni bajo el costo', () => {
  const partidas: PartidaCot[] = [...P(), { id: 'cg', nombre: 'Cargo operacional', cantidad: 1, unidad: 'global', tipo: 'cargo', descuento: 50 }];
  const items = [linea('a', 100000), linea('Traslado', 0, { partidaId: 'cg', categoria: 'operacion', fuera: true, itemId: null, costo: 25000, ganancia: 0 })];
  const a = avisos(items, partidas);
  assert.ok(!a.some(x => x.texto.includes('Traslado')), JSON.stringify(a));
});
