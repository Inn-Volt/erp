/**
 * Calculadora HH (fase 23): el valor de la hora-hombre por cargo con la base en UF (o en USD para
 * los cargos de software), para que las tarifas no se desvaloricen.
 * Cálculo puro (sin React ni Supabase), con pruebas en tests/unit/hh.test.ts. Todo va en valores
 * netos (sin IVA): el IVA se suma solo al final.
 *
 *   Tarifa de hoy (CLP/h) = redondear(tarifa efectiva × UF o USD, redondeo_tarifa)
 *                           tarifa efectiva = la propia de la persona ?? la del cargo
 *   Piso (CLP/h)          = redondear(sueldo × factor costo empresa ÷ horas facturables
 *                                     × (1 + gastos generales) × (1 + utilidad mínima), redondeo_tarifa)
 *   Línea                 = horas cobradas × tarifa + cantidad × horas de apoyo × tarifa del apoyo
 *                           horas cobradas = cantidad × horas reales × multiplicador (el apoyo no
 *                           lleva multiplicador: es terreno)
 *   Neto                  = redondear(mano de obra (× urgencia) + materiales × (1 + margen)
 *                                     + traslado en UF × UF, redondeo_total)
 */

export type MonedaHH = 'UF' | 'USD';

export interface ParametrosHH {
  horas_facturables_mes: number;
  factor_costo_empresa: number;   // leyes sociales, seguros, EPP
  gastos_generales: number;       // vehículo, bencina, herramientas, software (0,25 = 25 %)
  utilidad_minima: number;
  recargo_urgencia: number;       // urgencia o fin de semana
  iva: number;
  uf_respaldo: number;
  usd_respaldo: number;
  redondeo_tarifa: number;
  redondeo_total: number;
  validez_dias: number;           // validez de la cotización para el cliente
}

export const PARAMETROS_INICIALES: ParametrosHH = {
  horas_facturables_mes: 140, factor_costo_empresa: 1.35, gastos_generales: 0.25, utilidad_minima: 0.3,
  recargo_urgencia: 0.5, iva: 0.19, uf_respaldo: 41350.42, usd_respaldo: 1000, redondeo_tarifa: 100,
  redondeo_total: 1000, validez_dias: 15,
};

export interface Indicadores { uf: number; usd: number }

export interface CargoHH {
  id: string;
  nombre: string;
  moneda_base: MonedaHH;
  tarifa_base: number;
  mercado_min: number | null;
  mercado_max: number | null;
  sueldo_mercado_clp: number | null;
  notas: string | null;
  activo: boolean;
  orden: number;
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Al múltiplo más cercano de `paso` (con 100, $28.945 queda en $28.900). */
export function redondear(v: number, paso = 1): number {
  const p = n(paso) > 0 ? n(paso) : 1;
  // El paso intermedio evita que un 289,4999999 (error de coma flotante) baje en vez de subir.
  return Math.round(Math.round((n(v) / p) * 1e6) / 1e6) * p;
}

/** Con 2 decimales (horas, UF). */
export const dec2 = (v: number) => Math.round(n(v) * 100) / 100;

/** La tarifa de la persona para ese cargo; si no tiene una propia, la del cargo. */
export const tarifaEfectiva = (cargo: Pick<CargoHH, 'tarifa_base'>, propia?: number | null) =>
  (propia !== null && propia !== undefined && n(propia) > 0 ? n(propia) : n(cargo.tarifa_base));

const valorMoneda = (moneda: MonedaHH, ind: Indicadores) => (moneda === 'USD' ? n(ind.usd) : n(ind.uf));

/** Tarifa de hoy en pesos por hora. */
export function tarifaHoyCLP(tarifaBase: number, moneda: MonedaHH, ind: Indicadores, p: Pick<ParametrosHH, 'redondeo_tarifa'>): number {
  return redondear(n(tarifaBase) * valorMoneda(moneda, ind), p.redondeo_tarifa);
}

/** Pesos a UF, con 2 decimales. */
export const enUF = (clp: number, uf: number) => (n(uf) > 0 ? dec2(n(clp) / n(uf)) : 0);

/** Lo mínimo que hay que cobrar la hora para cubrir el sueldo de mercado, los costos y la utilidad. */
export function pisoCLP(sueldoMercado: number | null | undefined, p: ParametrosHH): number | null {
  const s = n(sueldoMercado);
  if (s <= 0 || n(p.horas_facturables_mes) <= 0) return null;
  return redondear(s * n(p.factor_costo_empresa) / n(p.horas_facturables_mes) * (1 + n(p.gastos_generales)) * (1 + n(p.utilidad_minima)), p.redondeo_tarifa);
}

type PosicionMercado = 'bajo' | 'dentro' | 'sobre' | null;

/** ¿La tarifa base está dentro del rango de mercado del cargo? (null = el cargo no tiene rango). */
export function posicionMercado(tarifaBase: number, min: number | null, max: number | null): PosicionMercado {
  const hayMin = min !== null && min !== undefined, hayMax = max !== null && max !== undefined;
  if (!hayMin && !hayMax) return null;
  if (hayMin && n(tarifaBase) < n(min)) return 'bajo';
  if (hayMax && n(tarifaBase) > n(max)) return 'sobre';
  return 'dentro';
}

export interface EstadoTarifa {
  tarifaBase: number;
  moneda: MonedaHH;
  clp: number;
  uf: number;
  piso: number | null;
  bajoPiso: boolean;
  mercado: PosicionMercado;
}

/** La tarifa de hoy de un cargo (o de una persona en ese cargo) con sus alertas. */
export function estadoTarifa(cargo: CargoHH, ind: Indicadores, p: ParametrosHH, propia?: number | null): EstadoTarifa {
  const tarifaBase = tarifaEfectiva(cargo, propia);
  const clp = tarifaHoyCLP(tarifaBase, cargo.moneda_base, ind, p);
  const piso = pisoCLP(cargo.sueldo_mercado_clp, p);
  return {
    tarifaBase, moneda: cargo.moneda_base, clp, uf: enUF(clp, ind.uf), piso,
    bajoPiso: piso !== null && clp < piso,
    mercado: posicionMercado(tarifaBase, cargo.mercado_min, cargo.mercado_max),
  };
}

// ─── Líneas y totales ────────────────────────────────────────────────────────

export interface LineaCalculo {
  cantidad: number;
  /** Por unidad. Obligatorias: sin horas la línea no suma. */
  horas_reales: number | null;
  multiplicador: number;
  /** Tarifa del cargo principal (CLP/h). */
  tarifa_clp: number;
  /** Por unidad, sin multiplicador. */
  horas_apoyo?: number | null;
  tarifa_apoyo_clp?: number | null;
  /** HH de referencia de mercado del trabajo tipo (por unidad). */
  hh_referencia?: number | null;
}

export interface ResultadoLinea {
  horasCobradas: number;
  /** Horas que de verdad se trabajan: las del cargo principal y las del apoyo. */
  horasReales: number;
  horasApoyo: number;
  principal: number;
  apoyo: number;
  subtotal: number;
  /** Lo que costaría a precio de mercado (HH de referencia × tarifa), si viene de un trabajo tipo. */
  referencia: number | null;
  /** Lo que se cobra por el cargo principal menos la referencia (positivo = sobre el mercado). */
  diferenciaReferencia: number | null;
}

export function calcularLinea(l: LineaCalculo): ResultadoLinea {
  const cant = Math.max(0, n(l.cantidad));
  const horas = Math.max(0, n(l.horas_reales));
  const mult = Math.max(0, n(l.multiplicador));
  const tarifa = Math.max(0, n(l.tarifa_clp));
  const horasCobradas = cant * horas * mult;
  const horasApoyo = l.tarifa_apoyo_clp ? cant * Math.max(0, n(l.horas_apoyo)) : 0;
  const principal = horasCobradas * tarifa;
  const apoyo = horasApoyo * Math.max(0, n(l.tarifa_apoyo_clp));
  const ref = n(l.hh_referencia);
  const referencia = ref > 0 ? Math.round(cant * ref * tarifa) : null;
  return {
    horasCobradas: dec2(horasCobradas), horasReales: dec2(cant * horas), horasApoyo: dec2(horasApoyo),
    principal: Math.round(principal), apoyo: Math.round(apoyo), subtotal: Math.round(principal + apoyo),
    referencia, diferenciaReferencia: referencia === null ? null : Math.round(principal) - referencia,
  };
}

export interface EntradaTotales {
  lineas: LineaCalculo[];
  urgencia: boolean;
  materiales_clp: number;
  margen_materiales: number;
  traslado_uf: number;
}

export interface Totales {
  lineas: ResultadoLinea[];
  subtotalLineas: number;
  recargoUrgencia: number;
  manoObra: number;
  materialesVenta: number;
  trasladoCLP: number;
  neto: number;
  netoUF: number;
  iva: number;
  total: number;
  /** Todas las horas trabajadas (principal + apoyo). */
  horasReales: number;
  /** Mano de obra ÷ horas trabajadas: cuánto rinde de verdad cada hora (null = sin horas). */
  valorHoraReal: number | null;
}

export function calcularTotales(e: EntradaTotales, ind: Indicadores, p: ParametrosHH): Totales {
  const lineas = e.lineas.map(calcularLinea);
  const subtotalLineas = lineas.reduce((t, l) => t + l.subtotal, 0);
  const manoObra = Math.round(subtotalLineas * (e.urgencia ? 1 + n(p.recargo_urgencia) : 1));
  const materialesVenta = Math.round(Math.max(0, n(e.materiales_clp)) * (1 + Math.max(0, n(e.margen_materiales))));
  const trasladoCLP = Math.round(Math.max(0, n(e.traslado_uf)) * n(ind.uf));
  const neto = redondear(manoObra + materialesVenta + trasladoCLP, p.redondeo_total);
  const iva = Math.round(neto * n(p.iva));
  const horasReales = dec2(lineas.reduce((t, l) => t + l.horasReales + l.horasApoyo, 0));
  return {
    lineas, subtotalLineas, recargoUrgencia: manoObra - subtotalLineas, manoObra, materialesVenta, trasladoCLP,
    neto, netoUF: enUF(neto, ind.uf), iva, total: neto + iva, horasReales,
    valorHoraReal: horasReales > 0 ? Math.round(manoObra / horasReales) : null,
  };
}

// ─── Lo que ve el cliente ────────────────────────────────────────────────────

/**
 * Reparte la diferencia entre la suma de `valores` (enteros) y `objetivo` empezando por el más
 * grande, sin dejar ninguno bajo 0: los precios redondeados suman exacto el total.
 */
export function repartirResiduo(valores: number[], objetivo: number): number[] {
  const r = valores.map(v => Math.round(n(v)));
  let dif = Math.round(n(objetivo)) - r.reduce((t, v) => t + v, 0);
  const orden = r.map((v, i) => i).sort((a, b) => r[b] - r[a]);
  for (const i of orden) {
    if (dif === 0) break;
    const ajuste = dif > 0 ? dif : Math.max(dif, -r[i]);
    r[i] += ajuste;
    dif -= ajuste;
  }
  return r;
}

export interface Entregable { descripcion: string; cantidad: number; unidad: string | null; clp: number; uf: number }

/**
 * Las líneas como entregables para el cliente: cada una con su precio (ya con el recargo de
 * urgencia), más los materiales y el traslado si los hay. Sin horas, multiplicadores ni personas.
 * Los precios suman exacto el neto (en pesos y en UF).
 */
export function entregablesCliente(
  lineas: { descripcion: string; cantidad: number; unidad?: string | null }[], t: Totales, ind: Indicadores,
): Entregable[] {
  const factor = t.subtotalLineas > 0 ? t.manoObra / t.subtotalLineas : 0;
  const items: { descripcion: string; cantidad: number; unidad: string | null; clp: number }[] = lineas.map((l, i) => ({
    descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad || null, clp: (t.lineas[i]?.subtotal || 0) * factor,
  }));
  if (t.materialesVenta > 0) items.push({ descripcion: 'Materiales', cantidad: 1, unidad: 'gl', clp: t.materialesVenta });
  if (t.trasladoCLP > 0) items.push({ descripcion: 'Traslado', cantidad: 1, unidad: 'gl', clp: t.trasladoCLP });
  const clp = repartirResiduo(items.map(x => x.clp), t.neto);
  const centavosUF = repartirResiduo(clp.map(v => (n(ind.uf) > 0 ? (v / n(ind.uf)) * 100 : 0)), Math.round(t.netoUF * 100));
  return items.map((x, i) => ({ ...x, clp: clp[i], uf: centavosUF[i] / 100 }));
}

// ─── Formato es-CL ───────────────────────────────────────────────────────────

const fmt = (v: number, dec: number) =>
  new Intl.NumberFormat('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n(v));

/** 12.345 → «12,35 UF». */
export const formatoUF = (v: number) => `${fmt(v, 2)} UF`;
/** 35 → «US$35,00». */
const formatoUSD = (v: number) => `US$${fmt(v, 2)}`;
/** Una tarifa base en su moneda: «0,70 UF» o «US$35,00». */
export const formatoMonedaHH = (v: number, moneda: MonedaHH) => (moneda === 'USD' ? formatoUSD(v) : formatoUF(v));
/** Un valor del día (UF o dólar) en pesos con decimales: «$41.350,42». */
export const formatoIndicador = (v: number) => `$${fmt(v, 2)}`;
/** Horas con hasta 2 decimales: 8,33. */
export const formatoHoras = (v: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n(v));
