'use client';

/**
 * Equipo y mano de obra (fases 20 y 22): las fichas del personal interno (sueldo y jornada) y de los
 * externos (valor por jornada y boleta de honorarios), y lo que se registra en cada trabajo: días de
 * mano de obra u horas de servicio, de un interno, un externo o un pago líquido, con su línea del
 * presupuesto. El costo de cada registro lo calcula la base; las cuentas para mostrar antes de
 * guardar están en lib/manoObra.ts y lib/analisisProyecto.ts.
 */

import { supabase } from '@/lib/supabase';
import type { ModalidadPago } from '@/lib/controlProyecto';

export type TipoTrabajador = 'interno' | 'externo';
export interface Trabajador {
  id: string; tipo: TipoTrabajador; nombre: string; rut: string | null; oficio: string | null; usuario_id: string | null; activo: boolean;
  /** Interno: líquido mensual (sin colación ni movilización) y sus descuentos; el bruto se calcula. */
  sueldo_liquido: number; afp_pct: number; salud_pct: number; cesantia_pct: number; otros_descuentos: number;
  aportes_pct: number; dias_mes: number; horas_dia: number; colacion_dia: number; movilizacion_dia: number; otros_dia: number;
  valor_jornada: number; honorarios: boolean; nota: string | null;
}
export type NuevoTrabajador = Omit<Trabajador, 'id'>;

/** Para registrar (sin sueldos): el costo del día solo viene para quien ve costos. */
export interface TrabajadorElegible {
  id: string; tipo: TipoTrabajador; nombre: string; oficio: string | null; horas_dia: number; valor_jornada: number; honorarios: boolean;
  es_yo: boolean; costo_dia: number | null;
}

export interface RegistroManoObra {
  id: string; cotizacion_id: string | null; partida_id: string | null; fecha: string; trabajador_id: string | null; tipo: ModalidadPago;
  nombre: string; horas: number | null; jornadas: number | null; monto_liquido: number | null; honorarios: boolean; retencion_pct: number; costo: number;
  pagado: boolean; fecha_pago: string | null; documento: string | null; nota: string | null; created_at: string;
  clase: 'mano_obra' | 'servicio'; presupuesto_linea_id: string | null;
}
type CamposRegistro = 'partida_id' | 'trabajador_id' | 'nombre' | 'horas' | 'jornadas' | 'monto_liquido' | 'honorarios' | 'pagado' | 'documento' | 'nota' | 'clase' | 'presupuesto_linea_id';
export type NuevoRegistro = Pick<RegistroManoObra, 'cotizacion_id' | 'fecha' | 'tipo'> & Partial<Pick<RegistroManoObra, CamposRegistro>>;

export const fichaVacia = (tipo: TipoTrabajador): NuevoTrabajador => ({
  tipo, nombre: '', rut: null, oficio: null, usuario_id: null, activo: true,
  sueldo_liquido: 0, afp_pct: 11.5, salud_pct: 7, cesantia_pct: 0.6, otros_descuentos: 0,
  aportes_pct: 0, dias_mes: 22, horas_dia: 9, colacion_dia: 0, movilizacion_dia: 0, otros_dia: 0,
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
  /** Lo registrado en un trabajo (el técnico solo ve lo suyo). */
  async registros(cotId: string): Promise<RegistroManoObra[]> {
    const { data, error } = await supabase.from('mano_obra').select('*').eq('cotizacion_id', cotId)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false });
    lanzar(error);
    return (data || []) as RegistroManoObra[];
  },
  async registrar(filas: NuevoRegistro[]) {
    if (!filas.length) return;
    // Lo que una fila no trae toma el valor por omisión de la columna (no NULL).
    const { error } = await supabase.from('mano_obra').insert(filas, { defaultToNull: false });
    lanzar(error);
  },
  /** Corrige un registro (la base vuelve a calcular su costo si cambian días, horas, monto, persona o tipo). */
  async corregir(id: string, cambios: Partial<NuevoRegistro>) {
    const { error } = await supabase.from('mano_obra').update(cambios).eq('id', id);
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
