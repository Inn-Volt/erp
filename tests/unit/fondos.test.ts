// Fondos por persona (fase 19): el libro y el reparto deben decir lo mismo que la base. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { efectoMovimiento, libroDelFondo, opcionesDePago, repartoPrevisto, type GastoDelFondo, type MovimientoFondo } from '../../lib/fondos.ts';

let folio = 0;
const mov = (tipo: MovimientoFondo['tipo'], monto: number, fecha: string, extra: Partial<MovimientoFondo> = {}): MovimientoFondo => ({
  id: `m${++folio}`, folio, usuario_id: 'u', tipo, monto, fecha, estado: 'confirmado', nota: null, motivo: null, comprobante_path: null,
  revierte_id: null, revertido: false, anticipo_id: null, creado_por: null, confirmado_por: null, created_at: `${fecha}T10:0${folio % 10}:00Z`, ...extra,
});
const gasto = (id: string, fecha: string, monto: number, delFondo: number, extra: Partial<GastoDelFondo> = {}): GastoDelFondo => ({
  id, fecha, monto, monto_fondo: delFondo, monto_propio: monto - delFondo, pagado_con: delFondo === monto ? 'fondo' : delFondo ? 'mixto' : 'propio',
  estado: 'rendido', descripcion: id, categoria: 'otro', created_at: `${fecha}T12:00:00Z`, ...extra,
});

test('Cada movimiento mueve el fondo o lo que se le debe; la reversa, al revés', () => {
  assert.deepEqual(efectoMovimiento({ tipo: 'entrega', monto: 100 }), { fondo: 100, deuda: 0 });
  assert.deepEqual(efectoMovimiento({ tipo: 'devolucion', monto: 30 }), { fondo: -30, deuda: 0 });
  assert.deepEqual(efectoMovimiento({ tipo: 'pago', monto: 20 }), { fondo: 0, deuda: -20 });
  assert.deepEqual(efectoMovimiento({ tipo: 'compensacion', monto: 5 }), { fondo: -5, deuda: -5 });
  assert.deepEqual(efectoMovimiento({ tipo: 'reversa', monto: 5 }, 'compensacion'), { fondo: 5, deuda: 5 });
});

test('El libro deja los mismos saldos que la base (el caso de las pruebas de la fase 19)', () => {
  const comp = mov('compensacion', 5000, '2026-11-05');
  const movs = [
    // Lo de antes: el anticipo y lo que ya se le había reembolsado.
    mov('entrega', 100000, '2026-09-30'),
    mov('pago', 20000, '2026-09-30', { nota: 'Lo que se le reembolsó antes de los fondos' }),
    mov('entrega', 50000, '2026-11-02'),
    mov('entrega', 40000, '2026-11-03'),
    mov('devolucion', 15000, '2026-11-04'),
    mov('devolucion', 9999, '2026-11-04', { estado: 'descartado', motivo: 'No llegó' }),
    mov('pago', 20000, '2026-11-05'),
    comp,
    mov('reversa', 5000, '2026-11-06', { revierte_id: comp.id, motivo: 'Se pagó por transferencia' }),
  ];
  const gastos = [
    gasto('pagado antes', '2026-09-15', 20000, 0, { estado: 'reembolsado' }),
    gasto('contra anticipo', '2026-10-01', 30000, 30000),
    gasto('de su bolsillo', '2026-10-02', 90000, 70000, { estado: 'reembolsado' }),
    gasto('bencina', '2026-11-02', 30000, 30000), gasto('almuerzo', '2026-11-02', 25000, 20000, { estado: 'reembolsado' }),
    gasto('peaje con tarjeta', '2026-11-06', 12000, 0, { pagado_con: 'empresa', monto_propio: 0 }),
  ];
  const libro = libroDelFondo(movs, gastos);
  const ultimo = libro[libro.length - 1];
  assert.equal(ultimo.saldoFondo, 25000);
  assert.equal(ultimo.saldoDeuda, 5000);
  assert.ok(libro.find(f => f.movimiento?.estado === 'descartado')?.tachada);
  assert.match(libro.find(f => f.movimiento?.tipo === 'reversa')!.texto, /Reversa de FM-\d{4} \(descontado del fondo\)/);
  // Nunca negativo en el fondo en este caso.
  assert.ok(libro.every(f => f.saldoFondo >= 0));
});

test('Lo observado no suma a lo que se le debe; la devolución por confirmar no mueve aún el saldo', () => {
  const libro = libroDelFondo(
    [mov('entrega', 10000, '2026-11-01'), mov('devolucion', 4000, '2026-11-02', { estado: 'por_confirmar' })],
    [gasto('g', '2026-11-01', 15000, 10000, { estado: 'observado' })],
  );
  const fin = libro[libro.length - 1];
  assert.equal(fin.saldoFondo, 0);
  assert.equal(fin.saldoDeuda, 0);
  assert.ok(libro.find(f => f.enCamino));
});

test('¿Con qué pagaste? y cuánto sale del fondo', () => {
  assert.deepEqual(repartoPrevisto(30000, 50000), { delFondo: 30000, propio: 0, como: 'fondo' });
  assert.deepEqual(repartoPrevisto(25000, 20000), { delFondo: 20000, propio: 5000, como: 'mixto' });
  assert.deepEqual(repartoPrevisto(8000, 0), { delFondo: 0, propio: 8000, como: 'propio' });
  assert.deepEqual(opcionesDePago(30000, 50000, false).map(o => o.texto), ['Con mi fondo']);
  assert.deepEqual(opcionesDePago(25000, 20000, false).map(o => o.texto), ['Con mi fondo y mi dinero']);
  assert.deepEqual(opcionesDePago(8000, 0, true).map(o => o.texto), ['Con mi dinero', 'Con la tarjeta de la empresa']);
});
