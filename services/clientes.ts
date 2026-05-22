import { supabase } from '@/lib/supabase';
import type { Cliente } from '@/types';

export const clientesService = {
  async getAll(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre_cliente');
    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async create(cliente: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert([{ ...cliente, estado: 'activo' }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .update({ ...cliente, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) throw error;
  },

  async search(query: string): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .or(`nombre_cliente.ilike.%${query}%,empresa.ilike.%${query}%,rut.ilike.%${query}%`)
      .eq('estado', 'activo')
      .limit(10);
    if (error) throw error;
    return data || [];
  },
};
