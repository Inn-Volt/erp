'use client';

/**
 * Fase 5 (TecApp): visitas y bitácora de la OT, plantillas de informe, anticipos,
 * pedidos de material, catastro, avances de tareas, proyectos, personas y traslados.
 * Tablas en supabase_fase5_tecapp_operacion.sql.
 */

import { supabase } from '@/lib/supabase';

const lanzar = (e: unknown) => {
  if (!e) return;
  throw new Error((e as { message?: string }).message || 'Error');
};
export const faltaFase5 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42P01' || x.code === 'PGRST205' || x.code === 'PGRST202' || x.code === '42703' ||
    /does not exist|could not find|schema cache/i.test(x.message || ''));
};

// ── Visitas ──
export interface Visita {
  id: string; ot_id: string; fecha: string; hora_inicio: string | null; hora_fin: string | null; tecnicos: string[];
  estado: 'programada' | 'realizada' | 'cancelada'; nota: string | null; agendamiento_id: string | null; created_at: string;
  ordenes_trabajo?: { id: string; folio: number; titulo: string; direccion: string | null; estado: string; clientes?: { nombre_cliente: string } | null } | null;
}
export const visitasService = {
  async deOT(otId: string): Promise<Visita[]> {
    const { data, error } = await supabase.from('ot_visitas').select('*').eq('ot_id', otId).order('fecha').order('hora_inicio');
    if (error) throw error;
    return (data || []) as Visita[];
  },
  async mias(uid: string, desde: string, hasta: string): Promise<Visita[]> {
    const { data, error } = await supabase.from('ot_visitas')
      .select('*, ordenes_trabajo(id, folio, titulo, direccion, estado, clientes(nombre_cliente))')
      .contains('tecnicos', [uid]).gte('fecha', desde).lte('fecha', hasta).neq('estado', 'cancelada')
      .order('fecha').order('hora_inicio');
    if (error) throw error;
    return (data || []) as Visita[];
  },
  async crear(v: Partial<Visita>) { const { error } = await supabase.from('ot_visitas').insert(v); lanzar(error); },
  async actualizar(id: string, patch: Partial<Visita>) { const { error } = await supabase.from('ot_visitas').update(patch).eq('id', id); lanzar(error); },
  async eliminar(id: string) { const { error } = await supabase.from('ot_visitas').delete().eq('id', id); lanzar(error); },
};

// ── Plantillas de informe ──
export interface PlantillaInforme { id: string; nombre: string; tipo_servicio: string | null; checklist: { texto: string }[]; activa: boolean }
export const plantillasInformeService = {
  async listar(): Promise<PlantillaInforme[]> {
    const { data, error } = await supabase.from('informe_plantillas').select('*').eq('activa', true).order('nombre');
    if (error) throw error;
    return (data || []) as PlantillaInforme[];
  },
  async guardar(p: Partial<PlantillaInforme>) {
    const { error } = p.id ? await supabase.from('informe_plantillas').update(p).eq('id', p.id) : await supabase.from('informe_plantillas').insert(p);
    lanzar(error);
  },
};

// ── Anticipos ──
export interface Anticipo {
  id: string; folio: number; usuario_id: string; monto: number; fecha: string; motivo: string | null; ot_id: string | null;
  cotizacion_id?: string | null; proyecto_id?: string | null;
  estado: 'entregado' | 'rendido' | 'anulado'; entregado_por: string | null; motivo_anulacion: string | null; created_at: string;
  saldo?: number; rendido?: number;
}
export const anticiposService = {
  async listar(soloDe: string | null): Promise<Anticipo[]> {
    let q = supabase.from('anticipos').select('*').order('fecha', { ascending: false }).limit(300);
    if (soloDe) q = q.eq('usuario_id', soloDe);
    const [{ data, error }, s] = await Promise.all([q, supabase.from('anticipo_saldos').select('*')]);
    if (error) throw error;
    const saldos = new Map(((s.data || []) as { anticipo_id: string; saldo: number; rendido: number }[]).map(x => [x.anticipo_id, x]));
    return ((data || []) as Anticipo[]).map(a => ({ ...a, saldo: Number(saldos.get(a.id)?.saldo ?? a.monto), rendido: Number(saldos.get(a.id)?.rendido ?? 0) }));
  },
  async entregar(a: Partial<Anticipo>) { const { error } = await supabase.from('anticipos').insert(a); lanzar(error); },
  async anular(id: string, motivo: string) { const { error } = await supabase.from('anticipos').update({ estado: 'anulado', motivo_anulacion: motivo }).eq('id', id); lanzar(error); },
};

// ── Pedidos de material ──
export interface PedidoLinea { id: string; pedido_id: string; articulo_id: string; cantidad: number; despachada: number; catalogo_items?: { descripcion: string; unidad: string; codigo: string | null } | null }
export interface Pedido {
  id: string; folio: number; ot_id: string | null; pedido_por: string | null; bodega_origen_id: string | null; bodega_destino_id: string | null;
  para_fecha: string | null; estado: 'pendiente' | 'parcial' | 'despachado' | 'rechazado' | 'cancelado'; nota: string | null;
  motivo_rechazo: string | null; despachado_at: string | null; created_at: string;
  pedido_lineas?: PedidoLinea[]; ordenes_trabajo?: { folio: number; titulo: string } | null;
}
export const folioPedido = (n: number) => `PM-${String(n || 0).padStart(4, '0')}`;
export const pedidosService = {
  async listar(filtro: { otId?: string; mios?: string } = {}): Promise<Pedido[]> {
    let q = supabase.from('pedidos_material').select('*, pedido_lineas(*, catalogo_items(descripcion, unidad, codigo)), ordenes_trabajo(folio, titulo)')
      .order('created_at', { ascending: false }).limit(200);
    if (filtro.otId) q = q.eq('ot_id', filtro.otId);
    if (filtro.mios) q = q.eq('pedido_por', filtro.mios);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Pedido[];
  },
  async crear(p: Partial<Pedido>, lineas: { articulo_id: string; cantidad: number }[]): Promise<string> {
    const { data, error } = await supabase.from('pedidos_material').insert(p).select('id').single();
    lanzar(error);
    const id = (data as { id: string }).id;
    if (lineas.length) {
      const { error: e2 } = await supabase.from('pedido_lineas').insert(lineas.map(l => ({ ...l, pedido_id: id })));
      lanzar(e2);
    }
    return id;
  },
  async despachar(id: string, lineas: { linea_id: string; cantidad: number; serie?: string }[]) {
    const { error } = await supabase.rpc('despachar_pedido', { p_id: id, p_lineas: lineas });
    lanzar(error);
  },
  async actualizar(id: string, patch: Partial<Pedido>) { const { error } = await supabase.from('pedidos_material').update(patch).eq('id', id); lanzar(error); },
};

// ── Catastro ──
export interface EquipoInstalado {
  articulo_id: string; serie: string; ot_id: string; instalado_at: string; descripcion: string; marca: string | null; modelo: string | null;
  garantia: string | null; ot_folio: number; cliente_id: string | null; sucursal_id: string | null; direccion: string | null;
  nombre_cliente: string | null; sucursal_nombre: string | null;
}
export const catastroService = {
  async listar(clienteId?: string): Promise<EquipoInstalado[]> {
    let q = supabase.from('equipos_instalados').select('*').order('instalado_at', { ascending: false }).limit(1000);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as EquipoInstalado[];
  },
};

// ── Avances de tareas ──
export interface Avance { id: string; tarea_id: string; texto: string; usuario_id: string | null; created_at: string }
export const avancesService = {
  async deTarea(id: string): Promise<Avance[]> {
    const { data, error } = await supabase.from('tarea_avances').select('*').eq('tarea_id', id).order('created_at');
    if (error) throw error;
    return (data || []) as Avance[];
  },
  async agregar(tareaId: string, texto: string) { const { error } = await supabase.from('tarea_avances').insert({ tarea_id: tareaId, texto }); lanzar(error); },
};

// ── Proyectos ──
export type EstadoProyecto = 'planificado' | 'en_curso' | 'en_pausa' | 'terminado' | 'cancelado';
export const ESTADOS_PROYECTO: { clave: EstadoProyecto; nombre: string; color: string }[] = [
  { clave: 'planificado', nombre: 'Planificado', color: '#64748b' },
  { clave: 'en_curso', nombre: 'En curso', color: '#2563eb' },
  { clave: 'en_pausa', nombre: 'En pausa', color: '#d97706' },
  { clave: 'terminado', nombre: 'Terminado', color: '#16a34a' },
  { clave: 'cancelado', nombre: 'Cancelado', color: '#dc2626' },
];
export interface Proyecto {
  id: string; folio: number; nombre: string; cliente_id: string | null; sucursal_id: string | null; descripcion: string | null;
  estado: EstadoProyecto; fecha_inicio: string | null; fecha_fin: string | null; presupuesto: number | null; responsable_id: string | null;
  created_at: string; clientes?: { nombre_cliente: string } | null;
}
export interface ResumenProyecto {
  proyecto_id: string; venta: number; por_aprobar: number; costo_materiales: number; gastos: number; ots: number; ots_terminadas: number;
  /** Fase 7: suma de sus trabajos (cotizaciones aprobadas). */
  venta_neta?: number; costo_cotizado?: number; cobrado?: number; trabajos?: number; trabajos_terminados?: number;
}
export const folioProyecto = (n: number) => `PR-${String(n || 0).padStart(4, '0')}`;
export const proyectosService = {
  async listar(): Promise<Proyecto[]> {
    const { data, error } = await supabase.from('proyectos').select('*, clientes(nombre_cliente)').order('folio', { ascending: false });
    if (error) throw error;
    return (data || []) as Proyecto[];
  },
  async get(id: string): Promise<Proyecto | null> {
    const { data, error } = await supabase.from('proyectos').select('*, clientes(nombre_cliente)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data as Proyecto | null;
  },
  async resumenes(): Promise<Record<string, ResumenProyecto>> {
    const { data } = await supabase.from('proyecto_resumen').select('*');
    return Object.fromEntries(((data || []) as ResumenProyecto[]).map(r => [r.proyecto_id, r]));
  },
  async guardar(p: Partial<Proyecto>): Promise<string> {
    const fila = { ...p }; delete fila.clientes;
    if (p.id) { const { error } = await supabase.from('proyectos').update(fila).eq('id', p.id); lanzar(error); return p.id; }
    const { data, error } = await supabase.from('proyectos').insert(fila).select('id').single();
    lanzar(error);
    return (data as { id: string }).id;
  },
};

// ── Personas ──
export interface Competencia { id: string; nombre: string; tipo: 'habilidad' | 'certificacion'; requiere_vencimiento: boolean; descripcion: string | null; activo: boolean }
export interface UsuarioCompetencia { id: string; usuario_id: string; competencia_id: string; nivel: number | null; obtenida: string | null; vence: string | null; nota: string | null }
export const personasService = {
  async competencias(): Promise<Competencia[]> {
    const { data, error } = await supabase.from('competencias').select('*').order('tipo').order('nombre');
    if (error) throw error;
    return (data || []) as Competencia[];
  },
  async guardarCompetencia(c: Partial<Competencia>) {
    const { error } = c.id ? await supabase.from('competencias').update(c).eq('id', c.id) : await supabase.from('competencias').insert(c);
    lanzar(error);
  },
  async deUsuarios(): Promise<UsuarioCompetencia[]> {
    const { data, error } = await supabase.from('usuario_competencias').select('*');
    if (error) throw error;
    return (data || []) as UsuarioCompetencia[];
  },
  async asignar(uc: Partial<UsuarioCompetencia>) {
    const { error } = await supabase.from('usuario_competencias').upsert(uc, { onConflict: 'usuario_id,competencia_id' });
    lanzar(error);
  },
  async quitar(id: string) { const { error } = await supabase.from('usuario_competencias').delete().eq('id', id); lanzar(error); },
  async perfiles(): Promise<{ id: string; nombre: string | null; email: string | null; cargo: string | null; area: string | null; jefe_id: string | null; activo: boolean }[]> {
    const { data, error } = await supabase.from('profiles').select('id, nombre, email, cargo, area, jefe_id, activo').order('nombre');
    if (error) throw error;
    return (data || []) as never;
  },
  async organigrama(id: string, patch: { jefe_id?: string | null; area?: string | null }) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    lanzar(error);
  },
};

// ── Traslados ──
export interface BaseSalida { id: string; nombre: string; comuna: string | null; zona_km: number; casa_matriz: boolean; activo: boolean }
export interface Traslado { id: string; comuna: string; region: string | null; base_id: string; km: number; valor_propio: number | null; activo: boolean }
export interface Tarifa { valor_por_km: number; tipo_recargo: 'porcentaje' | 'monto'; recargo_otra_base: number }
export interface CotizacionTraslado {
  comuna: string; base_habitual: string; sale_desde: string; desde_otra_base: boolean; km: number; dentro_de_la_zona: boolean;
  detalle: string; traslado: number; recargo: number; total: number;
}
export const trasladosService = {
  async todo(): Promise<{ bases: BaseSalida[]; traslados: Traslado[]; tarifa: Tarifa | null }> {
    const [b, t, f] = await Promise.all([
      supabase.from('bases_salida').select('*').order('casa_matriz', { ascending: false }).order('nombre'),
      supabase.from('traslados').select('*').order('comuna').order('km'),
      supabase.from('tarifa_traslado').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (b.error) throw b.error;
    if (t.error) throw t.error;
    return { bases: (b.data || []) as BaseSalida[], traslados: (t.data || []) as Traslado[], tarifa: (f.data || null) as Tarifa | null };
  },
  async cotizar(comuna: string, baseId?: string | null): Promise<CotizacionTraslado> {
    const { data, error } = await supabase.rpc('cotizar_traslado', { p_comuna: comuna, p_base: baseId || null });
    lanzar(error);
    return data as CotizacionTraslado;
  },
  async guardarTraslado(t: Partial<Traslado>) {
    const { error } = t.id ? await supabase.from('traslados').update(t).eq('id', t.id) : await supabase.from('traslados').insert(t);
    lanzar(error);
  },
  async eliminarTraslado(id: string) { const { error } = await supabase.from('traslados').delete().eq('id', id); lanzar(error); },
  async guardarBase(b: Partial<BaseSalida>) {
    const { error } = b.id ? await supabase.from('bases_salida').update(b).eq('id', b.id) : await supabase.from('bases_salida').insert(b);
    lanzar(error);
  },
  async guardarTarifa(t: Partial<Tarifa>) { const { error } = await supabase.from('tarifa_traslado').update(t).eq('id', 1); lanzar(error); },
};
