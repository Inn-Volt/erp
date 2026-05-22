import { supabase } from '@/lib/supabase';
import type { Cotizacion, EstadoCotizacion, KpiData } from '@/types';

export const cotizacionesService = {
  async getAll(): Promise<Cotizacion[]> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .order('folio', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Cotizacion | null> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async create(payload: Omit<Cotizacion, 'id' | 'folio' | 'created_at' | 'clientes'>): Promise<Cotizacion> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .insert([payload])
      .select('*, clientes(*)')
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<Omit<Cotizacion, 'id' | 'folio' | 'created_at' | 'clientes'>>): Promise<Cotizacion> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, clientes(*)')
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
    if (error) throw error;
  },

  async updateEstado(id: string, estado: EstadoCotizacion): Promise<void> {
    const { error } = await supabase
      .from('cotizaciones')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async getNextFolio(): Promise<number> {
    const { data } = await supabase
      .from('cotizaciones')
      .select('folio')
      .order('folio', { ascending: false })
      .limit(1)
      .single();
    return data ? data.folio + 1 : 1;
  },

  async getKpis(): Promise<KpiData> {
    // Try RPC first (no row limit)
    const { data, error } = await supabase.rpc('get_kpis');
    if (!error && data) return data as KpiData;

    // Fallback: aggregate client-side
    const { data: rows } = await supabase
      .from('cotizaciones')
      .select('total, estado');
    const all = rows || [];
    return {
      total_cotizaciones: all.length,
      venta_acumulada: all.filter(r => r.estado !== 'Rechazado').reduce((a, r) => a + (r.total || 0), 0),
      pendiente_pipeline: all.filter(r => r.estado === 'Pendiente').reduce((a, r) => a + (r.total || 0), 0),
      aceptadas: all.filter(r => ['Aceptado', 'Realizado', 'Entregado'].includes(r.estado)).length,
    };
  },

  async getRecientes(limit = 5): Promise<Cotizacion[]> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
};
