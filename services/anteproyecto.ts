'use client';

/**
 * Presupuesto de ejecución de cada trabajo (presupuesto_lineas, fases 21 y 22) y el detalle de
 * compras y gastos (documento_lineas). Las cuentas están en lib/anteproyecto.ts y
 * lib/analisisProyecto.ts. La fase 22 es requisito: un error de la base se informa, no se esconde.
 */

import { supabase } from '@/lib/supabase';
import { lineasDesdeCotizacion, type LineaPresupuesto } from '@/lib/anteproyecto';
import type { DocumentoLineaCP } from '@/lib/controlProyecto';
import type { Linea, Moneda, PartidaCot } from '@/lib/cotizador/tipos';

export type LineaPresupuestoBD = LineaPresupuesto & { id: string; cotizacion_id: string };
/** Para elegir a qué se asigna lo comprado o dónde se cargan las horas (sin costos). */
export interface LineaAsignable {
  id: string; partida_id: string | null; tipo: string; descripcion: string; unidad: string | null; cantidad: number;
  personas: number; trabajador_id: string | null;
}
/** Una línea del detalle mientras se edita (presupuesto_linea_id undefined = aún sin decidir: se sugiere). */
export interface LineaDocumentoEdit {
  clave: string; descripcion: string; cantidad: number | null; unidad: string; monto: number;
  partida_id: string | null | undefined; presupuesto_linea_id: string | null | undefined; tipo: string;
}

const lanzar = (error: { message: string } | null) => { if (error) throw error; };
const CAMPOS = 'id, cotizacion_id, partida_id, tipo, descripcion, unidad, cantidad, costo_unitario, linea_id, trabajador_id, orden, nota, personas, modalidad, honorarios, valor_liquido';
const numero = (l: Record<string, unknown>) => ({
  ...l, cantidad: Number(l.cantidad), costo_unitario: Number(l.costo_unitario), personas: Number(l.personas) || 1,
  valor_liquido: l.valor_liquido === null || l.valor_liquido === undefined ? null : Number(l.valor_liquido),
}) as LineaPresupuestoBD;
const lineaDoc = (l: DocumentoLineaCP) => ({ ...l, monto: Number(l.monto), cantidad: l.cantidad === null ? null : Number(l.cantidad) });

export const anteproyectoService = {
  async lineas(cotId: string): Promise<LineaPresupuestoBD[]> {
    const { data, error } = await supabase.from('presupuesto_lineas').select(CAMPOS).eq('cotizacion_id', cotId)
      .order('orden').order('created_at');
    lanzar(error);
    return (data || []).map(numero);
  },
  /** Si el trabajo aún no tiene presupuesto, lo arma copiando la cotización (no duplica si ya está). */
  async asegurar(cotId: string): Promise<LineaPresupuestoBD[]> {
    const ya = await this.lineas(cotId);
    if (ya.length) return ya;
    const { data: c, error: e } = await supabase.from('cotizaciones').select('items, partidas, moneda, valor_uf').eq('id', cotId).maybeSingle();
    lanzar(e);
    const cot = c as { items: Linea[]; partidas: PartidaCot[]; moneda: Moneda | null; valor_uf: number | null } | null;
    if (!cot) return [];
    const filas = lineasDesdeCotizacion(cot).map(l => ({ ...l, cotizacion_id: cotId }));
    if (filas.length) {
      // Insert simple: el índice único (cotizacion_id, linea_id) es parcial y un upsert con onConflict no lo
      // encuentra. Si otra pestaña (o la aprobación) lo copió al mismo tiempo, el índice rechaza esta copia
      // completa (23505) y queda la que llegó primero.
      const { error } = await supabase.from('presupuesto_lineas').insert(filas);
      if (error && error.code !== '23505') throw error;
    }
    return this.lineas(cotId);
  },
  /** Guarda los cambios del borrador: las nuevas (sin id), las cambiadas y las quitadas. */
  async guardar(cotId: string, cambios: { nuevas: LineaPresupuesto[]; cambiadas: LineaPresupuestoBD[]; quitadas: string[] }) {
    const limpiar = (l: LineaPresupuesto) => ({
      partida_id: l.partida_id || null, tipo: l.tipo, descripcion: l.descripcion.trim(), unidad: l.unidad?.trim() || null,
      cantidad: Number(l.cantidad) || 0, costo_unitario: Number(l.costo_unitario) || 0, trabajador_id: l.trabajador_id || null, orden: l.orden, nota: l.nota ?? null,
      personas: Number(l.personas) > 0 ? Number(l.personas) : 1, modalidad: l.modalidad || null, honorarios: !!l.honorarios,
      valor_liquido: l.valor_liquido === null || l.valor_liquido === undefined ? null : Math.round(Number(l.valor_liquido) || 0),
    });
    if (cambios.quitadas.length) lanzar((await supabase.from('presupuesto_lineas').delete().in('id', cambios.quitadas)).error);
    for (const l of cambios.cambiadas) lanzar((await supabase.from('presupuesto_lineas').update(limpiar(l)).eq('id', l.id)).error);
    if (cambios.nuevas.length) {
      lanzar((await supabase.from('presupuesto_lineas').insert(cambios.nuevas.map(l => ({ ...limpiar(l), cotizacion_id: cotId, linea_id: null })))).error);
    }
  },
  /** Vuelve a copiar la cotización (borra lo que había). */
  async restablecer(cotId: string) {
    lanzar((await supabase.from('presupuesto_lineas').delete().eq('cotizacion_id', cotId)).error);
    return this.asegurar(cotId);
  },
  async paraAsignar(cotId: string): Promise<LineaAsignable[]> {
    const { data, error } = await supabase.rpc('presupuesto_para_asignar', { p_cot: cotId });
    lanzar(error);
    return ((data || []) as LineaAsignable[]).map(l => ({ ...l, cantidad: Number(l.cantidad), personas: Number(l.personas) || 1 }));
  },

  // ── Detalle de compras y gastos ──
  async lineasDe(doc: { compraId?: string; gastoId?: string }): Promise<DocumentoLineaCP[]> {
    const q = supabase.from('documento_lineas').select('*').order('orden');
    const { data, error } = doc.compraId ? await q.eq('compra_id', doc.compraId) : await q.eq('gasto_id', doc.gastoId || '');
    lanzar(error);
    return ((data || []) as DocumentoLineaCP[]).map(lineaDoc);
  },
  async lineasDeDocumentos(compraIds: string[], gastoIds: string[]): Promise<DocumentoLineaCP[]> {
    const partes = await Promise.all([
      compraIds.length ? supabase.from('documento_lineas').select('*').in('compra_id', compraIds) : Promise.resolve({ data: [], error: null }),
      gastoIds.length ? supabase.from('documento_lineas').select('*').in('gasto_id', gastoIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const p of partes) lanzar(p.error);
    return partes.flatMap(p => (p.data || []) as DocumentoLineaCP[]).map(lineaDoc);
  },
  /** Reemplaza el detalle de un documento (vacío = sin detalle). La cantidad va en la unidad del
   *  material del presupuesto, para que el pendiente cuadre. */
  async guardarLineas(doc: { compra_id?: string; gasto_id?: string }, lineas: LineaDocumentoEdit[]) {
    const filtro = doc.compra_id ? { col: 'compra_id', id: doc.compra_id } : { col: 'gasto_id', id: doc.gasto_id || '' };
    lanzar((await supabase.from('documento_lineas').delete().eq(filtro.col, filtro.id)).error);
    const filas = lineas.filter(l => l.descripcion.trim()).map((l, i) => ({
      [filtro.col]: filtro.id, partida_id: l.partida_id || null, presupuesto_linea_id: l.presupuesto_linea_id || null, tipo: l.tipo || 'material',
      descripcion: l.descripcion.trim(), cantidad: l.cantidad, unidad: l.unidad.trim() || null, monto: Math.max(Number(l.monto) || 0, 0), orden: i,
    }));
    if (filas.length) lanzar((await supabase.from('documento_lineas').insert(filas)).error);
  },
};
