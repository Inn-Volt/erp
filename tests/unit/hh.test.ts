// Calculadora HH (fase 23): tarifas en UF y USD, la tarifa propia de la persona, el piso según
// costos, las líneas con apoyo y multiplicador, la urgencia, los redondeos, lo que ve el cliente y
// la UF del día (con el respaldo si mindicador se cae). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARAMETROS_INICIALES, calcularLinea, calcularTotales, costoHoraCLP, entregablesCliente, enUF, estadoTarifa, formatoUF, pisoCLP,
  posicionMercado, precioConUtilidad, redondear, repartirResiduo, tarifaEfectiva, tarifaHoyCLP, utilidadDe, type CargoHH,
} from '../../lib/hh/calculo.ts';
import { cotizacionDesdeCalculo } from '../../lib/hh/aCotizacion.ts';
import { calcularLinea as calcularLineaCot } from '../../lib/cotizador/calculo.ts';
import { elegirIndicadores, hoyEnChile, valorMindicador, valorSano } from '../../lib/hh/indicadores.ts';
import { faltaEnLinea, filaLinea, hojasCalculo, lineaDesdeFila, lineaVacia, tarifasDeLinea, totalesDe, type LineaHH } from '../../lib/hh/lineas.ts';
import { ayudasCatalogo, conPersona, conTrabajo, iniciales } from '../../components/hh/catalogo.ts';
import type { CatalogoHH } from '../../services/hh.ts';

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

test('Totales: urgencia, materiales con la utilidad del cotizador, operación, gestión de proyecto y el neto redondeado', () => {
  const lineas = [
    { cantidad: 8, horas_reales: 1.25, multiplicador: 1, tarifa_clp: 20700, horas_apoyo: 1.25, tarifa_apoyo_clp: 12400 },
    { cantidad: 1, horas_reales: 8.5, multiplicador: 3, tarifa_clp: 33300, hh_referencia: 25 },   // landing page con IA
  ];
  const cab = { lineas, urgencia: true, materiales_clp: 100000, margen_materiales: 0.25, operacion: [{ descripcion: 'Traslado', monto: 41350 }], gestion_pct: 0.1 };
  const t = calcularTotales(cab, IND, P);
  assert.equal(t.lineas[1].diferenciaReferencia, 849150 - 832500);
  assert.equal(t.subtotalLineas, 1180150);
  assert.equal(t.manoObra, 1770225);                            // × 1,5 por urgencia
  assert.equal(t.recargoUrgencia, 590075);
  assert.equal(t.materialesVenta, 133333);                      // 100.000 ÷ (1 − 25 %), como el cotizador
  assert.equal(Math.round(t.utilidadMateriales! * 100), 25);
  assert.equal(t.operacion, 41350);
  assert.equal(t.gestion, 190356);                              // 10 % de (mano de obra + materiales)
  assert.equal(t.neto, 2135000);                                // 2.135.264 → 2.135.000
  assert.equal(t.netoUF, 51.63);
  assert.equal(t.iva, 405650);
  assert.equal(t.total, 2540650);
  assert.equal(t.horasReales, 28.5);                            // 10 + 10 de apoyo + 8,5
  assert.equal(t.valorHoraReal, 62113);
  const simple = calcularTotales({ ...cab, urgencia: false, gestion_pct: 0 }, IND, P);
  assert.deepEqual([simple.manoObra, simple.gestion, simple.neto], [1180150, 0, 1355000]);
  // Con el precio de los materiales fijo, si salen más caros la utilidad real baja.
  const fijo = calcularTotales({ ...cab, materiales_clp: 110000, materiales_venta_clp: 125000 }, IND, P);
  assert.deepEqual([fijo.materialesVenta, fijo.utilidadMateriales], [125000, 0.12]);
  assert.equal(precioConUtilidad(60000, 0.3), 85714);
  assert.equal(utilidadDe(100000, 125000), 0.2);
  assert.equal(calcularTotales({ lineas: [], urgencia: false, materiales_clp: 0, margen_materiales: 0.25, operacion: [], gestion_pct: 0 }, IND, P).valorHoraReal, null);
  assert.equal(costoHoraCLP(1200000, P), 11571);                // 1.200.000 × 1,35 ÷ 140
});

test('Lo que ve el cliente: entregables con su precio (con urgencia), materiales, operación y gestión que suman exacto el neto', () => {
  const lineas = [
    { cantidad: 8, horas_reales: 1.25, multiplicador: 1, tarifa_clp: 20700, horas_apoyo: 1.25, tarifa_apoyo_clp: 12400 },
    { cantidad: 1, horas_reales: 8.5, multiplicador: 3, tarifa_clp: 33300 },
  ];
  const operacion = [{ descripcion: 'Traslado', monto: 41350 }, { descripcion: 'Peajes', monto: 6000 }];
  const t = calcularTotales({ lineas, urgencia: true, materiales_clp: 100000, margen_materiales: 0.25, operacion, gestion_pct: 0.1 }, IND, P);
  const e = entregablesCliente([{ descripcion: 'Puntos de red', cantidad: 8, unidad: 'punto' }, { descripcion: 'Landing page', cantidad: 1 }], t, IND, operacion);
  assert.deepEqual(e.map(x => x.descripcion), ['Puntos de red', 'Landing page', 'Materiales', 'Traslado', 'Peajes', 'Gestión de proyecto y coordinación']);
  assert.deepEqual(e.map(x => x.clp), [496500, 1273461, 133333, 41350, 6000, 190356]);   // los −$264 del redondeo, al más grande
  assert.equal(e.reduce((s, x) => s + x.clp, 0), t.neto);
  assert.equal(Math.round(e.reduce((s, x) => s + x.uf, 0) * 100), Math.round(t.netoUF * 100));
  assert.deepEqual(repartirResiduo([10, 20, 30], 61), [10, 20, 31]);
  assert.deepEqual(repartirResiduo([100, 300], 0), [0, 0]);              // nunca bajo 0
});

test('Del anteproyecto al cotizador: cada trabajo con su costo real y su precio exacto; materiales, operación y gestión', () => {
  const sueldo: Record<string, number> = { sec: 1200000, ay: 650000 };
  const base = {
    nombre: 'Tablero local', fecha: '2026-11-23', urgencia: false, parametros: P, materiales_costo: 100000, materiales_venta: 133333,
    operacion: [{ descripcion: 'Traslado', monto: 25000 }, { descripcion: 'Vacío', monto: 0 }], gestion_pct: 0.1, gestion_monto: 43893,
    lineas: [{ descripcion: 'Cambio de tablero', unidad: 'tablero', cantidad: 1, horas_reales: 8, horas_apoyo: 6, cargo_id: 'sec', cargo_apoyo_id: 'ay', subtotal: 305600 }],
  };
  const c = cotizacionDesdeCalculo(base, id => sueldo[id] ?? null);
  assert.equal(c.titulo, 'Tablero local');
  assert.match(c.descripcion_general, /anteproyecto «Tablero local» \(Calculadora HH, 23-11-2026\)/);
  assert.deepEqual(c.partidas.map(x => [x.nombre, x.tipo]), [['Tablero local', 'instalacion'], ['Cargos operacionales', 'cargo']]);
  const [obra, mat, traslado, gestion] = c.items;
  // Costo real: 8 h × $11.571 + 6 h de ayudante × $6.268 = $130.176; el cotizador da el mismo precio del cálculo.
  assert.deepEqual([obra.categoria, obra.costo, calcularLineaCot(obra, 'CLP').precio], ['mano_obra', 130176, 305600]);
  assert.equal(Math.round(calcularLineaCot(obra, 'CLP').margenReal!), 57);
  assert.deepEqual([mat.categoria, mat.costo, calcularLineaCot(mat, 'CLP').precio], ['material', 100000, 133333]);
  assert.deepEqual([traslado.categoria, traslado.costo, traslado.ganancia, calcularLineaCot(traslado, 'CLP').precio], ['operacion', 25000, 0, 25000]);
  assert.deepEqual([gestion.descripcion, gestion.cargo], ['Gestión de proyecto y coordinación', { pct: 10, base: 'total' }]);
  assert.equal(c.items.length, 4);                                // el gasto en $0 no entra
  assert.ok(c.items.every(l => l.partidaId === (l.categoria === 'operacion' ? c.partidas[1].id : c.partidas[0].id)));
  // Con urgencia el precio sube; sin sueldo de mercado, entra a precio fijo (costo = precio).
  const urgente = cotizacionDesdeCalculo({ ...base, urgencia: true, operacion: [], gestion_pct: 0 }, () => null);
  assert.equal(urgente.partidas.length, 1);
  assert.deepEqual([urgente.items[0].costo, calcularLineaCot(urgente.items[0], 'CLP').precio], [458400, 458400]);
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
  const cab = { urgencia: false, materiales_clp: 0, margen_materiales: 0.25, operacion: [], gestion_pct: 0 };
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

// ─── Agregar un trabajo (components/hh/catalogo.ts) ─────────────────────────
const CAT: CatalogoHH = {
  parametros: { ...P, updated_at: null },
  cargos: [
    cargo({ id: 'ay', nombre: 'Ayudante eléctrico', tarifa_base: 0.3 }),
    cargo({ id: 'red', nombre: 'Técnico redes', tarifa_base: 0.5 }),
    SEC, FULL,
  ],
  tipos: [
    { clave: 'terreno', nombre: 'Ejecución en terreno', multiplicador: 1, descripcion: null, activo: true, orden: 1 },
    { clave: 'interfaz', nombre: 'Interfaces', multiplicador: 3, descripcion: null, activo: true, orden: 2 },
  ],
  trabajos: [
    { id: 'punto', categoria: 'Redes', nombre: 'Punto de red Cat6', unidad: 'punto', hh_referencia: 1.25, cargo_principal_id: 'red', cargo_apoyo_id: 'ay', hh_apoyo: 1.25, tipo_tarea_clave: 'terreno', precio_mercado_ref: null, duracion_equipo: null, notas: null, activo: true, orden: 1 },
    { id: 'landing', categoria: 'Software', nombre: 'Landing page', unidad: 'proyecto', hh_referencia: 25, cargo_principal_id: 'full', cargo_apoyo_id: null, hh_apoyo: 0, tipo_tarea_clave: 'interfaz', precio_mercado_ref: null, duracion_equipo: null, notas: null, activo: true, orden: 2 },
    { id: 'tablero', categoria: 'Electricidad', nombre: 'Cambio de tablero', unidad: 'tablero', hh_referencia: 8, cargo_principal_id: 'sec', cargo_apoyo_id: 'ay', hh_apoyo: 6, tipo_tarea_clave: 'terreno', precio_mercado_ref: null, duracion_equipo: null, notas: null, activo: true, orden: 3 },
  ],
  personas: [
    { id: 'pedro', nombre: 'Pedro Soto', profile_id: null, jefe_id: 'joaquin', activo: true },
    { id: 'joaquin', nombre: 'Joaquín', profile_id: 'u-joaquin', jefe_id: 'cesar', activo: true },
    { id: 'cesar', nombre: 'César', profile_id: 'u-cesar', jefe_id: null, activo: true },
  ],
  personaCargos: [
    { id: 'a1', persona_id: 'cesar', cargo_id: 'full', tarifa_base_propia: 40, predeterminado: true, activo: true },
    { id: 'a2', persona_id: 'joaquin', cargo_id: 'sec', tarifa_base_propia: null, predeterminado: true, activo: true },
    { id: 'a3', persona_id: 'pedro', cargo_id: 'ay', tarifa_base_propia: 0.25, predeterminado: true, activo: true },
  ],
};

test('Un trabajo tipo trae las horas de mercado ya listas: en terreno las mismas; con IA (× 3) un tercio y se cobran las de mercado', () => {
  const ay = ayudasCatalogo(CAT, 'u-joaquin');
  const punto = conTrabajo(lineaVacia(), 'punto', ay);
  assert.deepEqual([punto.horas_reales, punto.multiplicador, punto.cargo_id, punto.persona_id, punto.cargo_apoyo_id, punto.horas_apoyo], [1.25, 1, 'red', null, 'ay', 1.25]);
  assert.equal(punto.descripcion, 'Punto de red Cat6');
  const landing = conTrabajo(lineaVacia(), 'landing', ay);
  assert.deepEqual([landing.horas_reales, landing.multiplicador], [8.333333, 3]);
  assert.equal(totalesDe([landing], { urgencia: false, materiales_clp: 0, margen_materiales: 0.25, operacion: [], gestion_pct: 0 }, IND, P).lineas[0].horasCobradas, 25);   // se cobran las 25 de mercado, exactas
  // El tablero lo hace quien tiene el cargo (Joaquín, el usuario conectado, primero).
  const tablero = conTrabajo(lineaVacia(), 'tablero', ay);
  assert.deepEqual([tablero.persona_id, tablero.cargo_id, tablero.horas_reales, tablero.horas_apoyo], ['joaquin', 'sec', 8, 6]);
});

test('El equipo va en orden de jerarquía y cada persona entra con su cargo y su tarifa propia', () => {
  const ay = ayudasCatalogo(CAT, 'u-cesar');
  assert.deepEqual(ay.arbol.map(x => [x.p.nombre, x.nivel]), [['César', 0], ['Joaquín', 1], ['Pedro Soto', 2]]);
  assert.equal(ay.miPersona?.id, 'cesar');
  const conPedro = conPersona(lineaVacia(), 'pedro', ay);
  assert.deepEqual([conPedro.cargo_id, conPedro.cargo_tarifa_base], ['ay', 0.25]);
  const conCesar = conPersona(lineaVacia(), 'cesar', ay);
  assert.deepEqual([conCesar.cargo_id, conCesar.cargo_tarifa_base, conCesar.cargo_moneda], ['full', 40, 'USD']);
  // Sin hh.configurar la base solo manda su persona y su equipo: Joaquín queda arriba.
  const soloJoaquin = ayudasCatalogo({ ...CAT, personas: CAT.personas.filter(p => p.id !== 'cesar') }, 'u-joaquin');
  assert.deepEqual(soloJoaquin.arbol.map(x => [x.p.nombre, x.nivel]), [['Joaquín', 0], ['Pedro Soto', 1]]);
  assert.equal(iniciales('Pedro Soto'), 'PS');
  assert.equal(iniciales('  joaquín '), 'J');
});
