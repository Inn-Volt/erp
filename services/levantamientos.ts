import { supabase } from '@/lib/supabase';
import type { Levantamiento, EstadoLevantamiento } from '@/types/levantamiento';

export const levantamientosService = {
  async getAll(): Promise<Levantamiento[]> {
    const { data, error } = await supabase
      .from('levantamientos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Levantamiento | null> {
    const { data, error } = await supabase
      .from('levantamientos')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async create(lev: Omit<Levantamiento, 'id' | 'folio' | 'created_at' | 'updated_at'>): Promise<Levantamiento> {
    const { data, error } = await supabase
      .from('levantamientos')
      .insert([{ ...lev, estado: lev.estado || 'Borrador' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Levantamiento>): Promise<Levantamiento> {
    const { data, error } = await supabase
      .from('levantamientos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateEstado(id: string, estado: EstadoLevantamiento): Promise<void> {
    const { error } = await supabase
      .from('levantamientos')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('levantamientos').delete().eq('id', id);
    if (error) throw error;
  },

  async getRecientes(limit = 5): Promise<Levantamiento[]> {
    const { data, error } = await supabase
      .from('levantamientos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },
};
