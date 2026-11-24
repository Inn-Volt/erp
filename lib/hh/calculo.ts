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
 *   Materiales (venta)    = costo ÷ (1 − utilidad): la misma utilidad que el cotizador (sobre lo que
 *                           paga el cliente). Si se fija el precio de venta, la utilidad real sale de
 *                           él: si el material sale más caro, la utilidad baja y se ve.
 *   Gestión de proyecto   = % sobre la mano de obra y los materiales (no sobre la operación)
 *   Neto                  = redondear(mano de obra (× urgencia) + materiales + operación + gestión,
 *                                     redondeo_total)
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
  gestion_proyecto: number;       // gestión de proyecto y coordinación por omisión (0,10 = 10 %)
}

export const PARAMETROS_INICIALES: ParametrosHH = {
  horas_facturables_mes: 140, factor_costo_empresa: 1.35, gastos_generales: 0.25, utilidad_minima: 0.3,
  recargo_urgencia: 0.5, iva: 0.19, uf_respaldo: 41350.42, usd_respaldo: 1000, redondeo_tarifa: 100,
  redondeo_total: 1000, validez_dias: 15, gestion_proyecto: 0.1,
};

/** La utilidad de los materiales si no se puede leer la del cotizador (la de siempre: 25 %). */
export const UTILIDAD_MATERIALES_POR_OMISION = 0.25;

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

/** Un gasto de operación (traslado, peajes, estacionamiento…): se cobra tal cual. */
export interface GastoOperacion { descripcion: string; monto: number }

export interface EntradaTotales {
  lineas: LineaCalculo[];
  urgencia: boolean;
  /** Costo neto de los materiales. */
  materiales_clp: number;
  /** Utilidad de los materiales (fracción, sobre el precio): 0,25 = 25 %. */
  margen_materiales: number;
  /** Precio de venta fijado a mano (vacío = sale del costo y la utilidad). */
  materiales_venta_clp?: number | null;
  operacion: GastoOperacion[];
  /** Gestión de proyecto (fracción); 0 = no se suma. */
  gestion_pct: number;
}

export interface Totales {
  lineas: ResultadoLinea[];
  subtotalLineas: number;
  recargoUrgencia: number;
  manoObra: number;
  materialesVenta: number;
  /** Lo que de verdad queda de los materiales, sobre su precio (null = sin materiales). */
  utilidadMateriales: number | null;
  operacion: number;
  gestion: number;
  neto: number;
  netoUF: number;
  iva: number;
  total: number;
  /** Todas las horas trabajadas (principal + apoyo). */
  horasReales: number;
  /** Mano de obra ÷ horas trabajadas: cuánto rinde de verdad cada hora (null = sin horas). */
  valorHoraReal: number | null;
}

/** Precio de venta con una utilidad sobre el precio (como el cotizador): 100.000 con 25 % → 133.333. */
export const precioConUtilidad = (costo: number, utilidad: number) =>
  Math.round(Math.max(0, n(costo)) / (1 - Math.min(Math.max(n(utilidad), 0), 0.95)));
/** La utilidad que deja un precio (fracción, sobre el precio). */
export const utilidadDe = (costo: number, venta: number) => (n(venta) > 0 ? (n(venta) - n(costo)) / n(venta) : 0);

export function calcularTotales(e: EntradaTotales, ind: Indicadores, p: ParametrosHH): Totales {
  const lineas = e.lineas.map(calcularLinea);
  const subtotalLineas = lineas.reduce((t, l) => t + l.subtotal, 0);
  const manoObra = Math.round(subtotalLineas * (e.urgencia ? 1 + n(p.recargo_urgencia) : 1));
  const costoMat = Math.max(0, n(e.materiales_clp));
  const ventaFija = e.materiales_venta_clp !== null && e.materiales_venta_clp !== undefined && n(e.materiales_venta_clp) > 0;
  const materialesVenta = ventaFija ? Math.round(n(e.materiales_venta_clp)) : precioConUtilidad(costoMat, e.margen_materiales);
  const operacion = Math.round(e.operacion.reduce((t, g) => t + Math.max(0, n(g.monto)), 0));
  const gestion = Math.round((manoObra + materialesVenta) * Math.max(0, n(e.gestion_pct)));
  const neto = redondear(manoObra + materialesVenta + operacion + gestion, p.redondeo_total);
  const iva = Math.round(neto * n(p.iva));
  const horasReales = dec2(lineas.reduce((t, l) => t + l.horasReales + l.horasApoyo, 0));
  return {
    lineas, subtotalLineas, recargoUrgencia: manoObra - subtotalLineas, manoObra, materialesVenta,
    utilidadMateriales: materialesVenta > 0 || costoMat > 0 ? utilidadDe(costoMat, materialesVenta) : null,
    operacion, gestion, neto, netoUF: enUF(neto, ind.uf), iva, total: neto + iva, horasReales,
    valorHoraReal: horasReales > 0 ? Math.round(manoObra / horasReales) : null,
  };
}

/** Lo que cuesta de verdad una hora del cargo (sueldo de mercado × costo empresa ÷ horas facturables). */
export function costoHoraCLP(sueldoMercado: number | null | undefined, p: Pick<ParametrosHH, 'factor_costo_empresa' | 'horas_facturables_mes'>): number | null {
  const s_ = n(sueldoMercado);
  return s_ > 0 && n(p.horas_facturables_mes) > 0 ? Math.round(s_ * n(p.factor_costo_empresa) / n(p.horas_facturables_mes)) : null;
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
 * urgencia), más los materiales, cada gasto de operación y la gestión de proyecto. Sin horas,
 * multiplicadores ni personas. Los precios suman exacto el neto (en pesos y en UF).
 */
export function entregablesCliente(
  lineas: { descripcion: string; cantidad: number; unidad?: string | null }[], t: Totales, ind: Indicadores, operacion: GastoOperacion[] = [],
): Entregable[] {
  const factor = t.subtotalLineas > 0 ? t.manoObra / t.subtotalLineas : 0;
  const items: { descripcion: string; cantidad: number; unidad: string | null; clp: number }[] = lineas.map((l, i) => ({
    descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad || null, clp: (t.lineas[i]?.subtotal || 0) * factor,
  }));
  if (t.materialesVenta > 0) items.push({ descripcion: 'Materiales', cantidad: 1, unidad: 'gl', clp: t.materialesVenta });
  for (const g of operacion) if (n(g.monto) > 0) items.push({ descripcion: g.descripcion.trim() || 'Gasto operacional', cantidad: 1, unidad: 'gl', clp: Math.round(n(g.monto)) });
  if (t.gestion > 0) items.push({ descripcion: 'Gestión de proyecto y coordinación', cantidad: 1, unidad: 'gl', clp: t.gestion });
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
