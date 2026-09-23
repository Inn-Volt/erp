import { supabase } from '@/lib/supabase';
import type { Agendamiento } from '@/types/agenda';

const SELECT = '*, clientes(*), solicitudes:solicitud_id(id,folio)';

type NuevoAgendamiento = Omit<
  Agendamiento,
  'id' | 'folio' | 'clientes' | 'solicitudes' | 'created_at' | 'updated_at'
>;

export const agendaService = {
  async getAll(): Promise<Agendamiento[]> {
    const { data, error } = await supabase
      .from('agendamientos')
      .select(SELECT)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data || []) as Agendamiento[];
  },

  async create(payload: NuevoAgendamiento): Promise<Agendamiento> {
    const { data, error } = await supabase
      .from('agendamientos')
      .insert([payload])
      .select(SELECT)
      .single();
    if (error) throw error;
    return data as Agendamiento;
  },

  async update(id: string, patch: Partial<Agendamiento>): Promise<Agendamiento> {
    const { data, error } = await supabase
      .from('agendamientos')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return data as Agendamiento;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('agendamientos').delete().eq('id', id);
    if (error) throw error;
  },
};
