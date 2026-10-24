'use client';

/**
 * Compras a proveedores (fase 15): facturas, boletas y notas de crédito de lo que se compra.
 * Dan el libro de compras (IVA crédito), el costo real de cada trabajo y lo que falta pagar.
 */

import { supabase } from '@/lib/supabase';

export type TipoDoc = 'factura' | 'factura_exenta' | 'boleta' | 'nota_credito' | 'otro';
export const TIPOS_DOC: { clave: TipoDoc; nombre: string; corto: string; conIva: boolean }[] = [
  { clave: 'factura', nombre: 'Factura', corto: 'Fact.', conIva: true },
  { clave: 'factura_exenta', nombre: 'Factura exenta', corto: 'Fact. ex.', conIva: false },
  { clave: 'boleta', nombre: 'Boleta', corto: 'Bol.', conIva: false },
  { clave: 'nota_credito', nombre: 'Nota de crédito', corto: 'NC', conIva: true },
  { clave: 'otro', nombre: 'Otro documento', corto: 'Doc.', conIva: false },
];
export const tipoDoc = (t: string) => TIPOS_DOC.find(x => x.clave === t) || TIPOS_DOC[0];

export const CATEGORIAS_COMPRA = [
  'Materiales eléctricos', 'Equipos (cargadores, inversores, tableros)', 'Herramientas', 'Arriendo de equipos', 'Subcontrato',
  'Combustible y traslado', 'Servicios básicos', 'Oficina', 'Software y suscripciones', 'Arriendo', 'Otro',
];

export interface Compra {
  id: string; fecha: string; tipo_doc: TipoDoc; folio: string | null; proveedor_rut: string | null; proveedor_nombre: string;
  neto: number; exento: number; iva: number; total: number; categoria: string | null; descripcion: string | null;
  cotizacion_id: string | null; proyecto_id: string | null; pagada: boolean; fecha_pago: string | null; vencimiento: string | null;
  archivo_path: string | null; created_at: string;
}
export type NuevaCompra = Omit<Compra, 'id' | 'created_at'>;

/** ¿Falta correr supabase_fase15_revision.sql? */
export const faltaFase15 = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === '42P01' || x.code === 'PGRST205' || /relation .*compras|schema cache/i.test(x.message || ''));
};

/** Mensaje entendible para el documento repetido (índice único proveedor + tipo + N°). */
export const mensajeCompra = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  if (x?.code === '23505' || /uq_compras_documento/.test(x?.message || '')) return 'Ese documento ya está ingresado (mismo proveedor, tipo y N°).';
  return x?.message || 'No se pudo guardar la compra';
};

const IVA = 0.19;
/** Desde el neto (y lo exento): IVA y total. */
export const desdeNeto = (neto: number, exento: number) => { const iva = Math.round(neto * IVA); return { neto, exento, iva, total: neto + exento + iva }; };
/** Desde el total con IVA (y lo exento): neto e IVA. */
export const desdeTotal = (total: number, exento: number) => { const neto = Math.round(Math.max(0, total - exento) / (1 + IVA)); return { neto, exento, iva: Math.max(0, total - exento - neto), total }; };

export const comprasService = {
  async listar(f: { desde?: string; hasta?: string; cotizacionId?: string; proyectoId?: string } = {}): Promise<Compra[]> {
    let q = supabase.from('compras').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (f.desde) q = q.gte('fecha', f.desde);
    if (f.hasta) q = q.lte('fecha', f.hasta);
    if (f.cotizacionId) q = q.eq('cotizacion_id', f.cotizacionId);
    if (f.proyectoId) q = q.eq('proyecto_id', f.proyectoId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Compra[];
  },
  /** Las impagas de cualquier mes (para «Por pagar»). */
  async porPagar(): Promise<Compra[]> {
    const { data, error } = await supabase.from('compras').select('*').eq('pagada', false).neq('tipo_doc', 'nota_credito').order('vencimiento', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data || []) as Compra[];
  },
  async guardar(id: string | null, c: NuevaCompra) {
    const { error } = id ? await supabase.from('compras').update(c).eq('id', id) : await supabase.from('compras').insert([c]);
    if (error) throw error;
  },
  async marcarPagada(id: string, pagada: boolean, fecha: string | null) {
    const { error } = await supabase.from('compras').update({ pagada, fecha_pago: pagada ? fecha : null }).eq('id', id);
    if (error) throw error;
  },
  async eliminar(c: Compra) {
    const { error } = await supabase.from('compras').delete().eq('id', c.id);
    if (error) throw error;
    if (c.archivo_path) await supabase.storage.from('compras').remove([c.archivo_path]);
  },
  async subirArchivo(f: File): Promise<string> {
    const limpio = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-60);
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${limpio}`;
    const { error } = await supabase.storage.from('compras').upload(path, f, { contentType: f.type || undefined });
    if (error) throw error;
    return path;
  },
  async urlArchivo(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from('compras').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  },
};
