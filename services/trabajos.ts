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
  clientes?: { nombre_cliente: string } | null;
  resultado?: ResultadoTrabajo | null;
}
export interface ResultadoTrabajo {
  cotizacion_id: string; venta_neta: number; costo_cotizado: number; gastos: number;
  facturado: number; cobrado: number; por_cobrar_total: number;
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
  async cambiarEstado(id: string, estado: EstadoTrabajo) {
    const { error } = await supabase.from('cotizaciones').update({ trabajo_estado: estado }).eq('id', id);
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
  async gastos(filtro: { cotizacionId?: string; proyectoId?: string }): Promise<Gasto[]> {
    let q = supabase.from('gastos').select('*').order('fecha');
    if (filtro.cotizacionId) q = q.eq('cotizacion_id', filtro.cotizacionId);
    if (filtro.proyectoId) q = q.eq('proyecto_id', filtro.proyectoId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []) as Gasto[];
  },
};
