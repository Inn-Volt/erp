'use client';

/**
 * Seguimiento (fase 7): la cotización aprobada ES el trabajo. Aquí se lista, se mueve
 * (por iniciar → en ejecución → terminado) y se leen sus cobros, gastos y resultado.
 */

import { supabase } from '@/lib/supabase';
import type { EstadoTrabajo } from '@/lib/cotizador/tipos';
import type { Gasto, PorFacturar } from '@/services/operacion';

export interface Trabajo {
  id: string; folio: number; titulo: string | null; cliente_id: string | null; proyecto_id: string | null;
  total: number; total_clp: number | null; moneda: string | null; aceptada_at: string | null;
  trabajo_estado: EstadoTrabajo | null; trabajo_inicio: string | null; trabajo_termino: string | null;
  /** Fase 15: por qué se partió sin el anticipo pagado. */
  inicio_sin_anticipo?: string | null;
  clientes?: { nombre_cliente: string } | null;
  resultado?: ResultadoTrabajo | null;
}
export interface ResultadoTrabajo {
  cotizacion_id: string; venta_neta: number; costo_cotizado: number; gastos: number;
  facturado: number; cobrado: number; por_cobrar_total: number;
  /** Fase 15: compras a proveedores (neto con factura), horas y su costo. */
  compras?: number; horas?: number; costo_horas?: number;
}

/** Costo real del trabajo: gastos rendidos + compras a proveedores + horas. */
export const costoReal = (r?: ResultadoTrabajo | null) =>
  Number(r?.gastos || 0) + Number(r?.compras || 0) + Number(r?.costo_horas || 0);

/** El trabajo no parte con el anticipo impago (fase 15): el error trae cuánto falta. */
export const anticipoPendienteDe = (e: unknown): string | null => {
  const m = (e as { message?: string } | null)?.message || '';
  return m.startsWith('ANTICIPO_PENDIENTE') ? m.replace(/^ANTICIPO_PENDIENTE:\s*/, '') : null;
};

export interface HoraTrabajo {
  id: string; cotizacion_id: string | null; usuario_id: string; fecha: string; horas: number; costo_hora: number; nota: string | null; created_at: string;
}
export type EstadoMaterial = 'pendiente' | 'comprado' | 'en_obra' | 'instalado';
export const ESTADOS_MATERIAL: { clave: EstadoMaterial; nombre: string; color: string }[] = [
  { clave: 'pendiente', nombre: 'Por comprar', color: '#d97706' },
  { clave: 'comprado', nombre: 'Comprado', color: '#2563eb' },
  { clave: 'en_obra', nombre: 'En obra', color: '#7c3aed' },
  { clave: 'instalado', nombre: 'Instalado', color: '#16a34a' },
];
export interface MaterialTrabajo {
  id: string; cotizacion_id: string; linea_id: string; descripcion: string; unidad: string | null; cantidad: number;
  estado: EstadoMaterial; usado: number | null; sobrante: number | null; nota: string | null;
}

/** ¿Falta correr supabase_fase7_flujo.sql? */
export const faltaFase7 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42703' || x.code === '42P01' || x.code === 'PGRST205' || /trabajo_estado|cotizacion_resultado|schema cache/i.test(x.message || ''));
};

const SEL = 'id, folio, titulo, cliente_id, proyecto_id, total, total_clp, moneda, aceptada_at, trabajo_estado, trabajo_inicio, trabajo_termino, clientes(nombre_cliente)';

export const trabajosService = {
  async listar(): Promise<Trabajo[]> {
    const [t, r] = await Promise.all([
      supabase.from('cotizaciones').select(SEL).eq('estado', 'Aprobada').order('aceptada_at', { ascending: false, nullsFirst: false }),
      supabase.from('cotizacion_resultado').select('*'),
    ]);
    if (t.error) throw t.error;
    const res = new Map(((r.data || []) as ResultadoTrabajo[]).map(x => [x.cotizacion_id, x]));
    return ((t.data || []) as unknown as Trabajo[]).map(x => ({ ...x, resultado: res.get(x.id) || null }));
  },
  /** `sinAnticipo`: por qué se parte sin el anticipo pagado (fase 15). */
  async cambiarEstado(id: string, estado: EstadoTrabajo, sinAnticipo?: string) {
    const { error } = await supabase.from('cotizaciones')
      .update(sinAnticipo ? { trabajo_estado: estado, inicio_sin_anticipo: sinAnticipo } : { trabajo_estado: estado }).eq('id', id);
    if (error) throw error;
  },
  async resultado(cotId: string): Promise<ResultadoTrabajo | null> {
    const { data, error } = await supabase.from('cotizacion_resultado').select('*').eq('cotizacion_id', cotId).maybeSingle();
    if (error) return null;
    return data as ResultadoTrabajo | null;
  },
  async cobros(cotId: string): Promise<PorFacturar[]> {
    const { data, error } = await supabase.from('por_facturar').select('*').eq('cotizacion_id', cotId).order('created_at');
    if (error) return [];
    return (data || []) as PorFacturar[];
  },
  async horas(cotId: string): Promise<HoraTrabajo[]> {
    const { data, error } = await supabase.from('horas_trabajo').select('*').eq('cotizacion_id', cotId).order('fecha', { ascending: false });
    if (error) return [];
    return (data || []) as HoraTrabajo[];
  },
  async registrarHoras(h: { cotizacion_id: string; fecha: string; horas: number; nota?: string | null; usuario_id?: string }) {
    const { error } = await supabase.from('horas_trabajo').insert([{ ...h, nota: h.nota?.trim() || null }]);
    if (error) throw error;
  },
  async eliminarHoras(id: string) {
    const { error } = await supabase.from('horas_trabajo').delete().eq('id', id);
    if (error) throw error;
  },
  /** Materiales del trabajo; la primera vez se crean desde las líneas de material de la cotización. */
  async materiales(cotId: string): Promise<MaterialTrabajo[]> {
    const { data, error } = await supabase.from('trabajo_materiales').select('*').eq('cotizacion_id', cotId).order('created_at');
    if (error) return [];
    if (data?.length) return data as MaterialTrabajo[];
    const { data: c } = await supabase.from('cotizaciones').select('items').eq('id', cotId).maybeSingle();
    const items = ((c as { items?: { id: string; descripcion: string; categoria?: string; esMaterial?: boolean; cantidad: number; unidad?: string }[] } | null)?.items || [])
      .filter(i => (i.categoria ? i.categoria === 'material' : i.esMaterial) && i.descripcion?.trim() && Number(i.cantidad) > 0);
    if (!items.length) return [];
    const { data: nuevos, error: e2 } = await supabase.from('trabajo_materiales')
      .upsert(items.map(i => ({ cotizacion_id: cotId, linea_id: i.id, descripcion: i.descripcion.trim(), unidad: i.unidad || null, cantidad: Number(i.cantidad) })),
        { onConflict: 'cotizacion_id,linea_id', ignoreDuplicates: true })
      .select('*');
    if (e2) return [];
    return (nuevos || []) as MaterialTrabajo[];
  },
  async actualizarMaterial(id: string, patch: Partial<Pick<MaterialTrabajo, 'estado' | 'usado' | 'sobrante' | 'nota'>>) {
    const { error } = await supabase.from('trabajo_materiales').update(patch).eq('id', id);
    if (error) throw error;
  },
  async gastos(filtro: { cotizacionId?: string; proyectoId?: string }): Promise<Gasto[]> {
    let q = supabase.from('gastos').select('*').order('fecha');
    if (filtro.cotizacionId) q = q.eq('cotizacion_id', filtro.cotizacionId);
    if (filtro.proyectoId) q = q.eq('proyecto_id', filtro.proyectoId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []) as Gasto[];
  },
};
