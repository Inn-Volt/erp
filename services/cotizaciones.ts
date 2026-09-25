import { supabase } from '@/lib/supabase';
import type { Cotizacion, EstadoCotizacion, KpiData } from '@/types';
import { DIAS_SEGUIMIENTO } from '@/types';
import { solicitudesService } from '@/services/solicitudes';

/** Mensaje claro cuando falta ejecutar el SQL de mejoras comerciales. */
const errColumna = (e: { message?: string } | null) =>
  e && /column|schema cache/i.test(e.message || '')
    ? new Error('Falta ejecutar supabase_mejoras_comerciales.sql en Supabase.')
    : e;

/** Días desde el último movimiento comercial (seguimiento, envío o creación). */
export function diasSinMovimiento(c: Pick<Cotizacion, 'seguimiento_at' | 'enviada_at' | 'created_at'>): number {
  const ref = c.seguimiento_at || c.enviada_at || c.created_at;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
}

/** Pendiente y sin movimiento hace DIAS_SEGUIMIENTO días o más → hay que llamar. */
export function necesitaSeguimiento(c: Pick<Cotizacion, 'estado' | 'seguimiento_at' | 'enviada_at' | 'created_at'>): boolean {
  return c.estado === 'Pendiente' && diasSinMovimiento(c) >= DIAS_SEGUIMIENTO;
}

/** Link público de la cotización para el cliente (/c/<token>). Se arma en el navegador. */
export function linkPublico(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/c/${token}`;
}

/** Estados que significan venta concretada. */
export const ESTADOS_VENTA: EstadoCotizacion[] = ['Aceptado', 'Realizado', 'Entregado'];

/**
 * Refleja en la solicitud de origen lo que pasó con su cotización:
 *   · venta (Aceptado/Realizado/Entregado) → solicitud CERRADA + historial
 *   · Rechazado                            → queda registrado en el historial
 */
async function sincronizarSolicitud(cotizacionId: string, estado: EstadoCotizacion): Promise<void> {
  const { data } = await supabase
    .from('cotizaciones')
    .select('folio, solicitud_id')
    .eq('id', cotizacionId)
    .single();
  if (!data?.solicitud_id) return;
  const sol = await solicitudesService.getById(data.solicitud_id);
  if (!sol) return;
  const folio = `#${String(data.folio).padStart(4, '0')}`;
  if (ESTADOS_VENTA.includes(estado)) {
    if (sol.estado === 'CERRADA') return;
    await solicitudesService.updateEstado(sol.id, 'CERRADA', sol.historial, `Cotización ${folio} ${estado.toLowerCase()} — venta concretada.`);
  } else if (estado === 'Rechazado') {
    await solicitudesService.addHistorial(sol.id, `Cotización ${folio} rechazada por el cliente.`, sol.historial);
  }
}

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

  /**
   * Cambia el estado. Al rechazar se puede guardar el motivo de pérdida. Si el
   * SQL de mejoras aún no se ejecutó, el cambio de estado igual se aplica.
   */
  async updateEstado(
    id: string,
    estado: EstadoCotizacion,
    extra: { motivo_perdida?: string | null; motivo_perdida_nota?: string | null } = {},
  ): Promise<void> {
    const ahora = new Date().toISOString();
    let { error } = await supabase.from('cotizaciones').update({ estado, ...extra, updated_at: ahora }).eq('id', id);
    if (error && Object.keys(extra).length && /column|schema cache/i.test(error.message)) {
      ({ error } = await supabase.from('cotizaciones').update({ estado, updated_at: ahora }).eq('id', id));
    }
    if (error) throw error;
    // Cierra el ciclo Solicitud → Venta (best-effort: nunca bloquea el cambio de estado).
    try { await sincronizarSolicitud(id, estado); } catch { /* sin solicitud o sin columna */ }
  },

  /** Registra que se hizo un seguimiento (llamada, WhatsApp, correo). */
  async registrarSeguimiento(id: string, seguimientosActuales = 0): Promise<void> {
    const { error } = await supabase
      .from('cotizaciones')
      .update({ seguimiento_at: new Date().toISOString(), seguimientos: (seguimientosActuales || 0) + 1 })
      .eq('id', id);
    if (error) throw errColumna(error);
  },

  /** Marca la cotización como enviada al cliente (solo la primera vez). */
  async marcarEnviada(id: string): Promise<void> {
    const { error } = await supabase
      .from('cotizaciones')
      .update({ enviada_at: new Date().toISOString() })
      .eq('id', id)
      .is('enviada_at', null);
    if (error) throw errColumna(error);
  },

  /** Cotizaciones pendientes (para la lista "Por seguir"). */
  async getPendientes(): Promise<Cotizacion[]> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*, clientes(*)')
      .eq('estado', 'Pendiente')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  /** Conteo de motivos de pérdida. {} si aún no existe la columna. */
  async getMotivosPerdida(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('motivo_perdida')
      .eq('estado', 'Rechazado');
    if (error) return {};
    const conteo: Record<string, number> = {};
    for (const r of data || []) {
      const m = (r as { motivo_perdida: string | null }).motivo_perdida || 'Sin motivo registrado';
      conteo[m] = (conteo[m] || 0) + 1;
    }
    return conteo;
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

  /**
   * KPIs comerciales calculados sobre las cotizaciones (en CLP, sin mezclar UF).
   * Antes "venta acumulada" sumaba todo lo no rechazado, incluyendo cotizaciones
   * PENDIENTES que aún no son venta (inflaba la cifra y duplicaba el pipeline).
   */
  async getKpis(): Promise<KpiData> {
    // Paginado: Supabase devuelve como máximo 1.000 filas por consulta.
    type Fila = { total: number; total_clp: number | null; estado: EstadoCotizacion; created_at: string };
    const all: Fila[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('total, total_clp, estado, created_at')
        .range(desde, desde + 999);
      if (error) throw error;
      all.push(...((data || []) as Fila[]));
      if (!data || data.length < 1000) break;
    }
    const montoCLP = (r: { total?: number; total_clp?: number | null }) => r.total_clp ?? r.total ?? 0;
    const ventas = all.filter(r => ESTADOS_VENTA.includes(r.estado));
    const pendientes = all.filter(r => r.estado === 'Pendiente');
    const rechazadas = all.filter(r => r.estado === 'Rechazado');
    const ahora = new Date();
    const esDelMes = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
    };
    const ventaTotal = ventas.reduce((a, r) => a + montoCLP(r), 0);
    const decididas = ventas.length + rechazadas.length;
    return {
      total_cotizaciones: all.length,
      venta_acumulada: ventaTotal,
      pendiente_pipeline: pendientes.reduce((a, r) => a + montoCLP(r), 0),
      aceptadas: ventas.length,
      venta_mes: ventas.filter(r => esDelMes(r.created_at)).reduce((a, r) => a + montoCLP(r), 0),
      rechazadas: rechazadas.length,
      pendientes: pendientes.length,
      tasa_cierre: decididas > 0 ? Math.round((ventas.length / decididas) * 100) : null,
      ticket_promedio: ventas.length > 0 ? Math.round(ventaTotal / ventas.length) : 0,
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
