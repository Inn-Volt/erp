'use client';

/**
 * Operación después de vender (traído de TecApp): órdenes de trabajo, informes con
 * firma, por facturar, bodega, gastos, tareas y sucursales/contactos de clientes.
 * Tablas en supabase_fase2_operacion.sql. Las reglas (quién puede qué, stock que no
 * queda negativo, OT que nace al aceptar, por facturar al cerrar) viven en la base.
 */

import { supabase } from '@/lib/supabase';
import { comprimirImagen } from '@/services/fotos';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type EstadoOT = 'por_coordinar' | 'coordinada' | 'en_progreso' | 'en_pausa' | 'ejecutada' | 'cerrada' | 'anulada';
export const ESTADOS_OT: { clave: EstadoOT; nombre: string; color: string }[] = [
  { clave: 'por_coordinar', nombre: 'Por coordinar', color: '#d97706' },
  { clave: 'coordinada', nombre: 'Coordinada', color: '#2563eb' },
  { clave: 'en_progreso', nombre: 'En progreso', color: '#7c3aed' },
  { clave: 'en_pausa', nombre: 'En pausa', color: '#64748b' },
  { clave: 'ejecutada', nombre: 'Ejecutada', color: '#0d9488' },
  { clave: 'cerrada', nombre: 'Cerrada', color: '#16a34a' },
  { clave: 'anulada', nombre: 'Anulada', color: '#dc2626' },
];
export const estadoOT = (e: string) => ESTADOS_OT.find(x => x.clave === e) || ESTADOS_OT[0];
export const folioOT = (n?: number | null) => `OT-${String(n ?? 0).padStart(4, '0')}`;

export interface OrdenTrabajo {
  id: string; folio: number; cotizacion_id: string | null; cliente_id: string | null; solicitud_id: string | null;
  sucursal_id?: string | null; proyecto_id?: string | null; tipo_servicio?: string | null; etiquetas?: string[]; titulo: string; descripcion: string | null; direccion: string | null; estado: EstadoOT;
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Urgente'; fecha_programada: string | null; hora_programada: string | null;
  tecnicos: string[]; motivo: string | null; creado_por: string | null; ejecutada_at: string | null; cerrada_at: string | null;
  created_at: string; updated_at: string;
  clientes?: { id: string; nombre_cliente: string; telefono: string | null; direccion: string | null; email: string | null; rut: string | null } | null;
  cotizaciones?: { id: string; folio: number; total: number; total_clp: number | null; moneda: string | null; subtotal: number | null; items: unknown } | null;
}

export interface ResultadoOT { ot_id: string; venta_neta: number; costo_cotizado: number; materiales: number; gastos: number }
export interface CotizacionDeOT { id: string; folio: number; titulo: string | null; estado: string; total: number; total_clp: number | null; moneda: string | null; created_at: string }

export interface ItemChecklist { texto: string; ok: boolean }
export interface MaterialInforme { descripcion: string; cantidad: number; unidad: string; serie?: string | null; articulo_id?: string | null }
export interface FotoInforme { path: string; caption: string }
export interface InformeOT {
  id: string; folio: number; ot_id: string; estado: 'borrador' | 'firmado'; fecha: string; trabajos: string | null;
  /** Fase 6: lo que se encontró al llegar, qué quedó pendiente y el correo de quien recibe. */
  falla_observada?: string | null; pendiente?: string | null; recibido_email?: string | null;
  resultado: 'solucionado' | 'parcial' | 'no_solucionado' | 'segunda_visita' | null; observaciones: string | null;
  checklist: ItemChecklist[]; materiales: MaterialInforme[]; fotos: FotoInforme[];
  recibido_por: string | null; recibido_rut: string | null; firma_path: string | null; firmado_at: string | null;
  tecnico_id: string | null; created_at: string;
}
export const RESULTADOS: { clave: NonNullable<InformeOT['resultado']>; nombre: string }[] = [
  { clave: 'solucionado', nombre: 'Solucionado' },
  { clave: 'parcial', nombre: 'Solucionado parcialmente' },
  { clave: 'no_solucionado', nombre: 'No solucionado' },
  { clave: 'segunda_visita', nombre: 'Requiere segunda visita' },
];
export interface NotaOT { id: string; ot_id: string; texto: string; usuario_id: string | null; created_at: string; tipo?: 'nota' | 'sistema' }

export type EtapaCobro = 'por_revisar' | 'esperando_oc' | 'esperando_hes' | 'listo' | 'facturado' | 'sin_cobro';
export const ETAPAS_COBRO: { clave: EtapaCobro; nombre: string; color: string }[] = [
  { clave: 'por_revisar', nombre: 'Por revisar', color: '#d97706' },
  { clave: 'esperando_oc', nombre: 'Esperando OC', color: '#2563eb' },
  { clave: 'esperando_hes', nombre: 'Esperando HES', color: '#7c3aed' },
  { clave: 'listo', nombre: 'Listo para facturar', color: '#0d9488' },
  { clave: 'facturado', nombre: 'Facturado', color: '#16a34a' },
  { clave: 'sin_cobro', nombre: 'Sin cobro', color: '#64748b' },
];
export interface PorFacturar {
  id: string; ot_id: string | null; cotizacion_id: string | null; cliente_id: string | null; descripcion: string | null;
  monto: number; etapa: EtapaCobro; sin_cobro_motivo: 'garantia' | 'cortesia' | null; numero_oc: string | null;
  numero_hes: string | null; numero_factura: string | null; fecha_factura: string | null; vencimiento: string | null;
  monto_pagado: number; fecha_pago: string | null; notas: string | null; created_at: string;
  clientes?: { nombre_cliente: string } | null;
  ordenes_trabajo?: { folio: number } | null;
}

export interface Bodega { id: string; nombre: string; descripcion: string | null; activo: boolean; responsable_id?: string | null }
export interface Movimiento {
  id: number; tipo: 'entrada' | 'salida' | 'ajuste'; articulo_id: string; bodega_id: string; cantidad: number;
  costo_unitario: number | null; serie: string | null; ot_id: string | null; nota: string | null;
  usuario_id: string | null; created_at: string;
  catalogo_items?: { descripcion: string; unidad: string; codigo: string | null } | null;
  bodegas?: { nombre: string } | null;
  ordenes_trabajo?: { folio: number } | null;
}
export interface StockFila { articulo_id: string; bodega_id: string; cantidad: number; ultimo_movimiento: string }
export interface SerieFila { articulo_id: string; serie: string; bodega_id: string; ot_id: string | null; estado: string; created_at: string }

export type CategoriaGasto = 'combustible' | 'peaje' | 'estacionamiento' | 'materiales' | 'herramientas' | 'alimentacion' | 'transporte' | 'otro';
export const CATEGORIAS_GASTO: { clave: CategoriaGasto; nombre: string }[] = [
  { clave: 'combustible', nombre: 'Combustible' }, { clave: 'peaje', nombre: 'Peaje / TAG' },
  { clave: 'estacionamiento', nombre: 'Estacionamiento' }, { clave: 'materiales', nombre: 'Materiales en terreno' },
  { clave: 'herramientas', nombre: 'Herramientas' }, { clave: 'alimentacion', nombre: 'Alimentación' },
  { clave: 'transporte', nombre: 'Transporte / flete' }, { clave: 'otro', nombre: 'Otro' },
];
export interface Gasto {
  id: string; fecha: string; monto: number; categoria: CategoriaGasto; descripcion: string | null; ot_id: string | null;
  usuario_id: string; boleta_path: string | null;
  /** Fase 6: se rinde y queda «rendido»; quien paga lo marca «reembolsado». Los otros son de antes. */
  estado: 'rendido' | 'reembolsado' | 'rechazado' | 'pendiente' | 'aprobado';
  revisado_por: string | null; revisado_at: string | null; motivo_rechazo: string | null; created_at: string;
  anticipo_id?: string | null;
  ordenes_trabajo?: { folio: number } | null;
}

export interface Tarea {
  id: string; titulo: string; descripcion: string | null; asignado_id: string | null; creado_por: string | null;
  fecha_limite: string | null; prioridad: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  estado: 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'; ot_id: string | null; cliente_id: string | null;
  completada_at: string | null; created_at: string;
  ordenes_trabajo?: { folio: number } | null; clientes?: { nombre_cliente: string } | null;
}

export interface Sucursal { id: string; cliente_id: string; nombre: string; direccion: string | null; comuna: string | null; contacto: string | null; telefono: string | null; notas: string | null; activo: boolean }
export interface Contacto { id: string; cliente_id: string; nombre: string; cargo: string | null; email: string | null; telefono: string | null; principal: boolean; activo: boolean }

// ── Utilidades ────────────────────────────────────────────────────────────────
/** ¿El error es porque falta ejecutar supabase_fase2_operacion.sql? */
export const faltaFase2 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42P01' || x.code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(x.message || ''));
};
const lanzar = (error: unknown) => { if (error) throw error; };

export const BUCKET_OT = 'ot-archivos';
export const archivosOT = {
  /** Sube una imagen (comprimida a JPEG) o un PNG (firma) a la carpeta indicada. */
  async subir(carpeta: string, archivo: Blob, png = false): Promise<string> {
    const blob = png ? archivo : await comprimirImagen(archivo as File);
    const path = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${png ? 'png' : 'jpg'}`;
    const { error } = await supabase.storage.from(BUCKET_OT).upload(path, blob, { contentType: png ? 'image/png' : 'image/jpeg' });
    if (error) {
      if (/bucket not found/i.test(error.message)) throw new Error('Falta ejecutar supabase_fase2_operacion.sql (archivos de operación).');
      throw error;
    }
    return path;
  },
  async urls(paths: string[]): Promise<Record<string, string>> {
    const lista = paths.filter(Boolean);
    if (!lista.length) return {};
    const { data } = await supabase.storage.from(BUCKET_OT).createSignedUrls(lista, 3600);
    const out: Record<string, string> = {};
    (data || []).forEach((d, i) => { if (d.signedUrl) out[lista[i]] = d.signedUrl; });
    return out;
  },
  async eliminar(path: string) { await supabase.storage.from(BUCKET_OT).remove([path]); },
};

/** data URI (firma del FirmaPad) → Blob PNG. */
export function dataUriABlob(dataUri: string): Blob {
  const [cab, b64] = dataUri.split(',');
  const tipo = /data:([^;]+)/.exec(cab)?.[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo });
}

// ── Órdenes de trabajo ────────────────────────────────────────────────────────
// «cotizaciones!cotizacion_id»: desde la fase 6 la cotización también apunta a su OT de origen
// (cotizaciones.ot_id), y sin decir por cuál columna unirlas Supabase rechaza la consulta.
const SEL_OT = '*, clientes(id, nombre_cliente, telefono, direccion, email, rut), cotizaciones!cotizacion_id(id, folio, total, total_clp, moneda, subtotal, items)';
export const otService = {
  async listar(): Promise<OrdenTrabajo[]> {
    const { data, error } = await supabase.from('ordenes_trabajo').select(SEL_OT).order('folio', { ascending: false });
    lanzar(error); return (data || []) as OrdenTrabajo[];
  },
  async get(id: string): Promise<OrdenTrabajo | null> {
    const { data, error } = await supabase.from('ordenes_trabajo').select(SEL_OT).eq('id', id).maybeSingle();
    lanzar(error); return data as OrdenTrabajo | null;
  },
  async crear(d: Partial<OrdenTrabajo>): Promise<OrdenTrabajo> {
    const { data, error } = await supabase.from('ordenes_trabajo').insert(d).select('*').single();
    lanzar(error); return data as OrdenTrabajo;
  },
  async actualizar(id: string, patch: Partial<OrdenTrabajo>) {
    const { error } = await supabase.from('ordenes_trabajo').update(patch).eq('id', id); lanzar(error);
  },
  async deCotizacion(cotizacionId: string): Promise<OrdenTrabajo | null> {
    const { data } = await supabase.from('ordenes_trabajo').select('id, folio, estado').eq('cotizacion_id', cotizacionId).maybeSingle();
    return data as OrdenTrabajo | null;
  },
  /** Venta, costo cotizado y costo real (materiales + gastos) de la OT (fase 6). */
  async resultado(otId: string): Promise<ResultadoOT | null> {
    const { data, error } = await supabase.from('ot_resultado').select('*').eq('ot_id', otId).maybeSingle();
    if (error) return null;
    return data as ResultadoOT | null;
  },
  /** Las cotizaciones de la OT: la que la originó y las cotizadas desde ella (fase 6). */
  async cotizaciones(ot: Pick<OrdenTrabajo, 'id' | 'cotizacion_id'>): Promise<CotizacionDeOT[]> {
    const filtro = ot.cotizacion_id ? `ot_id.eq.${ot.id},id.eq.${ot.cotizacion_id}` : `ot_id.eq.${ot.id}`;
    const { data, error } = await supabase.from('cotizaciones').select('id, folio, titulo, estado, total, total_clp, moneda, created_at').or(filtro).order('folio');
    if (error) {
      if (ot.cotizacion_id) {
        const r = await supabase.from('cotizaciones').select('id, folio, titulo, estado, total, total_clp, moneda, created_at').eq('id', ot.cotizacion_id);
        return (r.data || []) as CotizacionDeOT[];
      }
      return [];
    }
    return (data || []) as CotizacionDeOT[];
  },
  async notas(otId: string): Promise<NotaOT[]> {
    const { data, error } = await supabase.from('ot_notas').select('*').eq('ot_id', otId).order('created_at');
    lanzar(error); return (data || []) as NotaOT[];
  },
  async agregarNota(otId: string, texto: string) {
    const { error } = await supabase.from('ot_notas').insert({ ot_id: otId, texto }); lanzar(error);
  },
};

export const informesService = {
  async deOT(otId: string): Promise<InformeOT[]> {
    const { data, error } = await supabase.from('informes_ot').select('*').eq('ot_id', otId).order('folio');
    lanzar(error); return (data || []) as InformeOT[];
  },
  async crear(otId: string, checklist: ItemChecklist[]): Promise<InformeOT> {
    const { data, error } = await supabase.from('informes_ot').insert({ ot_id: otId, checklist }).select('*').single();
    lanzar(error); return data as InformeOT;
  },
  async guardar(id: string, patch: Partial<InformeOT>) {
    const { error } = await supabase.from('informes_ot').update(patch).eq('id', id); lanzar(error);
  },
  async eliminar(id: string) { const { error } = await supabase.from('informes_ot').delete().eq('id', id); lanzar(error); },
};

// ── Por facturar ──────────────────────────────────────────────────────────────
export const facturacionService = {
  async listar(): Promise<PorFacturar[]> {
    const { data, error } = await supabase.from('por_facturar')
      .select('*, clientes(nombre_cliente), ordenes_trabajo(folio)').order('created_at', { ascending: false });
    lanzar(error); return (data || []) as PorFacturar[];
  },
  async actualizar(id: string, patch: Partial<PorFacturar>) {
    const { error } = await supabase.from('por_facturar').update(patch).eq('id', id); lanzar(error);
  },
};

// ── Bodega ────────────────────────────────────────────────────────────────────
export const bodegaService = {
  async bodegas(): Promise<Bodega[]> {
    const { data, error } = await supabase.from('bodegas').select('*').order('nombre'); lanzar(error); return (data || []) as Bodega[];
  },
  async crearBodega(nombre: string) { const { error } = await supabase.from('bodegas').insert({ nombre }); lanzar(error); },
  async actualizarBodega(id: string, patch: Partial<Bodega>) { const { error } = await supabase.from('bodegas').update(patch).eq('id', id); lanzar(error); },
  async stock(): Promise<StockFila[]> {
    const { data, error } = await supabase.from('stock_bodega').select('*'); lanzar(error); return (data || []) as StockFila[];
  },
  async series(): Promise<SerieFila[]> {
    const { data, error } = await supabase.from('series_bodega').select('*'); lanzar(error); return (data || []) as SerieFila[];
  },
  async movimientos(filtro: { otId?: string; articuloId?: string } = {}, limite = 200): Promise<Movimiento[]> {
    let q = supabase.from('movimientos_bodega')
      .select('*, catalogo_items(descripcion, unidad, codigo), bodegas(nombre), ordenes_trabajo(folio)')
      .order('created_at', { ascending: false }).limit(limite);
    if (filtro.otId) q = q.eq('ot_id', filtro.otId);
    if (filtro.articuloId) q = q.eq('articulo_id', filtro.articuloId);
    const { data, error } = await q; lanzar(error); return (data || []) as Movimiento[];
  },
  async registrar(m: Pick<Movimiento, 'tipo' | 'articulo_id' | 'bodega_id' | 'cantidad'> & Partial<Movimiento>) {
    const { error } = await supabase.from('movimientos_bodega').insert(m); lanzar(error);
  },
};

// ── Gastos ────────────────────────────────────────────────────────────────────
export const gastosService = {
  async listar(soloMios: string | null): Promise<Gasto[]> {
    let q = supabase.from('gastos').select('*, ordenes_trabajo(folio)').order('fecha', { ascending: false }).limit(500);
    if (soloMios) q = q.eq('usuario_id', soloMios);
    const { data, error } = await q; lanzar(error); return (data || []) as Gasto[];
  },
  async deOT(otId: string): Promise<Gasto[]> {
    const { data, error } = await supabase.from('gastos').select('*').eq('ot_id', otId).order('fecha');
    lanzar(error); return (data || []) as Gasto[];
  },
  async crear(g: Partial<Gasto>) { const { error } = await supabase.from('gastos').insert(g); lanzar(error); },
  async actualizar(id: string, patch: Partial<Gasto>) { const { error } = await supabase.from('gastos').update(patch).eq('id', id); lanzar(error); },
  async eliminar(id: string) { const { error } = await supabase.from('gastos').delete().eq('id', id); lanzar(error); },
};

// ── Tareas ────────────────────────────────────────────────────────────────────
export const tareasService = {
  async listar(): Promise<Tarea[]> {
    const { data, error } = await supabase.from('tareas').select('*, ordenes_trabajo(folio), clientes(nombre_cliente)')
      .order('estado').order('fecha_limite', { ascending: true, nullsFirst: false }).limit(500);
    lanzar(error); return (data || []) as Tarea[];
  },
  async crear(t: Partial<Tarea>) { const { error } = await supabase.from('tareas').insert(t); lanzar(error); },
  async actualizar(id: string, patch: Partial<Tarea>) { const { error } = await supabase.from('tareas').update(patch).eq('id', id); lanzar(error); },
};

// ── Sucursales y contactos ────────────────────────────────────────────────────
export const sucursalesService = {
  async deCliente(clienteId: string): Promise<{ sucursales: Sucursal[]; contactos: Contacto[] }> {
    const [s, c] = await Promise.all([
      supabase.from('cliente_sucursales').select('*').eq('cliente_id', clienteId).eq('activo', true).order('nombre'),
      supabase.from('cliente_contactos').select('*').eq('cliente_id', clienteId).eq('activo', true).order('principal', { ascending: false }),
    ]);
    lanzar(s.error); lanzar(c.error);
    return { sucursales: (s.data || []) as Sucursal[], contactos: (c.data || []) as Contacto[] };
  },
  async guardarSucursal(d: Partial<Sucursal>) {
    const { error } = d.id ? await supabase.from('cliente_sucursales').update(d).eq('id', d.id) : await supabase.from('cliente_sucursales').insert(d);
    lanzar(error);
  },
  async guardarContacto(d: Partial<Contacto>) {
    const { error } = d.id ? await supabase.from('cliente_contactos').update(d).eq('id', d.id) : await supabase.from('cliente_contactos').insert(d);
    lanzar(error);
  },
};
