'use client';

/**
 * Equipo y mano de obra (fase 20): las fichas del personal interno (sueldo y jornada) y de los
 * externos (valor por jornada y boleta de honorarios), y lo que se registra día a día en cada
 * trabajo. El costo de cada registro lo calcula la base; las cuentas para mostrar antes de guardar
 * están en lib/manoObra.ts.
 */

import { supabase } from '@/lib/supabase';

export type TipoTrabajador = 'interno' | 'externo';
export interface Trabajador {
  id: string; tipo: TipoTrabajador; nombre: string; rut: string | null; oficio: string | null; usuario_id: string | null; activo: boolean;
  sueldo_bruto: number; aportes_pct: number; dias_mes: number; horas_dia: number; colacion_dia: number; movilizacion_dia: number; otros_dia: number;
  valor_jornada: number; honorarios: boolean; nota: string | null;
}
export type NuevoTrabajador = Omit<Trabajador, 'id'>;

/** Para registrar (sin sueldos): el costo del día solo viene para quien ve costos. */
export interface TrabajadorElegible {
  id: string; tipo: TipoTrabajador; nombre: string; oficio: string | null; horas_dia: number; valor_jornada: number; honorarios: boolean;
  es_yo: boolean; costo_dia: number | null;
}

export interface RegistroManoObra {
  id: string; cotizacion_id: string | null; partida_id: string | null; fecha: string; trabajador_id: string | null; tipo: TipoTrabajador;
  nombre: string; horas: number | null; monto_liquido: number | null; honorarios: boolean; retencion_pct: number; costo: number;
  pagado: boolean; fecha_pago: string | null; documento: string | null; nota: string | null; created_at: string;
}
export type NuevoRegistro = Pick<RegistroManoObra, 'cotizacion_id' | 'fecha' | 'tipo'> &
  Partial<Pick<RegistroManoObra, 'partida_id' | 'trabajador_id' | 'nombre' | 'horas' | 'monto_liquido' | 'honorarios' | 'pagado' | 'documento' | 'nota'>>;

export const fichaVacia = (tipo: TipoTrabajador): NuevoTrabajador => ({
  tipo, nombre: '', rut: null, oficio: null, usuario_id: null, activo: true,
  sueldo_bruto: 0, aportes_pct: 0, dias_mes: 22, horas_dia: 9, colacion_dia: 0, movilizacion_dia: 0, otros_dia: 0,
  valor_jornada: 0, honorarios: true, nota: null,
});

const lanzar = (error: { message: string } | null) => { if (error) throw error; };

export const manoObraService = {
  async equipo(): Promise<Trabajador[]> {
    const { data, error } = await supabase.from('trabajadores').select('*').order('activo', { ascending: false }).order('nombre');
    lanzar(error);
    return (data || []) as Trabajador[];
  },
  async guardarFicha(id: string | null, t: NuevoTrabajador) {
    const fila = { ...t, nombre: t.nombre.trim(), rut: t.rut?.trim() || null, oficio: t.oficio?.trim() || null, nota: t.nota?.trim() || null };
    const { error } = id ? await supabase.from('trabajadores').update(fila).eq('id', id) : await supabase.from('trabajadores').insert([fila]);
    lanzar(error);
  },
  async retencion(): Promise<number | null> {
    const { data } = await supabase.from('ajustes_cotizacion').select('retencion_honorarios').eq('id', 1).maybeSingle();
    const v = (data as { retencion_honorarios?: number } | null)?.retencion_honorarios;
    return v === undefined || v === null ? null : Number(v);
  },
  async guardarRetencion(pct: number) {
    const { error } = await supabase.from('ajustes_cotizacion').update({ retencion_honorarios: pct }).eq('id', 1);
    lanzar(error);
  },

  async elegibles(): Promise<TrabajadorElegible[]> {
    const { data, error } = await supabase.rpc('trabajadores_para_registrar');
    if (error) return [];
    return ((data || []) as TrabajadorElegible[]).map(t => ({ ...t, horas_dia: Number(t.horas_dia), valor_jornada: Number(t.valor_jornada),
      costo_dia: t.costo_dia === null ? null : Number(t.costo_dia) }));
  },
  async registros(cotId: string): Promise<RegistroManoObra[]> {
    const { data, error } = await supabase.from('mano_obra').select('*').eq('cotizacion_id', cotId)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (error) return [];
    return (data || []) as RegistroManoObra[];
  },
  async registrar(filas: NuevoRegistro[]) {
    if (!filas.length) return;
    // Lo que una fila no trae toma el valor por omisión de la columna (no NULL).
    const { error } = await supabase.from('mano_obra').insert(filas, { defaultToNull: false });
    lanzar(error);
  },
  async marcarPagado(id: string, pagado: boolean, documento?: string | null) {
    const { error } = await supabase.from('mano_obra').update({ pagado, ...(documento !== undefined ? { documento: documento?.trim() || null } : {}) }).eq('id', id);
    lanzar(error);
  },
  async eliminar(id: string) {
    const { error } = await supabase.from('mano_obra').delete().eq('id', id);
    lanzar(error);
  },
};
