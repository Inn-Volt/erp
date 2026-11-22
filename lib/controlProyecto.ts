/**
 * Control de proyecto (fase 20): presupuesto vs real por partida y por tipo de costo, y el flujo de
 * caja semanal (plan vs real) de un trabajo. Solo cuentas, sin React ni Supabase: las pantallas
 * leen los datos y llaman a estas funciones. Pruebas: tests/unit/controlProyecto.test.ts.
 *
 * Reglas (las mismas de la base y del cotizador):
 *  · Venta y costo cotizado de cada partida: con calcular() del cotizador (descuentos de línea y de
 *    partida, IVA de cada línea, UF), igual que se guardan subtotal y costo_directo. Las líneas
 *    sueltas (sin partida) van a la fila «Sin partida».
 *  · Costo real = gastos rendidos (no los rechazados) + compras con costo_compra() (con factura el
 *    neto, el IVA se recupera; con boleta el total; la nota de crédito resta) + mano de obra (lo que
 *    calculó la base al registrarla) + horas de antes (horas_trabajo). Es lo mismo que suman
 *    cotizacion_resultado y costoReal().
 *  · Tipo de costo: la compra trae el suyo (vacío = material); un gasto de «materiales» es material
 *    y los demás gastos son operación; la mano de obra y las horas son mano de obra.
 *  · Tres capas por partida: lo que se COBRÓ (venta), lo PRESUPUESTADO (el anteproyecto de la fase
 *    21; sin él, el costo que traía la cotización) y lo REAL. Una compra o un gasto con detalle
 *    (documento_lineas) se reparte entre sus líneas: cada una a su partida, su tipo y su línea del
 *    presupuesto (o «no cotizada»), en proporción a sus montos.
 *  · Estado de una partida: SOBRE PRESUPUESTO si lo real pasa lo presupuestado; ALERTA desde el 90 %
 *    (UMBRAL_ALERTA); SIN PRESUPUESTO si hay gasto donde no se presupuestó nada; si no, OK.
 *  · Flujo: semanas desde el inicio; la semana 1 recibe todo lo anterior y «Posterior» lo que cae
 *    después de la última. Los cobros del plan se reparten como _cot_generar_cobros (redondeo por
 *    acumulado: la suma da exacta el total).
 */

import { calcular } from '@/lib/cotizador/calculo';
import type { HitoCobro, Linea, Moneda, PartidaCot } from '@/lib/cotizador/tipos';
import type { CategoriaItem } from '@/types';

// ── Tipos de costo y estados ────────────────────────────────────────────────
export type TipoCosto = CategoriaItem;
export const TIPOS_COSTO: { clave: TipoCosto; nombre: string }[] = [
  { clave: 'material', nombre: 'Material' },
  { clave: 'mano_obra', nombre: 'Mano de obra' },
  { clave: 'servicio', nombre: 'Servicio' },
  { clave: 'operacion', nombre: 'Operación' },
];
const CLAVES_TIPO = TIPOS_COSTO.map(t => t.clave);
export const nombreTipo = (t: string) => TIPOS_COSTO.find(x => x.clave === t)?.nombre || 'Material';
const tipoValido = (t: unknown): TipoCosto => (CLAVES_TIPO.includes(t as TipoCosto) ? (t as TipoCosto) : 'material');

/** Desde qué parte de lo cotizado una partida queda en ALERTA (90 %). Un solo lugar. */
export const UMBRAL_ALERTA = 0.9;

export type EstadoControl = 'ok' | 'alerta' | 'sobre' | 'sin_presupuesto';
export const NOMBRE_ESTADO: Record<EstadoControl, string> = {
  ok: 'OK', alerta: 'ALERTA', sobre: 'SOBRE PRESUPUESTO', sin_presupuesto: 'SIN PRESUPUESTO',
};

export function estadoControl(presupuesto: number, real: number): EstadoControl {
  if (presupuesto <= 0) return real > 0 ? 'sin_presupuesto' : 'ok';
  if (real > presupuesto) return 'sobre';
  if (real >= presupuesto * UMBRAL_ALERTA) return 'alerta';
  return 'ok';
}

// ── Partidas de una cotización (para elegir al registrar) ───────────────────
/** Clave de la fila «Sin partida» (lo que no dice partida o dice una que ya no está). */
export const SIN_PARTIDA = '';

export interface PartidaOpcion { id: string; numero: number; nombre: string }

export function opcionesDePartida(partidas: Pick<PartidaCot, 'id' | 'nombre'>[] | null | undefined): PartidaOpcion[] {
  return (partidas || []).filter(p => p && p.id).map((p, i) => ({ id: p.id, numero: i + 1, nombre: (p.nombre || '').trim() || `Partida ${i + 1}` }));
}

/** ¿Se puede guardar esa partida? Vacía siempre; si no, tiene que estar en la cotización elegida. */
export const partidaValida = (id: string | null | undefined, opciones: PartidaOpcion[]) => !id || opciones.some(p => p.id === id);

export const etiquetaPartida = (p: { numero: number | null; nombre: string } | null | undefined) =>
  !p || p.numero === null ? 'Sin partida' : `${p.numero}. ${p.nombre}`;

// ── Movimientos reales ──────────────────────────────────────────────────────
export interface GastoCP {
  id: string; fecha: string; monto: number; categoria: string; descripcion?: string | null; estado: string;
  partida_id?: string | null; usuario_id?: string | null;
}
export interface CompraCP {
  id: string; fecha: string; tipo_doc: string; folio?: string | null; proveedor_nombre: string; proveedor_rut?: string | null;
  neto: number; exento: number; iva?: number; total: number; pagada: boolean; fecha_pago?: string | null;
  partida_id?: string | null; tipo_costo?: string | null; descripcion?: string | null;
}
/** Horas registradas antes de la fase 20 (horas_trabajo): ya no se registran, pero cuentan. */
export interface HoraCP {
  id: string; fecha: string; horas: number; costo_hora: number; usuario_id: string; nota?: string | null;
}
export interface ManoObraCP {
  id: string; fecha: string; tipo: 'interno' | 'externo'; nombre: string; horas: number | null; monto_liquido: number | null;
  honorarios: boolean; costo: number; pagado: boolean; fecha_pago: string | null; documento?: string | null; nota?: string | null;
  partida_id?: string | null; trabajador_id?: string | null;
}
/** Una línea del detalle de una compra o de un gasto (fase 21). */
export interface DocumentoLineaCP {
  id: string; compra_id: string | null; gasto_id: string | null; partida_id: string | null; presupuesto_linea_id: string | null;
  tipo: string; descripcion: string; cantidad: number | null; unidad?: string | null; monto: number;
}
export interface CobroCP {
  monto: number; monto_pagado: number; fecha_pago: string | null; fecha_factura?: string | null; created_at?: string | null; hito?: string | null;
}

type OrigenMov = 'gasto' | 'compra' | 'mano_obra' | 'hora';
const NOMBRE_ORIGEN: Record<OrigenMov, string> = { gasto: 'Gasto', compra: 'Compra', mano_obra: 'Mano de obra', hora: 'Horas' };

export interface Movimiento {
  origen: OrigenMov;
  id: string;
  /** Fecha del documento (o del día trabajado). */
  fecha: string;
  /** Cuándo sale la plata: la compra pagada, en su fecha de pago. */
  fechaCaja: string;
  /** Gasto: su categoría; compra: tipo de documento y N°; mano de obra: horas o cómo se pagó. */
  documento: string;
  /** Compra: el proveedor; mano de obra: la persona. Gasto y horas de antes: el id de la persona (la pantalla pone el nombre). */
  quien: string;
  detalle: string;
  partidaId: string;
  tipo: TipoCosto;
  /** Lo que suma al costo real. */
  monto: number;
  /** Se puede deber (compras y pagos a externos); los demás ya salieron. */
  pagable: boolean;
  pagada: boolean;
  /** Fase 21: viene del detalle de un documento (una línea de la boleta o la factura). */
  detallado: boolean;
  /** La línea del presupuesto que compra (null = no cotizada o sin detalle). */
  presupuestoLineaId: string | null;
  cantidad: number | null;
  /** Mano de obra: la persona del equipo. */
  trabajadorId: string | null;
}

const n = (v: unknown) => Number(v) || 0;

/** Lo mismo que public.costo_compra: con factura el neto + exento; con boleta u otro, el total; la nota de crédito resta. */
export function costoCompra(c: Pick<CompraCP, 'tipo_doc' | 'neto' | 'exento' | 'total'>): number {
  const signo = c.tipo_doc === 'nota_credito' ? -1 : 1;
  const base = ['factura', 'factura_exenta', 'nota_credito'].includes(c.tipo_doc) ? n(c.neto) + n(c.exento) : n(c.total);
  return signo * base;
}

const tipoDeGasto = (categoria: string): TipoCosto => (categoria === 'materiales' ? 'material' : 'operacion');

const DOC_COMPRA: Record<string, string> = { factura: 'Factura', factura_exenta: 'Factura exenta', boleta: 'Boleta', nota_credito: 'Nota de crédito', otro: 'Documento' };
const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const sinDetalle = { detallado: false, presupuestoLineaId: null, cantidad: null, trabajadorId: null };

/** Reparte el costo de un documento entre sus líneas en proporción a sus montos: enteros, suma exacta. */
export function repartoDocumento(costo: number, montos: number[]): number[] {
  const total = Math.round(n(costo));
  const pesos = montos.map(m => Math.max(n(m), 0));
  const base = pesos.some(p => p > 0) ? pesos : pesos.map(() => 1);
  return repartirEntero(Math.abs(total), base).map(v => (total < 0 ? -v : v));
}

/** El movimiento de un documento, partido en sus líneas (si tiene detalle). */
function conDetalle(m: Movimiento, lineas: DocumentoLineaCP[] | undefined): Movimiento[] {
  if (!lineas?.length) return [m];
  const orden = [...lineas];
  const montos = repartoDocumento(m.monto, orden.map(l => l.monto));
  return orden.map((l, i) => ({
    ...m, id: `${m.id}#${l.id}`, detalle: l.descripcion, partidaId: l.partida_id || SIN_PARTIDA, tipo: tipoValido(l.tipo), monto: montos[i],
    detallado: true, presupuestoLineaId: l.presupuesto_linea_id || null, cantidad: l.cantidad === null || l.cantidad === undefined ? null : n(l.cantidad),
  }));
}

export function movimientos(d: { gastos?: GastoCP[]; compras?: CompraCP[]; manoObra?: ManoObraCP[]; horas?: HoraCP[]; lineas?: DocumentoLineaCP[] }): Movimiento[] {
  const out: Movimiento[] = [];
  const deCompra = new Map<string, DocumentoLineaCP[]>(), deGasto = new Map<string, DocumentoLineaCP[]>();
  for (const l of d.lineas || []) {
    const [mapa, id] = l.compra_id ? [deCompra, l.compra_id] : [deGasto, l.gasto_id || ''];
    mapa.set(id, [...(mapa.get(id) || []), l]);
  }
  for (const g of d.gastos || []) {
    if (g.estado === 'rechazado') continue;   // igual que cotizacion_resultado
    out.push(...conDetalle({
      origen: 'gasto', id: g.id, fecha: g.fecha, fechaCaja: g.fecha, documento: g.categoria, quien: g.usuario_id || '',
      detalle: g.descripcion || '', partidaId: g.partida_id || SIN_PARTIDA, tipo: tipoDeGasto(g.categoria), monto: n(g.monto), pagable: false, pagada: true,
      ...sinDetalle,
    }, deGasto.get(g.id)));
  }
  for (const c of d.compras || []) {
    out.push(...conDetalle({
      origen: 'compra', id: c.id, fecha: c.fecha, fechaCaja: c.pagada && c.fecha_pago ? c.fecha_pago : c.fecha,
      documento: `${DOC_COMPRA[c.tipo_doc] || 'Documento'}${c.folio ? ` ${c.folio}` : ''}`, quien: c.proveedor_nombre,
      detalle: c.descripcion || '', partidaId: c.partida_id || SIN_PARTIDA, tipo: tipoValido(c.tipo_costo), monto: costoCompra(c), pagable: true, pagada: !!c.pagada,
      ...sinDetalle,
    }, deCompra.get(c.id)));
  }
  for (const m of d.manoObra || []) {
    const externo = m.tipo === 'externo';
    out.push({
      origen: 'mano_obra', id: m.id, fecha: m.fecha, fechaCaja: externo && m.pagado && m.fecha_pago ? m.fecha_pago : m.fecha,
      documento: externo ? (m.honorarios ? `Boleta de honorarios${m.documento ? ` ${m.documento}` : ''}` : 'Pago líquido') : `${num(n(m.horas))} h`,
      quien: m.nombre, detalle: m.nota || '', partidaId: m.partida_id || SIN_PARTIDA, tipo: 'mano_obra', monto: n(m.costo),
      // Las horas internas se pagan con el sueldo: cuentan como salidas; un externo, cuando se le paga.
      pagable: externo, pagada: externo ? !!m.pagado : true,
      ...sinDetalle, cantidad: externo ? null : n(m.horas), trabajadorId: m.trabajador_id || null,
    });
  }
  for (const h of d.horas || []) {
    out.push({
      origen: 'hora', id: h.id, fecha: h.fecha, fechaCaja: h.fecha, documento: `${num(n(h.horas))} h`, quien: h.usuario_id,
      detalle: h.nota || '', partidaId: SIN_PARTIDA, tipo: 'mano_obra', monto: Math.round(n(h.horas) * n(h.costo_hora) * 100) / 100, pagable: false, pagada: true,
      ...sinDetalle,
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Presupuesto (lo cotizado) ───────────────────────────────────────────────
type PorTipo = Record<TipoCosto, number>;
const porTipoVacio = (): PorTipo => ({ material: 0, mano_obra: 0, servicio: 0, operacion: 0 });

interface PresupuestoPartida {
  id: string; numero: number | null; nombre: string;
  /** Venta neta de la partida (con sus descuentos), en pesos. */
  venta: number;
  /** Costo cotizado, en pesos. */
  costo: number;
  costoPorTipo: PorTipo;
  /** Todas sus líneas son material (el flujo por omisión la paga en la semana 1). */
  soloMateriales: boolean;
}
export interface Presupuesto {
  partidas: PresupuestoPartida[];
  /** Las líneas sueltas, sin partida (casi siempre vacío). */
  sinPartida: PresupuestoPartida;
  venta: number;
  costo: number;
  costoPorTipo: PorTipo;
}

export interface CotizacionCP {
  items: Linea[]; partidas: PartidaCot[]; moneda?: Moneda | null; valor_uf?: number | null;
}

/** Reparte `total` (entero) en proporción a `pesos`: cada parte entera y la suma exacta (resto mayor). */
export function repartirEntero(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0);
  if (!pesos.length) return [];
  if (!suma) return pesos.map((_, i) => (i === pesos.length - 1 ? total : 0));
  const crudos = pesos.map(p => (total * p) / suma);
  const base = crudos.map(Math.floor);
  let falta = total - base.reduce((s, b) => s + b, 0);
  const orden = crudos.map((c, i) => [c - Math.floor(c), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; falta > 0 && k < orden.length; k++, falta--) base[orden[k][1]]++;
  return base;
}

export function presupuesto(cot: CotizacionCP): Presupuesto {
  const moneda: Moneda = cot.moneda === 'UF' ? 'UF' : 'CLP';
  const items = cot.items || [], partidas = cot.partidas || [];
  const r = calcular(items, partidas, moneda, cot.valor_uf);
  const ids = new Set(partidas.map(p => p.id));
  const tipoLinea = (l: Linea): TipoCosto => tipoValido(l.categoria);

  // En la moneda de la cotización.
  const crudas = [...partidas.map((p, i) => {
    const suyas = items.filter(l => l.partidaId === p.id);
    const c = r.partidas.get(p.id);
    const costoPorTipo = porTipoVacio();
    for (const l of suyas) costoPorTipo[tipoLinea(l)] += r.lineas.get(l.id)?.costoConImprevistos || 0;
    return {
      id: p.id, numero: (i + 1) as number | null, nombre: (p.nombre || '').trim() || `Partida ${i + 1}`,
      venta: c?.neto || 0, costo: c?.costo || 0, costoPorTipo,
      soloMateriales: suyas.length > 0 && suyas.every(l => tipoLinea(l) === 'material'),
    };
  }), (() => {
    const sueltas = items.filter(l => !ids.has(l.partidaId || ''));
    const costoPorTipo = porTipoVacio();
    let venta = 0, costo = 0;
    for (const l of sueltas) {
      const c = r.lineas.get(l.id);
      venta += c?.neto || 0; costo += c?.costoConImprevistos || 0;
      costoPorTipo[tipoLinea(l)] += c?.costoConImprevistos || 0;
    }
    return { id: SIN_PARTIDA, numero: null, nombre: 'Sin partida', venta, costo, costoPorTipo, soloMateriales: false };
  })()];

  // A pesos, como cotizacion_resultado: round(subtotal × UF) y round(costo_directo × UF); cada
  // partida se reparte por resto mayor para que la suma dé exacta.
  let filas: PresupuestoPartida[];
  if (moneda === 'CLP') {
    filas = crudas.map(f => ({ ...f, venta: Math.round(f.venta), costo: Math.round(f.costo),
      costoPorTipo: Object.fromEntries(CLAVES_TIPO.map(t => [t, Math.round(f.costoPorTipo[t])])) as PorTipo }));
  } else {
    const uf = Number(cot.valor_uf) || 0;
    const ventas = repartirEntero(Math.round(r.totales.neto * uf), crudas.map(f => f.venta * uf));
    const costos = repartirEntero(Math.round(r.internos.costoConImprevistos * uf), crudas.map(f => f.costo * uf));
    filas = crudas.map((f, i) => {
      const porTipo = repartirEntero(costos[i], CLAVES_TIPO.map(t => f.costoPorTipo[t]));
      return { ...f, venta: uf ? ventas[i] : 0, costo: uf ? costos[i] : 0,
        costoPorTipo: Object.fromEntries(CLAVES_TIPO.map((t, k) => [t, uf ? porTipo[k] : 0])) as PorTipo };
    });
  }
  const sinPartida = filas[filas.length - 1];
  const lista = filas.slice(0, -1);
  const costoPorTipo = porTipoVacio();
  for (const f of filas) for (const t of CLAVES_TIPO) costoPorTipo[t] += f.costoPorTipo[t];
  return {
    partidas: lista, sinPartida,
    venta: filas.reduce((s, f) => s + f.venta, 0),
    costo: filas.reduce((s, f) => s + f.costo, 0),
    costoPorTipo,
  };
}

// ── Presupuesto vs real ─────────────────────────────────────────────────────
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const margen = (venta: number, costo: number) => (venta > 0 ? ((venta - costo) / venta) * 100 : null);

/** El anteproyecto por partida (clave «» = sin partida) y por tipo. Sin él, lo presupuestado es lo cotizado. */
export interface PresupuestoEjecucion { porPartida: Map<string, number>; porTipo: Record<TipoCosto, number> }

export interface FilaControl {
  id: string; numero: number | null; nombre: string;
  /** Lo que se cobró (venta neta). */
  venta: number;
  /** El costo que traía la cotización. */
  cotizado: number; margenCotizado: number | null;
  /** El presupuesto de ejecución (anteproyecto); sin él, lo cotizado. */
  presupuesto: number; margenPlan: number | null;
  real: number;
  /** Real − presupuesto. */
  desviacion: number; ejecutado: number | null;
  proyectado: number; margenProyectado: number | null; estado: EstadoControl;
}
interface FilaTipo { tipo: TipoCosto; nombre: string; cotizado: number; presupuesto: number; real: number; desviacion: number; estado: EstadoControl }
export interface Control {
  filas: FilaControl[];
  total: FilaControl;
  porTipo: FilaTipo[];
  realPorOrigen: Record<OrigenMov, number>;
}

function fila(id: string, numero: number | null, nombre: string, venta: number, cotizado: number, presupuesto: number, real: number): FilaControl {
  const proyectado = Math.max(presupuesto, real);
  return {
    id, numero, nombre, venta, cotizado, margenCotizado: margen(venta, cotizado), presupuesto, margenPlan: margen(venta, presupuesto),
    real, desviacion: real - presupuesto, ejecutado: pct(real, presupuesto), proyectado, margenProyectado: margen(venta, proyectado),
    estado: estadoControl(presupuesto, real),
  };
}

/** Lo presupuestado de cada partida: el anteproyecto si hay; si no, lo cotizado. */
export function presupuestoPorPartida(p: Presupuesto, ejec?: PresupuestoEjecucion | null): Map<string, number> {
  const ids = new Set(p.partidas.map(x => x.id));
  if (!ejec) return new Map([...p.partidas.map(x => [x.id, x.costo] as const), [SIN_PARTIDA, p.sinPartida.costo]]);
  const m = new Map<string, number>([...p.partidas.map(x => [x.id, 0] as const), [SIN_PARTIDA, 0]]);
  for (const [k, v] of ejec.porPartida) {
    const clave = ids.has(k) ? k : SIN_PARTIDA;   // una partida que ya no está cae en «Sin partida»
    m.set(clave, (m.get(clave) || 0) + v);
  }
  return m;
}

export function control(p: Presupuesto, movs: Movimiento[], ejec?: PresupuestoEjecucion | null): Control {
  const ids = new Set(p.partidas.map(x => x.id));
  const realDe = new Map<string, number>();
  for (const m of movs) {
    const k = ids.has(m.partidaId) ? m.partidaId : SIN_PARTIDA;
    realDe.set(k, (realDe.get(k) || 0) + m.monto);
  }
  const plan = presupuestoPorPartida(p, ejec);
  const filas = p.partidas.map(x => fila(x.id, x.numero, x.nombre, x.venta, x.costo, plan.get(x.id) || 0, realDe.get(x.id) || 0));
  const s = p.sinPartida, realSin = realDe.get(SIN_PARTIDA) || 0, planSin = plan.get(SIN_PARTIDA) || 0;
  if (s.venta || s.costo || planSin || realSin) filas.push(fila(SIN_PARTIDA, null, 'Sin partida', s.venta, s.costo, planSin, realSin));
  const suma = (k: 'venta' | 'cotizado' | 'presupuesto' | 'real' | 'proyectado') => filas.reduce((t, f) => t + f[k], 0);
  const total = fila('total', null, 'Total', suma('venta'), suma('cotizado'), suma('presupuesto'), suma('real'));
  total.proyectado = suma('proyectado');
  total.margenProyectado = margen(total.venta, total.proyectado);
  const realTipo = porTipoVacio();
  const realPorOrigen: Record<OrigenMov, number> = { gasto: 0, compra: 0, mano_obra: 0, hora: 0 };
  for (const m of movs) { realTipo[m.tipo] += m.monto; realPorOrigen[m.origen] += m.monto; }
  const planTipo = ejec ? ejec.porTipo : p.costoPorTipo;
  return {
    filas, total, realPorOrigen,
    porTipo: TIPOS_COSTO.map(t => ({
      tipo: t.clave, nombre: t.nombre, cotizado: p.costoPorTipo[t.clave], presupuesto: planTipo[t.clave], real: realTipo[t.clave],
      desviacion: realTipo[t.clave] - planTipo[t.clave], estado: estadoControl(planTipo[t.clave], realTipo[t.clave]),
    })),
  };
}

interface KpisControl {
  venta: number; cotizado: number; presupuesto: number; real: number;
  /** Lo gastado sobre lo presupuestado. */
  pctGastado: number | null;
  /** Venta − presupuesto (lo que se planea ganar). */
  margenPlan: number; margenPlanPct: number | null;
  margenProyectado: number; margenProyectadoPct: number | null;
  cobrado: number; porCobrar: number;
  /** Lo que entró menos lo que salió: cobrado − compras y externos pagados − gastos − mano de obra interna. */
  caja: number;
}

/** `totalCotizacion`: lo que paga el cliente (con IVA). Por cobrar = eso − lo cobrado. */
export function kpis(c: Control, movs: Movimiento[], cobros: CobroCP[], totalCotizacion: number): KpisControl {
  const cobrado = cobros.reduce((s, x) => s + n(x.monto_pagado), 0);
  const salio = movs.filter(m => m.pagada).reduce((s, m) => s + m.monto, 0);
  return {
    venta: c.total.venta, cotizado: c.total.cotizado, presupuesto: c.total.presupuesto, real: c.total.real,
    pctGastado: pct(c.total.real, c.total.presupuesto),
    margenPlan: c.total.venta - c.total.presupuesto, margenPlanPct: c.total.margenPlan,
    margenProyectado: c.total.venta - c.total.proyectado, margenProyectadoPct: c.total.margenProyectado,
    cobrado, porCobrar: Math.max(n(totalCotizacion) - cobrado, 0), caja: cobrado - salio,
  };
}

interface ResultadoBase {
  venta_neta: number; costo_cotizado: number; gastos: number; compras?: number | null; costo_horas?: number | null; mano_obra?: number | null;
}
interface DiferenciaCuadre { campo: string; nombre: string; aqui: number; base: number; diferencia: number }

/** Lo que no cuadra al peso con cotizacion_resultado (vacío = todo cuadra). */
export function cuadre(c: Control, r: ResultadoBase | null | undefined): DiferenciaCuadre[] {
  if (!r) return [];
  const pares: [string, string, number, number][] = [
    ['venta_neta', 'Venta neta', c.total.venta, n(r.venta_neta)],
    ['costo_cotizado', 'Costo cotizado', c.total.cotizado, n(r.costo_cotizado)],
    ['gastos', 'Gastos rendidos', c.realPorOrigen.gasto, n(r.gastos)],
    ['compras', 'Compras', c.realPorOrigen.compra, n(r.compras)],
    ['mano_obra', 'Mano de obra', c.realPorOrigen.mano_obra, n(r.mano_obra)],
    ['costo_horas', 'Horas de antes', c.realPorOrigen.hora, n(r.costo_horas)],
  ];
  return pares.map(([campo, nombre, aqui, base]) => ({ campo, nombre, aqui, base, diferencia: Math.round(aqui - base) }))
    .filter(d => d.diferencia !== 0);
}

// ── Flujo de caja semanal ───────────────────────────────────────────────────
export interface FlujoPlan {
  inicio: string;
  semanas: number;
  /** % de cada partida por semana (suma 100). Clave: id de la partida («» = sin partida). */
  distribucion: Record<string, number[]>;
  /** En qué semana cae cada cobro del plan (por su nombre). */
  hitos: Record<string, number>;
}
export const SEMANAS_MAX = 52;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** n semanas parejas, con dos decimales y la suma exacta 100 (lo que sobra va a la última). */
export function repartoParejo(semanas: number): number[] {
  const k = Math.max(1, Math.round(semanas));
  const base = Math.floor(10000 / k) / 100;
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? r2(100 - base * (k - 1)) : base));
}

const acotar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Semana de cada cobro por omisión: «al aprobar» la 1, «al terminar» la última. */
const semanaHito = (h: HitoCobro, semanas: number) => (h.cuando === 'aprobar' ? 1 : semanas);

export function planPorDefecto(o: { inicio: string; presupuesto: Presupuesto; planCobro: HitoCobro[]; semanas?: number }): FlujoPlan {
  const semanas = acotar(Math.round(o.semanas ?? 4), 1, SEMANAS_MAX);
  const distribucion: Record<string, number[]> = {};
  for (const p of o.presupuesto.partidas) {
    distribucion[p.id] = p.soloMateriales ? Array.from({ length: semanas }, (_, i) => (i === 0 ? 100 : 0)) : repartoParejo(semanas);
  }
  if (o.presupuesto.sinPartida.costo) distribucion[SIN_PARTIDA] = repartoParejo(semanas);
  const hitos: Record<string, number> = {};
  for (const h of o.planCobro) if (n(h.porcentaje) > 0) hitos[h.nombre] = semanaHito(h, semanas);
  return { inicio: o.inicio, semanas, distribucion, hitos };
}

/** Cambia la cantidad de semanas: las nuevas parten en 0; lo de las que se quitan pasa a la última que queda. */
export function ajustarSemanas(plan: FlujoPlan, semanas: number): FlujoPlan {
  const k = acotar(Math.round(semanas) || 1, 1, SEMANAS_MAX);
  const distribucion = Object.fromEntries(Object.entries(plan.distribucion).map(([id, arr]) => {
    const nuevo = Array.from({ length: k }, (_, i) => n(arr[i]));
    const sobra = arr.slice(k).reduce((s, v) => s + n(v), 0);
    if (sobra) nuevo[k - 1] = r2(nuevo[k - 1] + sobra);
    return [id, nuevo];
  }));
  const hitos = Object.fromEntries(Object.entries(plan.hitos).map(([h, s]) => [h, acotar(Math.round(n(s)) || 1, 1, k)]));
  return { ...plan, semanas: k, distribucion, hitos };
}

export const sumaPct = (arr: number[] | undefined) => r2((arr || []).reduce((s, v) => s + n(v), 0));

/** Las partidas con algo presupuestado (`costos`, de presupuestoPorPartida) cuyo % no suma 100. Una
 *  partida sin % guardados se reparte pareja (como el flujo), así que suma 100. */
export function distribucionInvalida(plan: FlujoPlan, costos: Map<string, number>): { id: string; suma: number }[] {
  return [...costos].filter(([, costo]) => costo > 0)
    .map(([id]) => ({ id, suma: plan.distribucion[id] ? sumaPct(plan.distribucion[id]) : 100 }))
    .filter(x => Math.abs(x.suma - 100) > 0.005);
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** El plan guardado (JSON) completado con el de por omisión: semanas válidas, una fila por partida. */
export function normalizarPlan(guardado: unknown, base: FlujoPlan): FlujoPlan {
  const g = (guardado && typeof guardado === 'object' ? guardado : {}) as Partial<FlujoPlan>;
  const semanas = acotar(Math.round(n(g.semanas)) || base.semanas, 1, SEMANAS_MAX);
  const ajustada = ajustarSemanas(base, semanas);
  const distribucion: Record<string, number[]> = {};
  for (const id of Object.keys(ajustada.distribucion)) {
    const arr = g.distribucion && Array.isArray(g.distribucion[id]) ? g.distribucion[id] : null;
    distribucion[id] = arr ? Array.from({ length: semanas }, (_, i) => n(arr[i])) : ajustada.distribucion[id];
  }
  const hitos: Record<string, number> = {};
  for (const h of Object.keys(ajustada.hitos)) {
    const s = g.hitos && typeof g.hitos === 'object' ? Math.round(n((g.hitos as Record<string, number>)[h])) : 0;
    hitos[h] = s ? acotar(s, 1, semanas) : ajustada.hitos[h];
  }
  return { inicio: esFecha(g.inicio) ? g.inicio : base.inicio, semanas, distribucion, hitos };
}

/** Inicio por omisión: cuando partió el trabajo; si no, cuando se aprobó; si no, hoy. */
export function inicioPorDefecto(trabajoInicio: string | null | undefined, aprobadaAt: string | null | undefined, hoy: string): string {
  if (esFecha(trabajoInicio)) return trabajoInicio;
  if (aprobadaAt) {
    // aceptada_at es un instante: su día en Chile.
    const d = new Date(aprobadaAt);
    if (!isNaN(d.getTime())) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);
  }
  return hoy;
}

const DIA = 86_400_000;
const aUtc = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
const sumarDias = (f: string, dias: number) => new Date(aUtc(f) + dias * DIA).toISOString().slice(0, 10);

/** Semana (1…n) de una fecha; antes del inicio es la 1; después de la última, «posterior» (0). */
export function semanaDe(fecha: string, inicio: string, semanas: number): number {
  if (!esFecha(fecha)) return 1;
  const d = Math.floor((aUtc(fecha) - aUtc(inicio)) / DIA);
  if (d < 0) return 1;
  const s = Math.floor(d / 7) + 1;
  return s > semanas ? 0 : s;
}

/** Monto de cada cobro del plan, como _cot_generar_cobros: round(total × acumulado %) − round(total × anterior %). */
export function montosHitos(total: number, plan: HitoCobro[]): (HitoCobro & { monto: number })[] {
  let acum = 0;
  return plan.map(h => {
    const antes = acum;
    acum += n(h.porcentaje);
    const monto = n(h.porcentaje) > 0 ? redondear(total, acum) - redondear(total, antes) : 0;
    return { ...h, monto };
  });
}
// round(total × % / 100) como la base (numeric): el % va con toda su precisión (un primer pago en $
// deja un % con muchos decimales) y el medio peso sube aunque el decimal binario quede apenas debajo.
const redondear = (total: number, porcentaje: number) => Math.round((n(total) * n(porcentaje)) / 100 + 1e-6);

/** Reparte un monto por semana según los % (redondeo por acumulado: la suma da exacta). */
function repartoSemanal(monto: number, pcts: number[]): number[] {
  let acum = 0;
  return pcts.map(p => {
    const antes = acum;
    acum += n(p);
    return redondear(monto, acum) - redondear(monto, antes);
  });
}

interface SemanaFlujo {
  /** 1…n, o 0 para «Posterior». */
  semana: number;
  nombre: string;
  desde: string | null; hasta: string | null;
  ingresoPlan: number; egresoPlan: number; netoPlan: number; acumPlan: number;
  ingresoReal: number; egresoReal: number; netoReal: number; acumReal: number;
  /** Egreso real − egreso plan (positivo = se gastó más de lo planeado esa semana). */
  desvEgreso: number;
}

export function flujoSemanal(o: {
  plan: FlujoPlan; presupuesto: Presupuesto; planCobro: HitoCobro[]; totalCotizacion: number;
  cobros: CobroCP[]; movimientos: Movimiento[];
  /** El anteproyecto: el egreso plan sale de él (sin él, de lo cotizado). */
  ejecucion?: PresupuestoEjecucion | null;
}): SemanaFlujo[] {
  const { plan } = o;
  const k = plan.semanas;
  const filas: SemanaFlujo[] = [
    ...Array.from({ length: k }, (_, i) => ({
      semana: i + 1, nombre: `Semana ${i + 1}`, desde: sumarDias(plan.inicio, i * 7), hasta: sumarDias(plan.inicio, i * 7 + 6),
    })),
    { semana: 0, nombre: 'Posterior', desde: sumarDias(plan.inicio, k * 7), hasta: null },
  ].map(f => ({ ...f, ingresoPlan: 0, egresoPlan: 0, netoPlan: 0, acumPlan: 0, ingresoReal: 0, egresoReal: 0, netoReal: 0, acumReal: 0, desvEgreso: 0 }));
  const idx = (s: number) => (s === 0 ? k : s - 1);

  for (const h of montosHitos(o.totalCotizacion, o.planCobro)) {
    if (!h.monto) continue;
    const s = acotar(Math.round(n(plan.hitos[h.nombre])) || semanaHito(h, k), 1, k);
    filas[idx(s)].ingresoPlan += h.monto;
  }
  for (const [id, costo] of presupuestoPorPartida(o.presupuesto, o.ejecucion)) {
    if (!costo) continue;
    repartoSemanal(costo, plan.distribucion[id] || repartoParejo(k)).forEach((m, i) => { if (i < k) filas[i].egresoPlan += m; });
  }
  for (const c of o.cobros) {
    const m = n(c.monto_pagado);
    if (!m) continue;
    const f = c.fecha_pago || c.fecha_factura || (c.created_at || '').slice(0, 10);
    filas[idx(semanaDe(f, plan.inicio, k))].ingresoReal += m;
  }
  for (const m of o.movimientos) filas[idx(semanaDe(m.fechaCaja, plan.inicio, k))].egresoReal += m.monto;

  let ap = 0, ar = 0;
  for (const f of filas) {
    f.netoPlan = f.ingresoPlan - f.egresoPlan; ap += f.netoPlan; f.acumPlan = ap;
    f.netoReal = f.ingresoReal - f.egresoReal; ar += f.netoReal; f.acumReal = ar;
    f.desvEgreso = f.egresoReal - f.egresoPlan;
  }
  return filas;
}

// ── Excel ───────────────────────────────────────────────────────────────────
const pctX = (v: number | null) => (v === null ? '' : Math.round(v * 10) / 10);

export function nombreArchivoControl(folio: number, hoy: string) {
  return `IV-${String(folio).padStart(4, '0')}_control_${hoy}.xlsx`;
}

/** Las hojas del Excel: Control (partidas + KPIs), PorTipo, Flujo y Movimientos. */
export function hojasControl(o: {
  control: Control; kpis: KpisControl; flujo: SemanaFlujo[]; movimientos: Movimiento[]; presupuesto: Presupuesto;
  /** id de persona → nombre; categoría de gasto → nombre; id de línea del presupuesto → su descripción. */
  nombres?: Record<string, string>; categorias?: Record<string, string>; lineasPresupuesto?: Record<string, string>;
}): { nombre: string; filas: Record<string, unknown>[] }[] {
  const { control: c, kpis: k } = o;
  const filaControl = (f: FilaControl) => ({
    'N°': f.numero ?? '', Partida: f.nombre, 'Cobrado (venta neta)': f.venta, 'Costo cotizado': f.cotizado, 'Presupuesto': f.presupuesto,
    'Margen plan %': pctX(f.margenPlan), 'Gasto real': f.real, 'Desviación (real − presupuesto)': f.desviacion, '% ejecutado': pctX(f.ejecutado),
    'Costo proyectado': f.proyectado,
    'Margen proyectado %': pctX(f.margenProyectado), Estado: f.id === 'total' ? '' : NOMBRE_ESTADO[f.estado],
  });
  const vacia = (txt: string, valor: unknown) => ({ 'N°': '', Partida: txt, 'Cobrado (venta neta)': valor });
  const etiqueta = new Map<string, string>([...o.presupuesto.partidas.map(p => [p.id, etiquetaPartida(p)] as const)]);
  return [
    {
      nombre: 'Control',
      filas: [
        ...c.filas.map(filaControl), filaControl(c.total), vacia('', ''),
        vacia('Cobrado (venta neta)', k.venta), vacia('Costo cotizado', k.cotizado), vacia('Presupuesto', k.presupuesto),
        vacia('Margen plan', k.margenPlan), vacia('Margen plan %', pctX(k.margenPlanPct)), vacia('Gasto real', k.real),
        vacia('% gastado', pctX(k.pctGastado)), vacia('Margen proyectado', k.margenProyectado), vacia('Margen proyectado %', pctX(k.margenProyectadoPct)),
        vacia('Cobrado', k.cobrado), vacia('Por cobrar', k.porCobrar), vacia('Caja del trabajo', k.caja),
      ],
    },
    {
      nombre: 'PorTipo',
      filas: [
        ...c.porTipo.map(t => ({ 'Tipo de costo': t.nombre, Cotizado: t.cotizado, Presupuesto: t.presupuesto, Real: t.real, 'Desviación': t.desviacion, Estado: NOMBRE_ESTADO[t.estado] })),
        { 'Tipo de costo': 'Total', Cotizado: c.total.cotizado, Presupuesto: c.total.presupuesto, Real: c.total.real, 'Desviación': c.total.desviacion, Estado: '' },
      ],
    },
    {
      nombre: 'Flujo',
      filas: o.flujo.map(f => ({
        Semana: f.nombre, Desde: f.desde || '', Hasta: f.hasta || '',
        'Ingreso plan': f.ingresoPlan, 'Egreso plan': f.egresoPlan, 'Neto plan': f.netoPlan, 'Acumulado plan': f.acumPlan,
        'Ingreso real': f.ingresoReal, 'Egreso real': f.egresoReal, 'Neto real': f.netoReal, 'Acumulado real': f.acumReal,
        'Desviación egreso': f.desvEgreso,
      })),
    },
    {
      nombre: 'Movimientos',
      filas: o.movimientos.map(m => ({
        Fecha: m.fecha, Origen: NOMBRE_ORIGEN[m.origen],
        Documento: m.origen === 'gasto' ? o.categorias?.[m.documento] || m.documento : m.documento,
        'Proveedor o persona': m.origen === 'compra' || m.origen === 'mano_obra' ? m.quien : o.nombres?.[m.quien] || '',
        Detalle: m.detalle, Cantidad: m.cantidad ?? '', Partida: etiqueta.get(m.partidaId) || 'Sin partida', 'Tipo de costo': nombreTipo(m.tipo),
        'En el presupuesto': m.detallado ? (m.presupuestoLineaId ? o.lineasPresupuesto?.[m.presupuestoLineaId] || 'Sí' : 'No cotizado') : '',
        'Monto considerado': m.monto, Pagada: m.pagable ? (m.pagada ? 'Sí' : 'No') : '', 'Fecha de caja': m.fechaCaja,
      })),
    },
  ];
}
