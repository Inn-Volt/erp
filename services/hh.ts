'use client';

/**
 * Calculadora HH (fase 23): cargos, tarifas, parámetros, trabajos tipo, el equipo HH y los cálculos
 * guardados (tablas hh_). Módulo independiente: no lee ni escribe nada del cotizador. Las cuentas
 * están en lib/hh/. La seguridad la pone la base (RLS con hh.ver y hh.configurar): sin
 * hh.configurar, cada uno solo recibe su persona y su equipo hacia abajo, y sus cálculos y los de
 * su equipo.
 */

import { supabase } from '@/lib/supabase';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { PARAMETROS_INICIALES, type CargoHH, type MonedaHH, type ParametrosHH } from '@/lib/hh/calculo';
import type { FuenteIndicador, IndicadoresDia } from '@/lib/hh/indicadores';
import type { FilaLineaHH } from '@/lib/hh/lineas';
import type { EmpresaInfo } from '@/types';

export interface TipoTareaHH { clave: string; nombre: string; multiplicador: number; descripcion: string | null; activo: boolean; orden: number }
export interface TrabajoTipoHH {
  id: string; categoria: string; nombre: string; unidad: string | null; hh_referencia: number;
  cargo_principal_id: string; cargo_apoyo_id: string | null; hh_apoyo: number; tipo_tarea_clave: string | null;
  precio_mercado_ref: string | null; duracion_equipo: string | null; notas: string | null; activo: boolean; orden: number;
}
/** jefe_id: la persona de la que está a cargo (el equipo hacia abajo de cada uno). */
export interface PersonaHH { id: string; nombre: string; profile_id: string | null; jefe_id: string | null; activo: boolean }
export interface PersonaCargoHH {
  id: string; persona_id: string; cargo_id: string; tarifa_base_propia: number | null; predeterminado: boolean; activo: boolean;
}
type ParametrosBD = ParametrosHH & { updated_at: string | null };
export interface CatalogoHH {
  parametros: ParametrosBD;
  cargos: CargoHH[];
  tipos: TipoTareaHH[];
  trabajos: TrabajoTipoHH[];
  personas: PersonaHH[];
  personaCargos: PersonaCargoHH[];
}
export interface IndicadorGuardado { fecha: string; uf: number; usd: number; fuente: FuenteIndicador; created_at: string }

/** Cabecera de un cálculo guardado. */
export interface CalculoHHBD {
  id: string; nombre: string; cliente_texto: string | null; notas: string | null; fecha: string;
  uf_usada: number; usd_usada: number; uf_fecha: string | null; uf_fuente: string | null; usd_fecha: string | null; usd_fuente: string | null;
  parametros: Partial<ParametrosHH>; urgencia: boolean; traslado_uf: number; materiales_clp: number; margen_materiales: number;
  validez_dias: number; neto_clp: number; neto_uf: number; iva_clp: number; total_clp: number;
  created_by: string | null; created_at: string; updated_at: string;
}
export type CalculoNuevo = Omit<CalculoHHBD, 'id' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string };

/** ¿Falta correr supabase_fase23_calculo_hh.sql? */
export const faltaFase23 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42P01' || x.code === 'PGRST205' || x.code === 'PGRST202' || /hh_[a-z_]+.*(does not exist|could not find|schema cache)|could not find the (table|function).*hh_/i.test(x.message || ''));
};

/** El error de la base, dicho para quien usa la pantalla. */
export function mensajeHH(e: unknown, porDefecto = 'No se pudo guardar.'): string {
  const x = e as { code?: string; message?: string } | null;
  if (x?.code === '23503') return 'Ya se usa (en un trabajo tipo o en un cálculo guardado): desactívalo en vez de borrarlo.';
  if (x?.code === '23505') return 'Ya existe uno con ese nombre.';
  if (x?.code === '42501' && !/[áéíóú]/.test(x.message || '')) return 'No tienes permiso para hacer esto.';
  if (x?.code === '23514' && /check constraint/i.test(x.message || '')) return 'Hay un valor fuera de rango.';
  return x?.message || porDefecto;
}

const lanzar = (error: unknown) => { if (error) throw error; };
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const numero = (v: unknown, d = 0) => num(v) ?? d;

const cargo = (c: Record<string, unknown>): CargoHH => ({
  ...(c as unknown as CargoHH), tarifa_base: numero(c.tarifa_base), mercado_min: num(c.mercado_min), mercado_max: num(c.mercado_max),
  sueldo_mercado_clp: num(c.sueldo_mercado_clp), moneda_base: (c.moneda_base as MonedaHH) || 'UF',
});
const parametros = (p: Record<string, unknown> | null): ParametrosBD => {
  const r = { ...PARAMETROS_INICIALES, updated_at: (p?.updated_at as string) || null } as ParametrosBD;
  for (const k of Object.keys(PARAMETROS_INICIALES) as (keyof ParametrosHH)[]) if (p && p[k] !== null && p[k] !== undefined) r[k] = Number(p[k]);
  return r;
};
const calculo = (c: Record<string, unknown>): CalculoHHBD => ({
  ...(c as unknown as CalculoHHBD), uf_usada: numero(c.uf_usada), usd_usada: numero(c.usd_usada), traslado_uf: numero(c.traslado_uf),
  materiales_clp: numero(c.materiales_clp), margen_materiales: numero(c.margen_materiales), neto_clp: numero(c.neto_clp),
  neto_uf: numero(c.neto_uf), iva_clp: numero(c.iva_clp), total_clp: numero(c.total_clp), validez_dias: numero(c.validez_dias, 15),
  parametros: (c.parametros as Partial<ParametrosHH>) || {},
});

export const hhService = {
  async catalogo(): Promise<CatalogoHH> {
    const [p, c, t, tr, pe, pc] = await Promise.all([
      supabase.from('hh_parametros').select('*').eq('id', 1).maybeSingle(),
      supabase.from('hh_cargos').select('*').order('orden').order('nombre'),
      supabase.from('hh_tipos_tarea').select('*').order('orden').order('nombre'),
      supabase.from('hh_trabajos_tipo').select('*').order('categoria').order('orden').order('nombre'),
      supabase.from('hh_personas').select('id, nombre, profile_id, jefe_id, activo').order('nombre'),
      supabase.from('hh_persona_cargos').select('id, persona_id, cargo_id, tarifa_base_propia, predeterminado, activo'),
    ]);
    for (const r of [p, c, t, tr, pe, pc]) lanzar(r.error);
    return {
      parametros: parametros(p.data as Record<string, unknown> | null),
      cargos: (c.data || []).map(cargo),
      tipos: ((t.data || []) as TipoTareaHH[]).map(x => ({ ...x, multiplicador: numero(x.multiplicador, 1) })),
      trabajos: ((tr.data || []) as TrabajoTipoHH[]).map(x => ({ ...x, hh_referencia: numero(x.hh_referencia), hh_apoyo: numero(x.hh_apoyo) })),
      personas: (pe.data || []) as PersonaHH[],
      personaCargos: ((pc.data || []) as PersonaCargoHH[]).map(x => ({ ...x, tarifa_base_propia: num(x.tarifa_base_propia) })),
    };
  },

  async guardarParametros(p: ParametrosHH) {
    const { error } = await supabase.from('hh_parametros').update(p).eq('id', 1);
    lanzar(error);
  },

  async guardarCargo(c: Partial<CargoHH>) {
    const { id, ...datos } = c;
    const { error } = id ? await supabase.from('hh_cargos').update(datos).eq('id', id) : await supabase.from('hh_cargos').insert(datos);
    lanzar(error);
  },
  async eliminarCargo(id: string) {
    const { error } = await supabase.from('hh_cargos').delete().eq('id', id);
    lanzar(error);
  },

  async guardarTipo(t: TipoTareaHH, nuevo: boolean) {
    const { clave, ...datos } = t;
    const { error } = nuevo ? await supabase.from('hh_tipos_tarea').insert(t) : await supabase.from('hh_tipos_tarea').update(datos).eq('clave', clave);
    lanzar(error);
  },
  async eliminarTipo(clave: string) {
    const { error } = await supabase.from('hh_tipos_tarea').delete().eq('clave', clave);
    lanzar(error);
  },

  async guardarTrabajo(t: Partial<TrabajoTipoHH>) {
    const { id, ...datos } = t;
    const { error } = id ? await supabase.from('hh_trabajos_tipo').update(datos).eq('id', id) : await supabase.from('hh_trabajos_tipo').insert(datos);
    lanzar(error);
  },
  async eliminarTrabajo(id: string) {
    const { error } = await supabase.from('hh_trabajos_tipo').delete().eq('id', id);
    lanzar(error);
  },

  async guardarPersona(p: Partial<PersonaHH>) {
    const { id, ...datos } = p;
    const { error } = id ? await supabase.from('hh_personas').update(datos).eq('id', id) : await supabase.from('hh_personas').insert(datos);
    lanzar(error);
  },

  /** Asignar un cargo a una persona (o cambiar la asignación). Sin hh.configurar: solo los suyos y sin tarifa. */
  async guardarPersonaCargo(pc: Partial<PersonaCargoHH>) {
    const { id, ...datos } = pc;
    const { error } = id ? await supabase.from('hh_persona_cargos').update(datos).eq('id', id) : await supabase.from('hh_persona_cargos').insert(datos);
    lanzar(error);
  },
  async eliminarPersonaCargo(id: string) {
    const { error } = await supabase.from('hh_persona_cargos').delete().eq('id', id);
    lanzar(error);
  },

  async usuariosParaVincular(): Promise<{ id: string; nombre: string; email: string | null }[]> {
    const { data, error } = await supabase.rpc('hh_usuarios_para_vincular');
    lanzar(error);
    return (data || []) as { id: string; nombre: string; email: string | null }[];
  },

  /** La UF y el dólar del día (mindicador, guardado o respaldo), con su fuente y fecha. */
  async indicadores(): Promise<IndicadoresDia> {
    const r = await fetchConSesion('/api/hh/indicadores', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j?.error || 'No se pudo leer la UF del día.'), { code: j?.code });
    return j as IndicadoresDia;
  },
  /** Fijar a mano la UF y el dólar de un día (solo quien configura). */
  async fijarIndicador(fecha: string, uf: number, usd: number) {
    const { error } = await supabase.from('hh_indicadores').upsert({ fecha, uf, usd, fuente: 'manual' }, { onConflict: 'fecha' });
    lanzar(error);
  },
  async ultimosIndicadores(): Promise<IndicadorGuardado[]> {
    const { data, error } = await supabase.from('hh_indicadores').select('fecha, uf, usd, fuente, created_at').order('fecha', { ascending: false }).limit(10);
    lanzar(error);
    return ((data || []) as IndicadorGuardado[]).map(x => ({ ...x, uf: Number(x.uf), usd: Number(x.usd) }));
  },

  async calculos(): Promise<CalculoHHBD[]> {
    const { data, error } = await supabase.from('hh_calculos').select('*').order('created_at', { ascending: false }).limit(200);
    lanzar(error);
    return (data || []).map(calculo);
  },
  async calculo(id: string): Promise<{ cabecera: CalculoHHBD; lineas: FilaLineaHH[] }> {
    const [c, l] = await Promise.all([
      supabase.from('hh_calculos').select('*').eq('id', id).single(),
      supabase.from('hh_calculo_lineas').select('*').eq('calculo_id', id).order('orden'),
    ]);
    lanzar(c.error); lanzar(l.error);
    return { cabecera: calculo(c.data as Record<string, unknown>), lineas: (l.data || []) as FilaLineaHH[] };
  },
  /** Guarda la cabecera y las líneas en una sola transacción; devuelve el id. */
  async guardarCalculo(cabecera: CalculoNuevo, lineas: FilaLineaHH[]): Promise<string> {
    const { data, error } = await supabase.rpc('hh_guardar_calculo', { p_calculo: cabecera, p_lineas: lineas });
    lanzar(error);
    return data as string;
  },
  async eliminarCalculo(id: string) {
    const { data, error } = await supabase.from('hh_calculos').delete().eq('id', id).select('id');
    lanzar(error);
    if (!data?.length) throw new Error('Solo puedes eliminar tus propios cálculos.');
  },

  /** La empresa emisora para el PDF (la del usuario o la primera). Solo lectura. */
  async empresa(): Promise<EmpresaInfo | null> {
    const { data: u } = await supabase.auth.getUser();
    const [perfil, empresas] = await Promise.all([
      u.user ? supabase.from('profiles').select('empresa_id').eq('id', u.user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('empresas').select('*').order('nombre'),
    ]);
    const lista = (empresas.data || []) as EmpresaInfo[];
    const id = (perfil.data as { empresa_id?: string | null } | null)?.empresa_id;
    return lista.find(e => e.id === id) || lista.find(e => /innvolt/i.test(e.nombre)) || lista[0] || null;
  },
};
