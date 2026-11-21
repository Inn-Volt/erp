// Primer pago al aprobar (fase 20): el plan que deja (igual que cot_aprobar_con_anticipo) y su desglose. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anticipoDelPlan, desgloseAnticipo, planConAnticipo } from '../../lib/anticipo.ts';
import { montosHitos, presupuesto } from '../../lib/controlProyecto.ts';
import type { HitoCobro } from '../../lib/cotizador/tipos.ts';
import { IV0080, PLAN_COBRO_IV0080, TOTAL_IV0080 } from './fixture_iv0080.ts';

test('El primer pago que trae el plan: 50 % de IV-0080 = $1.951.796', () => {
  assert.equal(anticipoDelPlan(PLAN_COBRO_IV0080, TOTAL_IV0080), 1951796);
  assert.equal(anticipoDelPlan([{ nombre: 'Total', porcentaje: 100, cuando: 'terminar' }], TOTAL_IV0080), 0);
});

test('Primer pago de $300.000 sobre $1.000.000: anticipo exacto y el saldo queda en 70 %', () => {
  const plan = planConAnticipo(PLAN_COBRO_IV0080, 1000000, 300000);
  assert.equal(plan.length, 2);
  assert.deepEqual(montosHitos(1000000, plan).map(h => [h.nombre, h.cuando, h.monto]), [['Anticipo', 'aprobar', 300000], ['Saldo', 'terminar', 700000]]);
});

test('Un monto que no es un % redondo igual queda exacto, y los cobros suman el total', () => {
  const plan = planConAnticipo(PLAN_COBRO_IV0080, TOTAL_IV0080, 1234567);
  const m = montosHitos(TOTAL_IV0080, plan);
  assert.equal(m[0].monto, 1234567);
  assert.equal(m.reduce((s, h) => s + h.monto, 0), TOTAL_IV0080);
});

test('Los demás hitos se reparten lo que queda en su proporción; sin ellos, un «Saldo» al terminar', () => {
  const tres: HitoCobro[] = [
    { nombre: 'Anticipo', porcentaje: 40, cuando: 'aprobar' }, { nombre: 'Avance', porcentaje: 30, cuando: 'terminar' }, { nombre: 'Final', porcentaje: 30, cuando: 'terminar' },
  ];
  assert.deepEqual(planConAnticipo(tres, 1000000, 200000).map(h => [h.nombre, Math.round(h.porcentaje * 1000) / 1000]), [['Anticipo', 20], ['Avance', 40], ['Final', 40]]);
  assert.deepEqual(planConAnticipo([{ nombre: 'Pago', porcentaje: 100, cuando: 'aprobar' }], 1000000, 250000).map(h => [h.nombre, h.porcentaje, h.cuando]),
    [['Pago', 25, 'aprobar'], ['Saldo', 75, 'terminar']]);
  assert.deepEqual(planConAnticipo(PLAN_COBRO_IV0080, 1000000, 0).map(h => [h.nombre, h.porcentaje]), [['Saldo', 100]]);
  assert.deepEqual(planConAnticipo(PLAN_COBRO_IV0080, 1000000, 1000000).map(h => [h.nombre, h.porcentaje]), [['Anticipo', 100]]);
});

test('Desglose del primer pago de IV-0080 (exenta): sin IVA; el neto se reparte como lo cotizado', () => {
  const p = presupuesto(IV0080);
  const d = desgloseAnticipo({ monto: 1951796, total: TOTAL_IV0080, ivaRatio: 0, presupuesto: p });
  assert.equal(d.iva, 0);
  assert.equal(d.neto, 1951796);
  assert.equal(d.saldo, 1951795);
  assert.equal(Math.round(d.pct), 50);
  // Costo cotizado 3.150.000 sobre venta 3.903.591: material 1.300.000, mano de obra 1.200.000, servicio 650.000.
  assert.equal(d.costos.material, Math.round(1951796 * 1300000 / TOTAL_IV0080));
  assert.equal(d.costos.material + d.costos.mano_obra + d.costos.servicio + d.costos.operacion + d.utilidad, d.neto);
  assert.equal(d.materiales, 1300000);
  assert.ok(d.cubreMateriales! > 100, 'el anticipo alcanza para todos los materiales');
});

test('Con IVA: de $1.190.000 (IVA 19 %), $190.000 van al SII', () => {
  const d = desgloseAnticipo({ monto: 1190000, total: 2380000, ivaRatio: 380000 / 2380000, presupuesto: presupuesto(IV0080) });
  assert.equal(d.iva, 190000);
  assert.equal(d.neto, 1000000);
});
