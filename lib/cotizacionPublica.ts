// ══════════════════════════════════════════════════════════════════════════════
// Cotización pública (link /c/<token>) — lógica SERVER-SIDE.
//
// El cliente no tiene sesión, así que se lee con la service role. Por eso aquí
// se SANITIZA todo: el cliente solo recibe precios de venta, nunca costos,
// márgenes, imprevistos ni supuestos internos.
// ══════════════════════════════════════════════════════════════════════════════

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { diasValidez, sumarDias } from '@/utils';
import type { CotizacionItem, Partida, Moneda, EstadoCotizacion } from '@/types';
import type { CotizacionPublica, FotoPublica } from '@/types/publico';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

export const BUCKET_FOTOS = 'levantamientos-fotos';

export const esTokenValido = (t: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

/** Fila cruda de cotizaciones que usamos en el flujo público. */
export interface FilaCotizacion {
  id: string;
  folio: number;
  estado: EstadoCotizacion;
  created_at: string;
  items: CotizacionItem[] | null;
  partidas: Partida[] | null;
  moneda: Moneda | null;
  valor_uf: number | null;
  descuento_global: number | null;
  descripcion_general: string | null;
  condiciones_servicio: string | null;
  condiciones_comerciales: string | null;
  ocultar_suministros: boolean | null;
  mostrar_detalle: boolean | null;
  empresa_id: string | null;
  solicitud_id: string | null;
  levantamiento_id: string | null;
  incluir_fotos: boolean | null;
  vista_at: string | null;
  respondida_at: string | null;
  respondida_por: string | null;
  respondida_rut?: string | null;
  respuesta_firma?: string | null;   // puede no existir si falta correr el SQL
  clientes: {
    nombre_cliente: string; empresa: string | null; rut: string; email: string | null;
    telefono: string | null; direccion: string | null; contacto_nombre: string | null;
  } | null;
}

export async function cargarPorToken(token: string): Promise<FilaCotizacion | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('cotizaciones')
    .select('*, clientes(nombre_cliente, empresa, rut, email, telefono, direccion, contacto_nombre)')
    .eq('token_publico', token)
    .maybeSingle();
  if (error || !data) return null;
  return data as FilaCotizacion;
}

/**
 * Fecha YYYY-MM-DD en hora de CHILE. El servidor (Netlify) corre en UTC: sin
 * esto, una cotización creada de noche vencía un día distinto que en el PDF.
 */
const fechaChile = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Fecha de vencimiento y si sigue vigente hoy (ambas en hora de Chile). */
export function vigencia(cot: Pick<FilaCotizacion, 'created_at' | 'condiciones_comerciales'>) {
  const emision = fechaChile(new Date(cot.created_at));
  const vence = sumarDias(emision, diasValidez(cot.condiciones_comerciales));
  return { vence, vigente: fechaChile(new Date()) <= vence };
}

/** Quita todo dato interno de un ítem (costos, márgenes, imprevistos). */
function itemPublico(i: CotizacionItem): CotizacionItem {
  return {
    id: i.id, descripcion: i.descripcion, categoria: i.categoria,
    cantidad: i.cantidad, unidad: i.unidad, precio: i.precio,
    iva: typeof i.iva === 'number' ? i.iva : (i.iva_incluido === false ? 0 : 19),
    descuento: i.descuento || 0,
    partidaId: i.partidaId, cantidadPorUnidad: i.cantidadPorUnidad,
    costo: 0, imprevistos: 0, margen: 0,
  };
}

function partidaPublica(p: Partida): Partida {
  return { id: p.id, nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad };
}

async function empresaDe(empresaId: string | null): Promise<EmpresaInfo> {
  const admin = getSupabaseAdmin();
  const q = admin.from('empresas').select('*');
  const { data } = empresaId ? await q.eq('id', empresaId).maybeSingle() : await q.order('nombre').limit(1).maybeSingle();
  const e = (data || {}) as Partial<EmpresaInfo>;
  return {
    nombre: e.nombre || 'InnVolt SpA', rut: e.rut || '', giro: e.giro, email: e.email || '',
    telefono: e.telefono || '', direccion: e.direccion, website: e.website, logo_url: e.logo_url,
    banco: e.banco, tipo_cuenta: e.tipo_cuenta, cuenta_bancaria: e.cuenta_bancaria,
    texto_importante: e.texto_importante, slogan: e.slogan,
  };
}

/** Links firmados (1 h) de las fotos del levantamiento, si la cotización las incluye. */
export async function fotosDe(levantamientoId: string | null, incluir: boolean | null): Promise<FotoPublica[]> {
  if (!levantamientoId || !incluir) return [];
  const admin = getSupabaseAdmin();
  const { data } = await admin.from('levantamientos').select('data').eq('id', levantamientoId).maybeSingle();
  const fotos = ((data?.data as { fotos?: { path: string; caption?: string }[] } | undefined)?.fotos || []).slice(0, 24);
  if (!fotos.length) return [];
  const { data: firmadas } = await admin.storage.from(BUCKET_FOTOS).createSignedUrls(fotos.map(f => f.path), 3600);
  return (firmadas || [])
    .map((f, i) => ({ url: f.signedUrl || '', caption: fotos[i]?.caption || '' }))
    .filter(f => f.url);
}

export async function aPublica(cot: FilaCotizacion): Promise<CotizacionPublica> {
  const { vence, vigente } = vigencia(cot);
  const [empresa, fotos] = await Promise.all([empresaDe(cot.empresa_id), fotosDe(cot.levantamiento_id, cot.incluir_fotos)]);
  const c = cot.clientes;
  return {
    folio: cot.folio,
    estado: cot.estado,
    created_at: cot.created_at,
    moneda: (cot.moneda as Moneda) || 'CLP',
    valor_uf: cot.valor_uf,
    descuento_global: cot.descuento_global || 0,
    descripcion_general: cot.descripcion_general || '',
    condiciones_servicio: cot.condiciones_servicio || '',
    condiciones_comerciales: cot.condiciones_comerciales || '',
    ocultar_suministros: !!cot.ocultar_suministros,
    mostrar_detalle: !!cot.mostrar_detalle,
    items: (cot.items || []).map(itemPublico),
    partidas: (cot.partidas || []).map(partidaPublica),
    cliente: {
      nombre_cliente: c?.nombre_cliente || '', empresa: c?.empresa || undefined, rut: c?.rut || '',
      email: c?.email || undefined, telefono: c?.telefono || undefined, direccion: c?.direccion || undefined,
      contacto_nombre: c?.contacto_nombre || undefined,
    },
    empresa,
    vence,
    vigente,
    respondida_at: cot.respondida_at,
    respondida_por: cot.respondida_por,
    respondida_rut: cot.respondida_rut ?? null,
    respuesta_firma: cot.estado === 'Aceptado' ? (cot.respuesta_firma ?? null) : null,
    fotos,
  };
}
