/**
 * Anteproyecto (fase 21): el presupuesto de ejecución de un trabajo, línea por línea, y el detalle
 * de lo comprado. Sin React ni Supabase (pruebas: tests/unit/anteproyecto.test.ts).
 *
 *  · lineasDesdeCotizacion: el presupuesto nace copiando la cotización: cada línea con su cantidad
 *    y su costo unitario en pesos (el mismo que usa calcular(): neto, con sus imprevistos de antes,
 *    en UF × el valor de la UF). Luego se edita libremente.
 *  · resumenPresupuesto: el total por partida y por tipo de costo.
 *  · sugerirLinea: a qué línea del presupuesto corresponde lo que dice una boleta («CABLE THHN 6MM»
 *    → «Cable 6 mm²»), comparando palabras. Es solo una sugerencia: la persona revisa.
 *  · realDeLineas: lo comprado de cada material (cantidad y $, de las líneas de boletas y facturas
 *    asignadas a él) y lo gastado en cada línea de mano de obra (lo registrado de esa persona en esa
 *    partida). El reparto del costo de un documento entre sus líneas está en controlProyecto.
 */

import { calcular } from '@/lib/cotizador/calculo';
import type { CotizacionCP, Movimiento, PresupuestoEjecucion, TipoCosto } from '@/lib/controlProyecto';

export interface LineaPresupuesto {
  id?: string;
  partida_id: string | null;
  tipo: TipoCosto;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number;
  linea_id: string | null;
  trabajador_id: string | null;
  orden: number;
  nota?: string | null;
}

const n = (v: unknown) => Number(v) || 0;
const TIPOS: TipoCosto[] = ['material', 'mano_obra', 'servicio', 'operacion'];
const tipoDe = (t: unknown): TipoCosto => (TIPOS.includes(t as TipoCosto) ? (t as TipoCosto) : 'material');
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export const totalLinea = (l: Pick<LineaPresupuesto, 'cantidad' | 'costo_unitario'>) => n(l.cantidad) * n(l.costo_unitario);

export function lineasDesdeCotizacion(cot: CotizacionCP): LineaPresupuesto[] {
  const moneda = cot.moneda === 'UF' ? 'UF' : 'CLP';
  const uf = moneda === 'UF' ? n(cot.valor_uf) : 1;
  const r = calcular(cot.items || [], cot.partidas || [], moneda, cot.valor_uf);
  const partidas = new Set((cot.partidas || []).map(p => p.id));
  return (cot.items || []).filter(l => (l.descripcion || '').trim()).map((l, i) => {
    const costo = (r.lineas.get(l.id)?.costoConImprevistos || 0) * uf;
    const cantidad = n(l.cantidad);
    return {
      partida_id: l.partidaId && partidas.has(l.partidaId) ? l.partidaId : null,
      tipo: tipoDe(l.categoria), descripcion: l.descripcion.trim(), unidad: l.unidad || null,
      cantidad, costo_unitario: cantidad > 0 ? r4(costo / cantidad) : r4(costo),
      linea_id: l.id, trabajador_id: null, orden: i,
    };
  });
}

export interface ResumenPresupuesto {
  porPartida: Map<string, number>;
  porTipo: Record<TipoCosto, number>;
  total: number;
}

/** Totales en pesos (cada partida redondeada). Clave «» = sin partida. */
export function resumenPresupuesto(lineas: Pick<LineaPresupuesto, 'partida_id' | 'tipo' | 'cantidad' | 'costo_unitario'>[]): ResumenPresupuesto {
  const crudo = new Map<string, number>();
  const tipo: Record<TipoCosto, number> = { material: 0, mano_obra: 0, servicio: 0, operacion: 0 };
  for (const l of lineas) {
    const k = l.partida_id || '';
    crudo.set(k, (crudo.get(k) || 0) + totalLinea(l));
    tipo[tipoDe(l.tipo)] += totalLinea(l);
  }
  const porPartida = new Map([...crudo].map(([k, v]) => [k, Math.round(v)]));
  for (const t of TIPOS) tipo[t] = Math.round(tipo[t]);
  return { porPartida, porTipo: tipo, total: [...porPartida.values()].reduce((s, v) => s + v, 0) };
}

// ── Sugerir a qué línea corresponde lo comprado ─────────────────────────────
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'y', 'en', 'a', 'x', 'un', 'una', 'por', 'sin', 'tipo', 'marca', 'mod', 'modelo']);
/** «Cable THHN 6 mm²» → {cable, thhn, 6, mm2}. */
export function palabras(texto: string): Set<string> {
  const limpio = (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/²/g, '2').replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)([a-z])/g, '$1 $2');   // «6mm2» → «6 mm2»
  return new Set(limpio.split(/[^a-z0-9.]+/).map(p => p.replace(/^\.+|\.+$/g, '')).filter(p => p.length > 1 || /\d/.test(p)).filter(p => !VACIAS.has(p)));
}

function parecido(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const p of a) if (b.has(p) || [...b].some(q => q.length > 3 && p.length > 3 && (q.startsWith(p) || p.startsWith(q)))) comunes++;
  return (2 * comunes) / (a.size + b.size);
}

/** El id de la línea más parecida (si se parece lo suficiente), o null = «no cotizado». */
export function sugerirLinea(descripcion: string, candidatas: { id: string; descripcion: string; tipo?: string }[], minimo = 0.34): string | null {
  const a = palabras(descripcion);
  let mejor: { id: string; p: number } | null = null;
  for (const c of candidatas) {
    if (c.tipo && c.tipo !== 'material') continue;
    const p = parecido(a, palabras(c.descripcion));
    if (p >= minimo && (!mejor || p > mejor.p)) mejor = { id: c.id, p };
  }
  return mejor?.id ?? null;
}

/** El anteproyecto en la forma que usa el control (por partida y por tipo). */
export const ejecucionDe = (lineas: Pick<LineaPresupuesto, 'partida_id' | 'tipo' | 'cantidad' | 'costo_unitario'>[]): PresupuestoEjecucion | null => {
  if (!lineas.length) return null;
  const r = resumenPresupuesto(lineas);
  return { porPartida: r.porPartida, porTipo: r.porTipo };
};

// ── Lo real de cada línea ───────────────────────────────────────────────────
export interface RealLinea { cantidad: number; monto: number }

/** Materiales: lo comprado (líneas de documentos asignadas). Mano de obra con persona: lo registrado de
 *  ella en esa partida (cantidad = horas). Las demás líneas solo se comparan por partida. */
export function realDeLineas(lineas: (LineaPresupuesto & { id: string })[], movs: Movimiento[]): Map<string, RealLinea> {
  const out = new Map<string, RealLinea>();
  const sumar = (id: string, cantidad: number, monto: number) => {
    const r = out.get(id) || { cantidad: 0, monto: 0 };
    out.set(id, { cantidad: r.cantidad + cantidad, monto: r.monto + monto });
  };
  const ids = new Set(lineas.map(l => l.id));
  for (const m of movs) if (m.presupuestoLineaId && ids.has(m.presupuestoLineaId)) sumar(m.presupuestoLineaId, n(m.cantidad), m.monto);
  for (const l of lineas) {
    if (l.tipo !== 'mano_obra' || !l.trabajador_id) continue;
    for (const m of movs) {
      if (m.origen === 'mano_obra' && m.trabajadorId === l.trabajador_id && (m.partidaId || null) === (l.partida_id || null)) sumar(l.id, n(m.cantidad), m.monto);
    }
  }
  return out;
}

/** ¿Las líneas suman lo del documento? (las de una factura suelen venir en neto; las de una boleta, con IVA). */
export function cuadreDocumento(montos: number[], costo: number, total?: number) {
  const suma = Math.round(montos.reduce((s, v) => s + n(v), 0));
  const contra = [Math.round(n(costo)), ...(total !== undefined ? [Math.round(n(total))] : [])];
  return { suma, cuadra: contra.some(c => Math.abs(c - suma) <= 1), diferencia: suma - Math.round(n(costo)) };
}
