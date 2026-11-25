// Cobranza (fase 25): abonos libres, saldo, el plan como guía e impuestos de lo abonado. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuentaTrabajo, recordatorioSaldo, resumenCobranza } from '../../lib/cobranza.ts';
import type { HitoCobro } from '../../lib/cotizador/tipos.ts';

const PLAN_50: HitoCobro[] = [
  { nombre: 'Anticipo', porcentaje: 50, cuando: 'aprobar' },
  { nombre: 'Saldo', porcentaje: 50, cuando: 'terminar' },
];
// Obra de $3.000.000 con IVA (neto $2.521.008, IVA $478.992).
const OBRA = { total: 3000000, ivaRatio: 478992 / 3000000, plan: PLAN_50 };

test('Abonos libres: $1.500.000 y después $500.000 de $3.000.000', () => {
  const c = cuentaTrabajo({ ...OBRA, terminado: false, abonos: [{ fecha: '2026-11-20', monto: 1500000 }, { fecha: '2026-11-24', monto: 500000 }] });
  assert.deepEqual([c.abonado, c.saldo, c.estado, Math.round(c.pct)], [2000000, 1000000, 'parcial', 67]);
  assert.equal(c.ultimoAbono, '2026-11-24');
  // El plan como guía: el anticipo de $1.500.000 queda cubierto; del saldo van $500.000 (más adelante).
  assert.deepEqual(c.hitos.map(h => [h.nombre, h.monto, h.cubierto, h.estado]), [['Anticipo', 1500000, 1500000, 'cubierto'], ['Saldo', 1500000, 500000, 'parcial']]);
  assert.deepEqual([c.esperado, c.atrasado], [1500000, 0]);
});

test('Lo atrasado: lo que el plan ya esperaba y no llega', () => {
  const sinNada = cuentaTrabajo({ ...OBRA, terminado: false, abonos: [] });
  assert.deepEqual([sinNada.estado, sinNada.atrasado, sinNada.hitos[0].estado, sinNada.hitos[1].estado], ['sin_abonos', 1500000, 'pendiente', 'por_venir']);
  // Terminado con $2.000.000 abonados: ya se espera todo, faltan $1.000.000.
  const terminado = cuentaTrabajo({ ...OBRA, terminado: true, abonos: [{ fecha: '2026-11-20', monto: 2000000 }] });
  assert.deepEqual([terminado.esperado, terminado.atrasado, terminado.hitos[1].estado], [3000000, 1000000, 'parcial']);
});

test('Pagado, pagado de más e impuestos de lo abonado (IVA de la cotización y PPM)', () => {
  const pagado = cuentaTrabajo({ ...OBRA, terminado: true, abonos: [{ fecha: '2026-11-20', monto: 3000000 }], ppmPct: 0.25 });
  assert.deepEqual([pagado.estado, pagado.saldo, pagado.atrasado], ['pagado', 0, 0]);
  assert.deepEqual([pagado.iva, pagado.ppm, pagado.queda], [478992, 6303, 2514705]);   // PPM 0,25 % del neto $2.521.008
  const deMas = cuentaTrabajo({ ...OBRA, terminado: true, abonos: [{ fecha: '2026-11-20', monto: 3100000 }] });
  assert.deepEqual([deMas.estado, deMas.saldo, deMas.deMas], ['de_mas', 0, 100000]);
  // Sin IVA en la cotización no se descuenta IVA.
  const sinIva = cuentaTrabajo({ total: 1000000, ivaRatio: 0, plan: PLAN_50, terminado: false, abonos: [{ fecha: '2026-11-20', monto: 400000 }] });
  assert.deepEqual([sinIva.iva, sinIva.queda], [0, 400000]);
});

test('Un anticipo en UF se espera al valor del día', () => {
  const plan: HitoCobro[] = [
    { nombre: 'Anticipo', porcentaje: 0, cuando: 'aprobar', tipo: 'UF', valor: 10 },
    { nombre: 'Saldo', porcentaje: 0, cuando: 'terminar', tipo: 'resto' },
  ];
  const c = cuentaTrabajo({ total: 1000000, ivaRatio: 0.16, plan, valores: { uf: 40000 }, terminado: false, abonos: [{ fecha: '2026-11-25', monto: 300000 }] });
  assert.deepEqual(c.hitos.map(h => [h.monto, h.estado]), [[400000, 'parcial'], [600000, 'por_venir']]);
  assert.equal(c.atrasado, 100000);
});

test('Resumen de todos los trabajos y el recordatorio del saldo', () => {
  const atrasada = cuentaTrabajo({ ...OBRA, terminado: false, abonos: [] });
  const alDia = cuentaTrabajo({ ...OBRA, terminado: false, abonos: [{ fecha: '2026-11-20', monto: 1500000 }] });
  const r = resumenCobranza([{ cuenta: atrasada, desde: '2026-09-01' }, { cuenta: alDia, desde: '2026-11-20' }], '2026-11-25');
  assert.deepEqual([r.porCobrar, r.atrasado, r.tramos], [4500000, 1500000, [0, 0, 1500000]]);   // 85 días: más de 60
  const texto = recordatorioSaldo({ contacto: 'Juan Pérez', folio: 'IV-0123', titulo: 'Tablero', abonado: 2000000, total: 3000000, saldo: 1000000,
    empresa: { nombre: 'InnVolt SpA', rut: '77.000.000-0', banco: 'Banco', tipo_cuenta: 'Cuenta corriente', cuenta_bancaria: '123', email: null } });
  assert.match(texto, /^Hola Juan,/);
  assert.match(texto, /abonos por \$2\.000\.000 de \$3\.000\.000, y queda un saldo de \$1\.000\.000/);
  assert.match(texto, /Datos para transferir: InnVolt SpA/);
});
