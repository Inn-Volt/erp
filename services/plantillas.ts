import { supabase } from '@/lib/supabase';
import type { PlantillaCotizacion } from '@/types';

type NuevaPlantilla = Omit<PlantillaCotizacion, 'id' | 'created_at' | 'updated_at'>;

/** Plantillas de textos por tipo de servicio (descripción, garantía, condiciones). */
export const plantillasService = {
  async getAll(): Promise<PlantillaCotizacion[]> {
    const { data, error } = await supabase
      .from('plantillas_cotizacion')
      .select('*')
      .order('nombre');
    if (error) throw error;
    return (data || []) as PlantillaCotizacion[];
  },

  async create(p: NuevaPlantilla): Promise<PlantillaCotizacion> {
    const { data, error } = await supabase.from('plantillas_cotizacion').insert([p]).select().single();
    if (error) throw error;
    return data as PlantillaCotizacion;
  },

  async update(id: string, p: Partial<NuevaPlantilla>): Promise<void> {
    const { error } = await supabase.from('plantillas_cotizacion').update(p).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('plantillas_cotizacion').delete().eq('id', id);
    if (error) throw error;
  },
};
