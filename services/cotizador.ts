'use client';

/**
 * Datos del cotizador TecApp (fase 4): catálogo con precio, familias, ajustes,
 * plantillas, la cotización y sus acciones (enviar, aprobar, rechazar, volver a
 * borrador, anular, clonar), su historial y sus envíos, y las recetas con preguntas.
 */

import { supabase } from '@/lib/supabase';
import type {
  AjustesCot, ArticuloCatalogo, CotizacionDoc, EnvioCot, EventoCot, Familia, Plantilla, PreguntaReceta, ReglaComponente,
} from '@/lib/cotizador/tipos';
import { normalizarEstado } from '@/lib/cotizador/tipos';
import type { RecetaCompleta } from '@/lib/cotizador/recetas';

const lanzar = (e: unknown) => {
  if (!e) return;
  const x = e as { message?: string; details?: string; hint?: string };
  throw new Error(x.message || 'Error');
};

/** ¿El error es porque falta ejecutar supabase_fase4_cotizador_tecapp.sql? */
export const faltaFase4 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42P01' || x.code === 'PGRST205' || x.code === 'PGRST202' || x.code === '42883' ||
    /does not exist|could not find|schema cache/i.test(x.message || ''));
};

export const BUCKET_COT = 'cotizaciones';

export function aDoc(fila: Record<string, unknown>): CotizacionDoc {
  const f = fila as unknown as CotizacionDoc & { estado: string };
  return {
    ...f,
    estado: normalizarEstado(f.estado, !!f.enviada_at || !!f.vista_at),
    revision: f.revision || 0,
    titulo: f.titulo || 'Cotización',
    items: (f.items || []) as CotizacionDoc['items'],
    partidas: (f.partidas || []) as CotizacionDoc['partidas'],
    moneda: (f.moneda as CotizacionDoc['moneda']) || 'CLP',
    que_ve_cliente: f.que_ve_cliente || ((f as unknown as { mostrar_detalle?: boolean }).mostrar_detalle ? 'detalle' : 'partidas'),
    descripcion_general: f.descripcion_general || '',
    aclaraciones: f.aclaraciones ?? [
      (f as unknown as { condiciones_servicio?: string }).condiciones_servicio,
      (f as unknown as { condiciones_comerciales?: string }).condiciones_comerciales,
    ].filter(Boolean).join('\n\n'),
    secciones: (f.secciones || []) as CotizacionDoc['secciones'],
  };
}

export const catalogoCotService = {
  async todos(): Promise<ArticuloCatalogo[]> {
    const todos: ArticuloCatalogo[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from('catalogo_con_precio').select('*').order('descripcion').range(desde, desde + 999);
      if (error) throw error;
      todos.push(...((data || []) as ArticuloCatalogo[]));
      if (!data || data.length < 1000) break;
    }
    return todos;
  },
};

export const familiasService = {
  async listar(): Promise<Familia[]> {
    const { data, error } = await supabase.from('familias_precio').select('*').order('catalogo').order('nombre');
    if (error) throw error;
    return (data || []) as Familia[];
  },
  async guardar(f: Partial<Familia> & { ultimo_motivo?: string | null }) {
    const { error } = f.id
      ? await supabase.from('familias_precio').update(f).eq('id', f.id)
      : await supabase.from('familias_precio').insert(f);
    lanzar(error);
  },
};

export const ajustesService = {
  async get(): Promise<AjustesCot> {
    const { data, error } = await supabase.from('ajustes_cotizacion').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return (data || { dias_validez: 15, aclaraciones: null, importante: null, correo_aceptar: null, usa_presentacion: true,
      responde_en_linea: true, asunto_correo: null, mensaje_correo: null, mensaje_whatsapp: null }) as AjustesCot;
  },
  async guardar(a: Partial<AjustesCot>) {
    const { error } = await supabase.from('ajustes_cotizacion').update(a).eq('id', 1);
    lanzar(error);
  },
  async ultimoNumero(): Promise<number> {
    const { data, error } = await supabase.rpc('cot_ultimo_numero');
    lanzar(error);
    return Number(data) || 0;
  },
  async proximoNumero(n: number, motivo: string) {
    const { error } = await supabase.rpc('cot_proximo_numero', { p_numero: n, p_motivo: motivo });
    lanzar(error);
  },
};

export const plantillasCotService = {
  async listar(incluirInactivas = false): Promise<Plantilla[]> {
    let q = supabase.from('plantillas_cotizacion').select('*').order('es_la_de_siempre', { ascending: false }).order('nombre');
    if (!incluirInactivas) q = q.eq('activa', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as Plantilla[]).map(p => ({ ...p, secciones: p.secciones || [], que_ve_cliente: p.que_ve_cliente || 'partidas' }));
  },
  async guardar(p: Partial<Plantilla>): Promise<string> {
    const fila = { ...p };
    delete (fila as { updated_at?: string }).updated_at;
    if (p.id) {
      const { error } = await supabase.from('plantillas_cotizacion').update(fila).eq('id', p.id);
      lanzar(error);
      return p.id;
    }
    const { data, error } = await supabase.from('plantillas_cotizacion').insert(fila).select('id').single();
    lanzar(error);
    return (data as { id: string }).id;
  },
  async deSiempre(id: string) {
    const { error } = await supabase.rpc('plantilla_de_siempre', { p_id: id });
    lanzar(error);
  },
};

export const cotizadorService = {
  async get(id: string): Promise<CotizacionDoc | null> {
    const { data, error } = await supabase.from('cotizaciones').select('*, clientes(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? aDoc(data) : null;
  },
  async crear(fila: Record<string, unknown>): Promise<CotizacionDoc> {
    const { data, error } = await supabase.from('cotizaciones').insert(fila).select('*, clientes(*)').single();
    lanzar(error);
    return aDoc(data as Record<string, unknown>);
  },
  async guardar(id: string, fila: Record<string, unknown>): Promise<CotizacionDoc> {
    const { data, error } = await supabase.from('cotizaciones').update({ ...fila, updated_at: new Date().toISOString() })
      .eq('id', id).select('*, clientes(*)').single();
    lanzar(error);
    return aDoc(data as Record<string, unknown>);
  },
  async enviar(id: string, canal: string, para?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('cot_enviar', { p_id: id, p_canal: canal, p_para: para || null });
    lanzar(error);
    return data as string;
  },
  async pdfDelEnvio(envioId: string, pdf: Blob, cotId: string, nombre: string) {
    const path = `${cotId}/${Date.now()}_${nombre}`;
    const { error } = await supabase.storage.from(BUCKET_COT).upload(path, pdf, { contentType: 'application/pdf' });
    if (error) throw error;
    const { error: e2 } = await supabase.rpc('cot_envio_pdf', { p_envio: envioId, p_path: path });
    lanzar(e2);
    return path;
  },
  async aprobar(id: string, como: string, documento?: string | null, motivo?: string | null) {
    const { error } = await supabase.rpc('cot_aprobar', { p_id: id, p_como: como, p_documento: documento || null, p_motivo: motivo || null });
    lanzar(error);
  },
  async rechazar(id: string, motivo: string, nota?: string | null) {
    const { error } = await supabase.rpc('cot_rechazar', { p_id: id, p_motivo: motivo, p_nota: nota || null });
    lanzar(error);
  },
  async volverABorrador(id: string, motivo: string) {
    const { error } = await supabase.rpc('cot_volver_borrador', { p_id: id, p_motivo: motivo });
    lanzar(error);
  },
  async anular(id: string, motivo: string) {
    const { error } = await supabase.rpc('cot_anular', { p_id: id, p_motivo: motivo });
    lanzar(error);
  },
  async clonar(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('cot_clonar', { p_id: id });
    lanzar(error);
    return data as string;
  },
  async eventos(id: string): Promise<EventoCot[]> {
    const { data, error } = await supabase.from('cotizacion_eventos').select('*').eq('cotizacion_id', id).order('created_at');
    if (error) throw error;
    return (data || []) as EventoCot[];
  },
  async envios(id: string): Promise<EnvioCot[]> {
    const { data, error } = await supabase.from('cotizacion_envios').select('*').eq('cotizacion_id', id).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as EnvioCot[];
  },
  async subirArchivo(cotId: string, archivo: File): Promise<string> {
    const limpio = archivo.name.replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${cotId}/respuesta_${Date.now()}_${limpio}`;
    const { error } = await supabase.storage.from(BUCKET_COT).upload(path, archivo, { contentType: archivo.type || 'application/octet-stream' });
    if (error) throw error;
    return path;
  },
  async urlArchivo(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET_COT).createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  },
};

// ── Recetas con preguntas ──
export const recetasCotService = {
  async listar(soloActivas = true): Promise<RecetaCompleta[]> {
    let q = supabase.from('recetas').select('*, receta_componentes(*)').order('nombre');
    if (soloActivas) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as (RecetaCompleta & { receta_componentes: RecetaCompleta['componentes'] })[]).map(r => ({
      id: r.id, nombre: r.nombre, descripcion: r.descripcion, unidad: r.unidad || 'un', activo: r.activo,
      preguntas: (r.preguntas || []) as PreguntaReceta[],
      componentes: [...(r.receta_componentes || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map(c => ({ ...c, regla: (c.regla || null) as ReglaComponente | null })),
    }));
  },
  async guardar(r: RecetaCompleta): Promise<string> {
    const cab = { nombre: r.nombre.trim(), descripcion: r.descripcion || null, unidad: r.unidad || 'un', preguntas: r.preguntas, activo: r.activo ?? true };
    let id = r.id;
    if (id) {
      const { error } = await supabase.from('recetas').update(cab).eq('id', id);
      lanzar(error);
    } else {
      const { data, error } = await supabase.from('recetas').insert(cab).select('id').single();
      lanzar(error);
      id = (data as { id: string }).id;
    }
    const { error: e1 } = await supabase.from('receta_componentes').delete().eq('receta_id', id);
    lanzar(e1);
    if (r.componentes.length) {
      const filas = r.componentes.map((c, i) => ({
        receta_id: id, item_id: c.item_id || null, descripcion: c.descripcion, categoria: c.categoria,
        unidad: c.unidad, costo: c.costo || 0, cantidad: Number(c.cantidad) || 0, orden: i, regla: c.regla || null,
      }));
      const { error: e2 } = await supabase.from('receta_componentes').insert(filas);
      lanzar(e2);
    }
    return id;
  },
  async activar(id: string, activo: boolean) {
    const { error } = await supabase.from('recetas').update({ activo }).eq('id', id);
    lanzar(error);
  },
};
