import { supabase } from '@/lib/supabase';
import type { Solicitud, EstadoSolicitud, AnalisisIA, HistorialEntry } from '@/types/solicitud';

const SELECT = '*, clientes(*), cotizaciones:cotizacion_id(id,folio,estado)';

function nuevaEntrada(texto: string): HistorialEntry {
  return { fecha: new Date().toISOString(), texto };
}

export const solicitudesService = {
  async getAll(): Promise<Solicitud[]> {
    const { data, error } = await supabase
      .from('solicitudes')
      .select(SELECT)
      .order('folio', { ascending: false });
    if (error) throw error;
    return (data || []) as Solicitud[];
  },

  async getById(id: string): Promise<Solicitud | null> {
    const { data, error } = await supabase
      .from('solicitudes')
      .select(SELECT)
      .eq('id', id)
      .single();
    if (error) return null;
    return data as Solicitud;
  },

  async create(
    payload: Omit<Solicitud, 'id' | 'folio' | 'clientes' | 'cotizaciones' | 'analisis_ia' | 'cotizacion_id' | 'historial' | 'created_at' | 'updated_at'>,
  ): Promise<Solicitud> {
    const { data, error } = await supabase
      .from('solicitudes')
      .insert([{ ...payload, historial: [nuevaEntrada('Solicitud creada.')] }])
      .select(SELECT)
      .single();
    if (error) throw error;
    return data as Solicitud;
  },

  async update(id: string, patch: Partial<Solicitud>): Promise<Solicitud> {
    const { data, error } = await supabase
      .from('solicitudes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return data as Solicitud;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('solicitudes').delete().eq('id', id);
    if (error) throw error;
  },

  /** Agrega una entrada al historial de forma atómica (lee, agrega, guarda). */
  async addHistorial(id: string, texto: string, historialActual: HistorialEntry[]): Promise<HistorialEntry[]> {
    const nuevo = [...(historialActual || []), nuevaEntrada(texto)];
    const { error } = await supabase.from('solicitudes').update({ historial: nuevo }).eq('id', id);
    if (error) throw error;
    return nuevo;
  },

  /** Cambia el estado y registra el cambio en la bitácora. */
  async updateEstado(id: string, estado: EstadoSolicitud, historialActual: HistorialEntry[], etiqueta?: string): Promise<Solicitud> {
    const historial = [...(historialActual || []), nuevaEntrada(etiqueta || `Estado → ${estado}.`)];
    return this.update(id, { estado, historial });
  },

  /** Guarda el resultado del análisis de IA y marca la solicitud como analizada. */
  async guardarAnalisis(id: string, analisis: AnalisisIA, historialActual: HistorialEntry[], reanalisis: boolean): Promise<Solicitud> {
    const faltaInfo = analisis.informacion_faltante.length > 0;
    const historial = [...(historialActual || []), nuevaEntrada(reanalisis ? 'IA reanalizó la solicitud.' : 'IA analizó la solicitud.')];
    return this.update(id, {
      analisis_ia: analisis,
      estado: faltaInfo ? 'PENDIENTE_INFO' : 'LISTA_COTIZAR',
      historial,
    });
  },

  /** Vincula la cotización creada a la solicitud (relación directa). */
  async vincularCotizacion(id: string, cotizacionId: number | string, folio: number, historialActual: HistorialEntry[]): Promise<Solicitud> {
    const historial = [...(historialActual || []), nuevaEntrada(`Cotización #${String(folio).padStart(4, '0')} creada.`)];
    return this.update(id, {
      cotizacion_id: String(cotizacionId),
      estado: 'COTIZACION_GENERADA',
      historial,
    });
  },
};
