/**
 * Las cuentas de una cotización (port de `calculo.py` de TecApp, que a su vez nació
 * de la planilla de InnVolt). Por línea:
 *
 *   precio    = el del catálogo, congelado al agregarla; fuera del catálogo:
 *               costo × (1 + imprevistos) × (1 + ganancia) hacia arriba al precio de la moneda;
 *               una línea de antes conserva su precio guardado.
 *   subtotal  = precio × cantidad                     redondeado a la moneda
 *   descuento = subtotal × % descuento                redondeado a la moneda
 *   neto      = subtotal − descuento
 *
 * IVA de cada línea: afecta (se le suma el 19 %) o exenta (iva 0). El costo es siempre neto (un
 * precio de mercado se pasa a neto con «quitar IVA»); las líneas guardadas antes con «costo con
 * IVA» (`ivaIncluido`) traen el IVA adentro de su costo y su precio y se calculan con el neto (÷ 1,19).
 * Partida: su descuento propio (%) va sobre su neto, ya con el descuento de cada línea, y se reparte
 * entre lo afecto y lo exento de la partida (así el IVA sigue cuadrando).
 * Totales: Subtotal − Descuento = Neto (= afecto + exento); IVA = afecto × 19 %; Neto + IVA = Total
 * (Descuento = el de las líneas + el de las partidas).
 * Cada pieza ya está redondeada y las cuentas son sumas: siempre cuadran.
 * En UF el precio unitario va a 0,0001 y los montos a 0,01.
 */

import type { CategoriaItem } from '@/types';
import { IVA, type ArticuloCatalogo, type CargoPorcentaje, type Linea, type Moneda, type PartidaCot, type TipoPartida } from './tipos';

const CATEGORIAS: CategoriaItem[] = ['material', 'mano_obra', 'servicio', 'operacion'];

const CUANTO = { CLP: 1, UF: 0.01 } as const;
const CUANTO_PRECIO = { CLP: 1, UF: 0.0001 } as const;

/** Redondeo de siempre, la mitad hacia arriba (4.812,5 → 4.813). */
export function q(v: number, cuanto: number): number {
  const f = 1 / cuanto;
  return Math.round((v + Math.sign(v) * 1e-9) * f) / f;
}
/** Hacia arriba al cuanto (el cargo nunca queda bajo lo definido). Tolera el ruido de los decimales. */
export function qArriba(v: number, cuanto: number): number {
  const f = 1 / cuanto;
  return Math.ceil(v * f - 1e-7) / f;
}
export const qm = (v: number, m: Moneda) => q(v, CUANTO[m]);
export const qp = (v: number, m: Moneda) => q(v, CUANTO_PRECIO[m]);

export const esExenta = (l: Linea) => (l.iva ?? IVA) === 0;
/** Cuánto IVA traen adentro el costo y el precio escritos (1 = son netos). */
export const factorIva = (l: Linea) => (l.ivaIncluido && !esExenta(l) ? 1 + IVA / 100 : 1);
export const esFuera = (l: Linea) => !!l.fuera;
export const esDelCatalogo = (l: Linea) => !!l.itemId && !l.fuera;
export const esDeAntes = (l: Linea) => !l.itemId && !l.fuera;

/** Precio de venta del catálogo: costo × (1 + ganancia) hacia arriba al redondeo de su familia. */
export function precioCatalogo(costo: number, ganancia: number | null | undefined, redondeo = 1): number | null {
  if (ganancia === null || ganancia === undefined || !Number.isFinite(costo)) return null;
  const r = redondeo > 0 ? redondeo : 1;
  return Math.ceil((costo * (1 + ganancia / 100)) / r - 1e-7) * r;
}

/** El precio unitario de una línea en la moneda de la cotización. */
export function precioDeLinea(l: Linea, moneda: Moneda): number {
  const costoCI = (l.costo || 0) * (1 + (l.imprevistos || 0) / 100);
  if (l.fuera) return qArriba(costoCI * (1 + (Number(l.ganancia) || 0) / 100), CUANTO_PRECIO[moneda]);
  if ((l.precio || 0) > 0 || l.itemId) return qp(l.precio || 0, moneda);
  const m = Math.min(l.margen || 0, 99.9) / 100;
  return qp(costoCI / (1 - m), moneda);
}

/** Subtotal ÷ cantidad si da exacto en la moneda; si no, null (el PDF imprime «—» y el total). */
export function unitarioImprimible(subtotal: number, cantidad: number, moneda: Moneda): number | null {
  if (!(cantidad > 0)) return null;
  const v = qp(subtotal / cantidad, moneda);
  return Math.abs(qm(v * cantidad, moneda) - subtotal) < 1e-9 ? v : null;
}

export interface LineaCalculada {
  precio: number;
  subtotal: number;
  descuento: number;
  neto: number;
  costoTotal: number;
  costoConImprevistos: number;
  utilidad: number;
  /** Lo que de verdad queda, sobre lo que paga el cliente (null si neto 0). */
  margenReal: number | null;
  /** Ganancia sobre el costo (la del catálogo o la escrita). */
  ganancia: number | null;
}

export function calcularLinea(l: Linea, moneda: Moneda): LineaCalculada {
  const cantidad = Number(l.cantidad) || 0;
  const f = factorIva(l);
  const precio = f === 1 ? precioDeLinea(l, moneda) : qp(precioDeLinea(l, moneda) / f, moneda);
  const subtotal = qm(precio * cantidad, moneda);
  const descuento = qm(subtotal * Math.min(Math.max(l.descuento || 0, 0), 100) / 100, moneda);
  const neto = subtotal - descuento;
  const costo = (l.costo || 0) / f;
  const costoTotal = costo * cantidad;
  const costoConImprevistos = costoTotal * (1 + (l.imprevistos || 0) / 100);
  const utilidad = neto - qm(costoConImprevistos, moneda);
  const costoCIu = costo * (1 + (l.imprevistos || 0) / 100);
  return {
    precio, subtotal, descuento, neto,
    costoTotal: qm(costoTotal, moneda),
    costoConImprevistos: qm(costoConImprevistos, moneda),
    utilidad,
    margenReal: neto ? Math.round((utilidad / neto) * 1000) / 10 : null,
    ganancia: costoCIu > 0 ? Math.round(((precio - costoCIu) / costoCIu) * 1000) / 10 : null,
  };
}

export interface PartidaCalculada {
  subtotal: number;
  /** Todo lo descontado: el de cada línea más el de la partida. */
  descuento: number;
  /** Lo que paga el cliente por la partida (después de ambos descuentos, antes del IVA). */
  neto: number;
  /** El neto de sus líneas, antes del descuento de la partida. */
  netoLineas: number;
  /** El descuento propio de la partida (su %), en dinero. */
  descuentoPartida: number;
  valorUnitario: number | null; costo: number; utilidad: number;
}
export interface Totales {
  subtotal: number; descuento: number; neto: number; exento: number; afecto: number; iva: number; total: number;
  netoClp: number | null; ivaClp: number | null; totalClp: number | null;
}
export interface PorCategoria { categoria: CategoriaItem; neto: number; costo: number; costoConImprevistos: number; utilidad: number }
export interface Internos { costoDirecto: number; imprevistos: number; costoConImprevistos: number; utilidad: number; margen: number | null; porCategoria: PorCategoria[] }
export interface Resultado {
  moneda: Moneda;
  lineas: Map<string, LineaCalculada>;
  partidas: Map<string, PartidaCalculada>;
  totales: Totales;
  internos: Internos;
}

/** (neto, IVA, total) en pesos de una cotización en UF, como lo hará la factura. */
export function enPesos(neto: number, exento: number, valorUf: number | null | undefined) {
  if (!valorUf || valorUf <= 0) return { netoClp: null, ivaClp: null, totalClp: null };
  const netoClp = q(neto * valorUf, 1);
  const exentoClp = q(exento * valorUf, 1);
  const ivaClp = q(((netoClp - exentoClp) * IVA) / 100, 1);
  return { netoClp, ivaClp, totalClp: netoClp + ivaClp };
}

export function calcular(lineas: Linea[], partidas: PartidaCot[], moneda: Moneda, valorUf?: number | null): Resultado {
  const calc = new Map<string, LineaCalculada>();
  for (const l of lineas) calc.set(l.id, calcularLinea(l, moneda));
  const porPartida = new Map<string, PartidaCalculada>();
  // Descuento propio de cada partida (un cargo operacional no lleva), repartido entre afecto y exento.
  let descPartidas = 0, descPartidasExento = 0;
  for (const p of partidas) {
    const propias = lineas.filter(l => l.partidaId === p.id);
    const suyas = propias.map(l => calc.get(l.id)!);
    const subtotal = suyas.reduce((s, c) => s + c.subtotal, 0);
    const netoLineas = suyas.reduce((s, c) => s + c.neto, 0);
    const exentoLineas = propias.filter(esExenta).reduce((s, l) => s + calc.get(l.id)!.neto, 0);
    const pct = p.tipo === 'cargo' ? 0 : Math.min(Math.max(Number(p.descuento) || 0, 0), 100);
    const descuentoPartida = pct ? qm((netoLineas * pct) / 100, moneda) : 0;
    const descExento = pct ? Math.min(descuentoPartida, qm((exentoLineas * pct) / 100, moneda)) : 0;
    descPartidas += descuentoPartida; descPartidasExento += descExento;
    const neto = netoLineas - descuentoPartida;
    const costo = suyas.reduce((s, c) => s + c.costoConImprevistos, 0);
    porPartida.set(p.id, {
      subtotal,
      descuento: suyas.reduce((s, c) => s + c.descuento, 0) + descuentoPartida,
      neto, netoLineas, descuentoPartida,
      valorUnitario: unitarioImprimible(subtotal, Number(p.cantidad) || 1, moneda),
      costo,
      utilidad: neto - costo,
    });
  }
  let subtotal = 0, descuento = 0, neto = 0, exento = 0;
  for (const l of lineas) {
    const c = calc.get(l.id)!;
    subtotal += c.subtotal; descuento += c.descuento; neto += c.neto;
    if (esExenta(l)) exento += c.neto;
  }
  descuento += descPartidas; neto -= descPartidas; exento -= descPartidasExento;
  subtotal = qm(subtotal, moneda); descuento = qm(descuento, moneda); neto = qm(neto, moneda); exento = qm(exento, moneda);
  const afecto = neto - exento;
  const iva = qm((afecto * IVA) / 100, moneda);
  const total = qm(neto + iva, moneda);
  const clp = moneda === 'CLP' ? { netoClp: neto, ivaClp: iva, totalClp: total } : enPesos(neto, exento, valorUf);

  const acc = new Map<CategoriaItem, [number, number, number]>();
  const pctDe = new Map(partidas.map(p => [p.id, p.tipo === 'cargo' ? 0 : Math.min(Math.max(Number(p.descuento) || 0, 0), 100)]));
  for (const l of lineas) {
    const c = calc.get(l.id)!;
    const cat = CATEGORIAS.includes(l.categoria) ? l.categoria : 'material';
    const a = acc.get(cat) || [0, 0, 0];
    // Lo que de verdad queda de la línea, con el descuento de su partida.
    a[0] += c.neto * (1 - (pctDe.get(l.partidaId || '') || 0) / 100);
    a[1] += c.costoTotal;
    a[2] += c.costoConImprevistos;
    acc.set(cat, a);
  }
  const porCategoria: PorCategoria[] = CATEGORIAS.filter(c => acc.has(c)).map(c => {
    const [nn, co, ci] = acc.get(c)!;
    const n = qm(nn, moneda);
    const costo = qm(co, moneda), costoCI = qm(ci, moneda);
    return { categoria: c, neto: n, costo, costoConImprevistos: costoCI, utilidad: n - costoCI };
  });
  const costoDirecto = porCategoria.reduce((s, c) => s + c.costo, 0);
  const costoCI = porCategoria.reduce((s, c) => s + c.costoConImprevistos, 0);
  // La utilidad es la del total (lo que paga el cliente menos el costo): cuadra con el neto.
  const utilidad = neto - costoCI;
  return {
    moneda, lineas: calc, partidas: porPartida,
    totales: { subtotal, descuento, neto, exento, afecto, iva, total, ...clp },
    internos: {
      costoDirecto, imprevistos: costoCI - costoDirecto, costoConImprevistos: costoCI, utilidad,
      margen: neto ? Math.round((utilidad / neto) * 1000) / 10 : null, porCategoria,
    },
  };
}

// ── Cargos operacionales calculados como % ──
/**
 * La base de un cargo calculado: sobre el neto (después de los descuentos, antes del IVA) y nunca
 * con los cargos. «total»: toda la cotización; «mano_obra»: la mano de obra y los servicios;
 * o el id de una partida: esa partida ANTES de su descuento propio.
 */
export function baseDeCargo(base: string, lineas: Linea[], partidas: PartidaCot[], r: Resultado): number | null {
  const cargos = new Set(partidas.filter(p => p.tipo === 'cargo').map(p => p.id));
  const pctDe = new Map(partidas.map(p => [p.id, p.tipo === 'cargo' ? 0 : Math.min(Math.max(Number(p.descuento) || 0, 0), 100)]));
  const conDescPartida = (l: Linea) => (r.lineas.get(l.id)?.neto || 0) * (1 - (pctDe.get(l.partidaId || '') || 0) / 100);
  if (base === 'total') return lineas.filter(l => !cargos.has(l.partidaId || '')).reduce((s, l) => s + conDescPartida(l), 0);
  if (base === 'mano_obra') return lineas.filter(l => !cargos.has(l.partidaId || '') && (l.categoria === 'mano_obra' || l.categoria === 'servicio'))
    .reduce((s, l) => s + conDescPartida(l), 0);
  const p = partidas.find(x => x.id === base);
  if (!p || p.tipo === 'cargo') return null;   // la partida ya no está (o pasó a ser de cargo)
  return r.partidas.get(p.id)?.netoLineas ?? 0;
}

/** El monto que le toca a un cargo calculado (en pesos al peso; en UF a la centésima). null = sin base. */
export function montoDeCargo(c: CargoPorcentaje, lineas: Linea[], partidas: PartidaCot[], r: Resultado): number | null {
  const base = baseDeCargo(c.base, lineas, partidas, r);
  return base === null ? null : qm((base * (Number(c.pct) || 0)) / 100, r.moneda);
}

// ── Lo que lee el cliente en «Todo el detalle»: un producto junto con su mano de obra ──
export interface FilaCliente {
  principal: Linea;
  ligadas: Linea[];
  descripcion: string;
  unidad: string;
  cantidad: number;
  equipo: number | null;
  hh: number | null;
  equipoUnitario: number | null;
  hhUnitario: number | null;
  unitario: number | null;
  subtotal: number;
  descuento: number;
  neto: number;
  descuentoPct: number | null;
}

/** Agrupa cada producto con su mano de obra ligada (en el orden del documento). */
export function agrupar(lineas: Linea[]): { cabeza: Linea; ligadas: Linea[] }[] {
  const ids = new Set(lineas.map(l => l.id));
  const ligadaDe = (l: Linea) => (l.ligadoA && ids.has(l.ligadoA) && l.ligadoA !== l.id ? l.ligadoA : null);
  const grupos: { cabeza: Linea; ligadas: Linea[] }[] = [];
  const porId = new Map<string, { cabeza: Linea; ligadas: Linea[] }>();
  for (const l of lineas) {
    if (ligadaDe(l)) continue;
    const g = { cabeza: l, ligadas: [] as Linea[] };
    grupos.push(g); porId.set(l.id, g);
  }
  for (const l of lineas) {
    const d = ligadaDe(l);
    if (!d) continue;
    const g = porId.get(d);
    if (g) g.ligadas.push(l); else grupos.push({ cabeza: l, ligadas: [] });
  }
  return grupos;
}

export function filasDelCliente(lineas: Linea[], r: Resultado): FilaCliente[] {
  const m = r.moneda;
  return agrupar(lineas).map(({ cabeza, ligadas }) => {
    const c = r.lineas.get(cabeza.id)!;
    const cantidad = Number(cabeza.cantidad) || 0;
    const propio = c.subtotal;
    const deLaMano = ligadas.reduce((s, x) => s + r.lineas.get(x.id)!.subtotal, 0);
    const esMaterial = cabeza.categoria === 'material';
    const equipo = esMaterial ? propio : null;
    const hh = esMaterial ? (ligadas.length ? deLaMano : null) : propio + deLaMano;
    const subtotal = propio + deLaMano;
    const todas = [cabeza, ...ligadas];
    const pcts = new Set(todas.map(x => x.descuento || 0));
    return {
      principal: cabeza, ligadas,
      descripcion: cabeza.descripcion, unidad: cabeza.unidad, cantidad,
      equipo, hh,
      equipoUnitario: equipo !== null ? unitarioImprimible(equipo, cantidad, m) : null,
      hhUnitario: hh !== null ? unitarioImprimible(hh, cantidad, m) : null,
      unitario: unitarioImprimible(subtotal, cantidad, m),
      subtotal,
      descuento: todas.reduce((s, x) => s + r.lineas.get(x.id)!.descuento, 0),
      neto: todas.reduce((s, x) => s + r.lineas.get(x.id)!.neto, 0),
      descuentoPct: pcts.size === 1 ? [...pcts][0] : null,
    };
  });
}

// ── Armar líneas ──
export const nuevoId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Convierte un monto en pesos a la moneda de la cotización. */
export function aMoneda(v: number, moneda: Moneda, valorUf?: number | null, esCosto = false): number {
  if (moneda === 'CLP') return v;
  if (!valorUf || valorUf <= 0) return v;
  return q(v / valorUf, esCosto ? 0.000001 : 0.0001);
}

/**
 * Las líneas que agrega un artículo del catálogo a una partida. En una de instalación,
 * un producto de bodega trae pegada su mano de obra (que sigue su cantidad).
 */
export function lineasDeArticulo(
  a: ArticuloCatalogo, cantidad: number, partida: { id: string; tipo?: TipoPartida },
  catalogo: Map<string, ArticuloCatalogo>, moneda: Moneda, valorUf?: number | null,
): Linea[] {
  const linea = (x: ArticuloCatalogo, cant: number, extra: Partial<Linea> = {}): Linea => ({
    id: nuevoId(),
    partidaId: partida.id,
    itemId: x.id,
    codigo: x.codigo || null,
    descripcion: x.descripcion,
    categoria: x.categoria,
    unidad: x.unidad || 'un',
    cantidad: cant,
    costo: aMoneda(x.costo || 0, moneda, valorUf, true),
    imprevistos: 0,
    margen: 0,
    precio: aMoneda(x.precio_venta || 0, moneda, valorUf),
    iva: IVA,
    descuento: 0,
    manoObraId: x.mano_obra_id || null,
    ...extra,
  });
  const principal = linea(a, cantidad);
  const out = [principal];
  if ((partida.tipo || 'instalacion') === 'instalacion' && a.categoria === 'material' && a.mano_obra_id) {
    const mo = catalogo.get(a.mano_obra_id);
    if (mo && mo.precio_venta !== null && mo.activo !== false) {
      const porUnidad = Number(a.mano_obra_por_unidad) || 1;
      out.push(linea(mo, cantidad * porUnidad, { ligadoA: principal.id, porUnidad, manoObraId: null }));
    }
  }
  return out;
}

/** Una línea fuera del catálogo: se le escribe su costo, su ganancia y su unidad. */
export function lineaFuera(descripcion: string, partidaId: string): Linea {
  return {
    id: nuevoId(), partidaId, descripcion, categoria: 'material', unidad: 'un', cantidad: 1,
    costo: 0, imprevistos: 0, margen: 0, precio: 0, iva: IVA, descuento: 0, fuera: true, ganancia: null,
  };
}

/** Las cotizaciones de antes guardaban un «descuento global» sobre la mano de obra: pasa a cada línea. */
export function sinDescuentoGlobal(lineas: Linea[], descuentoGlobal?: number | null): Linea[] {
  const d = Math.min(Math.max(descuentoGlobal || 0, 0), 100);
  if (!d) return lineas;
  return lineas.map(l => (l.categoria === 'mano_obra' && !(l.descuento || 0) ? { ...l, descuento: d } : l));
}

// ── Formatos ──
export function formatMonto(v: number | null | undefined, moneda: Moneda, unitario = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (Object.is(v, -0) || Math.abs(v) < 1e-9) v = 0; // sin «$-0»
  if (moneda === 'UF') {
    return 'UF ' + v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: unitario ? 4 : 2 });
  }
  return '$' + (Math.round(v) || 0).toLocaleString('es-CL');
}
export const cantidadLegible = (v: number) => (Number(v) || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });
export const porcentaje = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`);
