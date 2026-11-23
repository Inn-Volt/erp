// Calculadora HH (fase 23): tarifas en UF y USD, la tarifa propia de la persona, el piso según
// costos, las líneas con apoyo y multiplicador, la urgencia, los redondeos, lo que ve el cliente y
// la UF del día (con el respaldo si mindicador se cae). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARAMETROS_INICIALES, calcularLinea, calcularTotales, entregablesCliente, enUF, estadoTarifa, formatoUF, pisoCLP,
  posicionMercado, redondear, repartirResiduo, tarifaEfectiva, tarifaHoyCLP, type CargoHH,
} from '../../lib/hh/calculo.ts';
import { elegirIndicadores, hoyEnChile, valorMindicador, valorSano } from '../../lib/hh/indicadores.ts';
import { faltaEnLinea, filaLinea, hojasCalculo, lineaDesdeFila, lineaVacia, tarifasDeLinea, totalesDe, type LineaHH } from '../../lib/hh/lineas.ts';

const P = PARAMETROS_INICIALES;
const IND = { uf: 41350.42, usd: 950 };

const cargo = (c: Partial<CargoHH>): CargoHH => ({
  id: 'c', nombre: 'Cargo', moneda_base: 'UF', tarifa_base: 0.5, mercado_min: null, mercado_max: null,
  sueldo_mercado_clp: null, notas: null, activo: true, orden: 0, ...c,
});
const SEC = cargo({ id: 'sec', nombre: 'Instalador eléctrico SEC', tarifa_base: 0.7, mercado_min: 0.48, mercado_max: 1.21, sueldo_mercado_clp: 1200000 });
const FULL = cargo({ id: 'full', nombre: 'Desarrollador full stack', moneda_base: 'USD', tarifa_base: 35, mercado_min: 27, mercado_max: 48, sueldo_mercado_clp: 2000000 });

test('Redondeos: al múltiplo más cercano (la mitad sube) y sin errores de coma flotante', () => {
  assert.equal(redondear(28945.294, 100), 28900);
  assert.equal(redondear(28950, 100), 29000);
  assert.equal(redondear(1931575, 1000), 1932000);
  assert.equal(redondear(1341500, 1000), 1342000);
  assert.equal(redondear(123.4, 0), 123);                       // paso inválido: a peso entero
  assert.equal(redondear(0.1 * 3 * 1000, 100), 300);            // 300,00000000000006
});

test('Tarifa de hoy en UF: 0,70 UF × $41.350,42 = $28.900 la hora (0,70 UF)', () => {
  const e = estadoTarifa(SEC, IND, P);
  assert.equal(e.clp, 28900);
  assert.equal(e.uf, 0.7);
  assert.equal(formatoUF(e.uf), '0,70 UF');
  assert.equal(e.mercado, 'dentro');
});

test('Cargo en USD: US$35 × $950 = $33.250 → $33.300 (con el respaldo de US$1.000, $35.000)', () => {
  assert.equal(tarifaHoyCLP(35, 'USD', IND, P), 33300);
  assert.equal(estadoTarifa(FULL, { uf: IND.uf, usd: P.usd_respaldo }, P).clp, 35000);
  assert.equal(enUF(33300, IND.uf), 0.81);
});

test('La tarifa propia de la persona manda sobre la del cargo', () => {
  assert.equal(tarifaEfectiva(SEC, null), 0.7);
  assert.equal(tarifaEfectiva(SEC, 0), 0.7);                    // 0 no es una tarifa
  assert.equal(tarifaEfectiva(SEC, 0.6), 0.6);
  assert.equal(estadoTarifa(SEC, IND, P, 0.6).clp, 24800);      // 0,6 × 41.350,42 = 24.810 → 24.800
});

test('Piso según costos y alerta «bajo el piso»; fuera del rango de mercado', () => {
  // 1.200.000 × 1,35 ÷ 140 × 1,25 × 1,30 = 18.803,57 → 18.800
  assert.equal(pisoCLP(1200000, P), 18800);
  assert.equal(pisoCLP(2000000, P), 31300);
  assert.equal(pisoCLP(null, P), null);
  assert.equal(estadoTarifa(SEC, IND, P).bajoPiso, false);
  const barato = estadoTarifa(SEC, IND, P, 0.2);                // 0,2 UF = $8.300 < $18.800
  assert.equal(barato.clp, 8300);
  assert.equal(barato.bajoPiso, true);
  assert.equal(barato.mercado, 'bajo');
  assert.equal(posicionMercado(1.5, 0.48, 1.21), 'sobre');
  assert.equal(posicionMercado(1, null, null), null);
});

test('Línea: el multiplicador va en las horas cobradas, el apoyo no (es terreno)', () => {
  // 8 puntos de red × 1,25 h, técnico a $20.700 y ayudante a $12.400 (1,25 h por punto).
  const base = { cantidad: 8, horas_reales: 1.25, multiplicador: 1, tarifa_clp: 20700, horas_apoyo: 1.25, tarifa_apoyo_clp: 12400, hh_referencia: 1.25 };
  const r = calcularLinea(base);
  assert.deepEqual([r.horasCobradas, r.principal, r.apoyo, r.subtotal], [10, 207000, 124000, 331000]);
  assert.equal(r.diferenciaReferencia, 0);
  const x2 = calcularLinea({ ...base, multiplicador: 2 });
  assert.deepEqual([x2.horasCobradas, x2.principal, x2.apoyo, x2.subtotal], [20, 414000, 124000, 538000]);
  assert.equal(x2.diferenciaReferencia, 207000);
  // Sin cargo de apoyo, las horas de apoyo no cuentan; sin horas reales la línea no suma.
  assert.equal(calcularLinea({ ...base, tarifa_apoyo_clp: null }).subtotal, 207000);
  assert.equal(calcularLinea({ ...base, horas_reales: null, tarifa_apoyo_clp: null }).subtotal, 0);
});

test('Totales: urgencia sobre la mano de obra, materiales con margen, traslado en UF y el neto redondeado', () => {
  const lineas = [
    { cantidad: 8, horas_reales: 1.25, multiplicador: 1, tarifa_clp: 20700, horas_apoyo: 1.25, tarifa_apoyo_clp: 12400 },
    { cantidad: 1, horas_reales: 8.5, multiplicador: 3, tarifa_clp: 33300, hh_referencia: 25 },   // landing page con IA
  ];
  const cab = { lineas, urgencia: true, materiales_clp: 100000, margen_materiales: 0.2, traslado_uf: 1 };
  const t = calcularTotales(cab, IND, P);
  assert.equal(t.lineas[1].diferenciaReferencia, 849150 - 832500);
  assert.equal(t.subtotalLineas, 1180150);
  assert.equal(t.manoObra, 1770225);                            // × 1,5 por urgencia
  assert.equal(t.recargoUrgencia, 590075);
  assert.equal(t.materialesVenta, 120000);
  assert.equal(t.trasladoCLP, 41350);
  assert.equal(t.neto, 1932000);                                // 1.931.575 → 1.932.000
  assert.equal(t.netoUF, 46.72);
  assert.equal(t.iva, 367080);
  assert.equal(t.total, 2299080);
  assert.equal(t.horasReales, 28.5);                            // 10 + 10 de apoyo + 8,5
  assert.equal(t.valorHoraReal, 62113);
  const sinUrgencia = calcularTotales({ ...cab, urgencia: false }, IND, P);
  assert.equal(sinUrgencia.manoObra, 1180150);
  assert.equal(sinUrgencia.neto, 1342000);
  assert.equal(calcularTotales({ lineas: [], urgencia: false, materiales_clp: 0, margen_materiales: 0, traslado_uf: 0 }, IND, P).valorHoraReal, null);
});

test('Lo que ve el cliente: entregables con su precio (con urgencia) que suman exacto el neto', () => {
  const lineas = [
    { cantidad: 8, horas_reales: 1.25, multiplicador: 1, tarifa_clp: 20700, horas_apoyo: 1.25, tarifa_apoyo_clp: 12400 },
    { cantidad: 1, horas_reales: 8.5, multiplicador: 3, tarifa_clp: 33300 },
  ];
  const t = calcularTotales({ lineas, urgencia: true, materiales_clp: 100000, margen_materiales: 0.2, traslado_uf: 1 }, IND, P);
  const e = entregablesCliente([{ descripcion: 'Puntos de red', cantidad: 8, unidad: 'punto' }, { descripcion: 'Landing page', cantidad: 1 }], t, IND);
  assert.deepEqual(e.map(x => x.descripcion), ['Puntos de red', 'Landing page', 'Materiales', 'Traslado']);
  assert.deepEqual(e.map(x => x.clp), [496500, 1274150, 120000, 41350]);   // los $425 del redondeo, al más grande
  assert.equal(e.reduce((s, x) => s + x.clp, 0), t.neto);
  assert.equal(Math.round(e.reduce((s, x) => s + x.uf, 0) * 100), Math.round(t.netoUF * 100));
  assert.deepEqual(repartirResiduo([10, 20, 30], 61), [10, 20, 31]);
  assert.deepEqual(repartirResiduo([100, 300], 0), [0, 0]);              // nunca bajo 0
});

test('La UF del día: mindicador, lo guardado hoy (manda), el último guardado o el respaldo si se cae', () => {
  const respaldo = { uf: 41350.42, usd: 1000, fecha: '2026-11-01' };
  const hoy = '2026-11-23';
  assert.equal(valorMindicador('uf', { serie: [{ valor: 41402.1 }, { valor: 41390 }] }), 41402.1);
  assert.equal(valorMindicador('uf', { serie: [{ valor: 0 }] }), null);
  assert.equal(valorMindicador('usd', { serie: [{ valor: 3000 }] }), null);   // fuera de rango
  assert.equal(valorMindicador('uf', {}), null);
  assert.equal(valorSano('usd', '948.5'), 948.5);

  const ok = elegirIndicadores({ hoy, deHoy: null, consultado: { uf: 41402.1, usd: 948.5 }, ultimo: null, respaldo });
  assert.deepEqual([ok.uf.valor, ok.uf.fuente, ok.usd.valor, ok.guardar], [41402.1, 'mindicador', 948.5, true]);

  const manual = elegirIndicadores({ hoy, deHoy: { fecha: hoy, uf: 41000, usd: 900, fuente: 'manual' }, consultado: null, ultimo: null, respaldo });
  assert.deepEqual([manual.uf.valor, manual.uf.fuente, manual.guardar], [41000, 'manual', false]);

  // UF caída sin nada guardado: el respaldo (y no se guarda, para volver a consultar).
  const caida = elegirIndicadores({ hoy, deHoy: null, consultado: { uf: null, usd: 948.5 }, ultimo: null, respaldo });
  assert.deepEqual([caida.uf.valor, caida.uf.fuente, caida.uf.fecha, caida.uf.anterior], [41350.42, 'respaldo', '2026-11-01', true]);
  assert.equal(caida.usd.fuente, 'mindicador');
  assert.equal(caida.guardar, false);

  // UF caída con un valor guardado antes: ese valor, con su fecha.
  const ultimo = { fecha: '2026-11-20', uf: 41380, usd: 951, fuente: 'mindicador' as const };
  const conUltimo = elegirIndicadores({ hoy, deHoy: null, consultado: null, ultimo, respaldo });
  assert.deepEqual([conUltimo.uf.valor, conUltimo.uf.fecha, conUltimo.usd.valor, conUltimo.guardar], [41380, '2026-11-20', 951, false]);

  // En Chile todavía es el 23 aunque en UTC ya sea el 24.
  assert.equal(hoyEnChile(new Date('2026-11-24T02:00:00Z')), '2026-11-23');
});

test('Una línea guardada vuelve igual (con la foto de la tarifa) y el Excel trae las dos hojas', () => {
  const l: LineaHH = {
    ...lineaVacia(), descripcion: 'Cambio de tablero', unidad: 'tablero', persona_id: 'p1', persona_nombre: 'Joaquín',
    cargo_id: 'sec', cargo_nombre: SEC.nombre, cargo_moneda: 'UF', cargo_tarifa_base: 0.6, tipo_tarea_clave: 'terreno',
    cantidad: 1, horas_reales: 8, cargo_apoyo_id: 'ay', cargo_apoyo_nombre: 'Ayudante eléctrico', cargo_apoyo_moneda: 'UF',
    cargo_apoyo_tarifa_base: 0.3, horas_apoyo: 6, hh_referencia: 8, trabajo_tipo_id: 't1',
  };
  assert.deepEqual(tarifasDeLinea(l, IND, P), { principal: 24800, apoyo: 12400 });
  const cab = { urgencia: false, materiales_clp: 0, margen_materiales: 0, traslado_uf: 0 };
  const t = totalesDe([l], cab, IND, P);
  assert.equal(t.lineas[0].subtotal, 8 * 24800 + 6 * 12400);
  const fila = filaLinea(l, t.lineas[0], IND, P, 0);
  assert.equal(fila.cargo_tarifa_clp, 24800);
  assert.equal(fila.subtotal_clp, 272800);
  const vuelta = lineaDesdeFila(fila);
  assert.deepEqual({ ...vuelta, key: '' }, { ...l, key: '' });
  assert.equal(faltaEnLinea(l), null);
  assert.equal(faltaEnLinea({ ...l, horas_reales: null }), 'faltan las horas reales');
  assert.equal(faltaEnLinea({ ...l, cargo_id: '' }), 'elige el cargo');
  const hojas = hojasCalculo({ nombre: 'Prueba', cliente: 'Cliente', lineas: [l], cab, nombreTipo: () => 'Ejecución en terreno' }, t, IND, P);
  assert.deepEqual(hojas.map(h => h.nombre), ['Cálculo', 'Totales']);
  assert.equal(hojas[0].filas[0]['Subtotal CLP'], 272800);
});
