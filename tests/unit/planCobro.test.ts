// Forma de pago (fase 24): cobros en %, en $, en UF o dólares y «el resto». Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detalleHito, hitoActivo, montosHitos, planActivo, planEnPalabras, revisarPlan } from '../../lib/cotizador/planCobro.ts';
import { anticipoDelPlan, planConAnticipo } from '../../lib/anticipo.ts';
import type { HitoCobro } from '../../lib/cotizador/tipos.ts';

const UF10: HitoCobro[] = [
  { nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'UF', valor: 10 },
  { nombre: 'Saldo', porcentaje: 0, cuando: 'terminar', tipo: 'resto' },
];

test('Lo que lee el cliente, en su moneda', () => {
  assert.equal(planEnPalabras(UF10), '10 UF al aprobar y el saldo al terminar el trabajo');
  assert.equal(planEnPalabras([{ nombre: 'A', porcentaje: 50, cuando: 'aprobar' }, { nombre: 'S', porcentaje: 50, cuando: 'terminar' }]),
    '50 % al aprobar y 50 % al terminar el trabajo');                        // los planes de antes, igual
  assert.equal(detalleHito({ nombre: 'A', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 500000 }), '$500.000');
  assert.equal(detalleHito({ nombre: 'A', porcentaje: 0, cuando: 'aprobar', tipo: 'USD', valor: 1500.5 }), 'US$ 1.500,5');
  assert.equal(detalleHito({ nombre: 'A', porcentaje: 0, cuando: 'aprobar', tipo: 'UF', valor: 12.25 }), '12,25 UF');
  assert.equal(detalleHito({ nombre: 'A', porcentaje: 30.864197, cuando: 'aprobar' }), '30,86 %');
  assert.ok(hitoActivo(UF10[1]) && !hitoActivo({ nombre: 'X', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 0 }));
  assert.equal(planActivo([{ nombre: 'X', porcentaje: 0, cuando: 'aprobar' }]), false);
});

test('Cuánto es cada cobro en pesos: la UF del día y el resto cuadra el total', () => {
  const m = montosHitos(1000000, UF10, { uf: 40000 });
  assert.deepEqual(m.map(h => h.monto), [400000, 600000]);
  const mezcla: HitoCobro[] = [
    { nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 250000 },
    { nombre: 'Avance', porcentaje: 20, cuando: 'terminar', tipo: 'pct' },
    { nombre: 'Final', porcentaje: 0, cuando: 'terminar', tipo: 'USD', valor: 100 },
    { nombre: 'Saldo', porcentaje: 0, cuando: 'terminar', tipo: 'resto' },
  ];
  assert.deepEqual(montosHitos(1000000, mezcla, { uf: 40000, usd: 950 }).map(h => h.monto), [250000, 200000, 95000, 455000]);
  // Los montos fijos pasan el total: el resto queda en 0 (nunca negativo).
  assert.equal(montosHitos(300000, UF10, { uf: 40000 })[1].monto, 0);
  // Solo en %: como siempre, sobre el acumulado (la suma da exacta).
  assert.deepEqual(montosHitos(1000001, [{ nombre: 'A', porcentaje: 50, cuando: 'aprobar' }, { nombre: 'S', porcentaje: 50, cuando: 'terminar' }]).map(h => h.monto), [500001, 500000]);
  assert.equal(anticipoDelPlan(UF10, 1000000, { uf: 41398.57 }), 413986);
});

test('La forma de pago se revisa antes de guardar o enviar', () => {
  assert.equal(revisarPlan(UF10), null);
  assert.equal(revisarPlan([{ nombre: 'A', porcentaje: 30, cuando: 'aprobar' }, { nombre: 'S', porcentaje: 0, cuando: 'terminar', tipo: 'resto' }]), null);
  assert.match(revisarPlan([{ nombre: 'A', porcentaje: 60, cuando: 'aprobar' }])!, /suman 60 %/);
  assert.match(revisarPlan([{ nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 500000 }])!, /el resto/);
  assert.match(revisarPlan([{ nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'UF', valor: 0 }, UF10[1]])!, /Falta el monto de «Anticipo»/);
  assert.match(revisarPlan([...UF10, { nombre: 'Otro', porcentaje: 0, cuando: 'terminar', tipo: 'resto' }])!, /Solo un cobro/);
  assert.match(revisarPlan([{ nombre: 'A', porcentaje: 100, cuando: 'aprobar' }, UF10[1]])!, /menos de 100 %/);
  assert.match(revisarPlan([{ nombre: 'Saldo', porcentaje: 50, cuando: 'aprobar' }, { nombre: 'saldo', porcentaje: 50, cuando: 'terminar' }])!, /llamarse igual/);
  assert.match(revisarPlan([{ nombre: ' ', porcentaje: 100, cuando: 'aprobar' }])!, /nombre/);
});

test('Primer pago en $ al aprobar con montos fijos: queda en pesos y se agrega el saldo (igual que la base)', () => {
  const plan: HitoCobro[] = [
    { nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: 300000 },
    { nombre: 'Avance', porcentaje: 20, cuando: 'terminar', tipo: 'pct' },
    { nombre: 'Final', porcentaje: 0, cuando: 'terminar', tipo: 'USD', valor: 100 },
  ];
  const nuevo = planConAnticipo(plan, 1000000, 250000);
  assert.deepEqual(nuevo.map(h => [h.nombre, h.tipo, h.valor ?? h.porcentaje]),
    [['Anticipo', 'CLP', 250000], ['Avance', 'pct', 20], ['Final', 'USD', 100], ['Saldo', 'resto', 0]]);
  assert.deepEqual(montosHitos(1000000, nuevo, { usd: 950 }).map(h => h.monto), [250000, 200000, 95000, 455000]);
  // Con un «el resto» ya en el plan no se agrega otro; el UF del anticipo pasa a pesos.
  assert.deepEqual(planConAnticipo(UF10, 1000000, 420000).map(h => [h.nombre, h.tipo, h.valor ?? null]), [['Anticipo', 'CLP', 420000], ['Saldo', 'resto', null]]);
});
