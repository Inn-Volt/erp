// Mano de obra (fase 20): las mismas cuentas que hace la base (pruebas_fase20.sql). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoDia, costoExterno, costoHora, costoHoras, retencion, RETENCION_HONORARIOS, type JornadaInterno } from '../../lib/manoObra.ts';

const joaquin: JornadaInterno = { sueldo_bruto: 900000, aportes_pct: 5, dias_mes: 22, horas_dia: 9, colacion_dia: 3000, movilizacion_dia: 2000, otros_dia: 0 };

test('Interno: $900.000 + 5 % ÷ 22 días + colación y movilización = $47.955 al día', () => {
  assert.equal(costoDia(joaquin), 47955);
  assert.equal(costoHora(joaquin), 5328);
});

test('Las horas valen su parte del día (igual que la base)', () => {
  assert.equal(costoHoras(47955, 9, 9), 47955);
  assert.equal(costoHoras(47955, 4.5, 9), 23978);
  assert.equal(costoHoras(47955, 10, 9), 53283);
});

test('Externo con boleta de honorarios: el costo incluye la retención; sin boleta, lo líquido', () => {
  assert.equal(RETENCION_HONORARIOS, 15.25);
  assert.equal(costoExterno(50000, true), 58997);
  assert.equal(retencion(50000, true), 8997);
  assert.equal(costoExterno(50000, false), 50000);
  assert.equal(retencion(50000, false), 0);
  assert.equal(costoExterno(50000, true, 10), 55556);
});

test('Sin datos no se cae', () => {
  assert.equal(costoDia({ ...joaquin, sueldo_bruto: 0, colacion_dia: 0, movilizacion_dia: 0 }), 0);
  assert.equal(costoDia({ ...joaquin, dias_mes: 0 }), Math.round(900000 * 1.05 + 5000));
});
