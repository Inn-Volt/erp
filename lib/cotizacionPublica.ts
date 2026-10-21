// ══════════════════════════════════════════════════════════════════════════════
// Cotización pública (link /c/<token>) — lógica SERVER-SIDE.
//
// El cliente no tiene sesión, así que se lee con la service role. Por eso aquí
// se SANITIZA todo: el cliente solo recibe precios de venta, nunca costos,
// márgenes, imprevistos ni supuestos internos.
// ══════════════════════════════════════════════════════════════════════════════

import type { HitoCobro } from '@/lib/cotizador/tipos';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { diasValidez, sumarDias } from '@/utils';
import type { CotizacionItem, Partida, Moneda } from '@/types';
import { IVA, normalizarEstado, type Seccion } from '@/lib/cotizador/tipos';
import { qp } from '@/lib/cotizador/calculo';
import type { CotizacionPublica, FotoPublica } from '@/types/publico';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

export const BUCKET_FOTOS = 'levantamientos-fotos';

export const esTokenValido = (t: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

/** Fila cruda de cotizaciones que usamos en el flujo público. */
export interface FilaCotizacion {
  id: string;
  folio: number;
  estado: string;
  created_at: string;
  enviada_at?: string | null;
  titulo?: string | null;
  fecha_emision?: string | null;
  valida_hasta?: string | null;
  fecha_valor_uf?: string | null;
  que_ve_cliente?: string | null;
  titulo_valorizacion?: string | null;
  aclaraciones?: string | null;
  secciones?: Seccion[] | null;
  sucursal_id?: string | null;
  contacto_id?: string | null;
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
  ot_id?: string | null;
  agendamiento_id?: string | null;
  plan_cobro?: HitoCobro[] | null;
  incluir_fotos: boolean | null;
  vista_at: string | null;
  respondida_at: string | null;
  respondida_por: string | null;
  respondida_rut?: string | null;
  respuesta_firma?: string | null;   // puede no existir si falta correr el SQL
  vendedor_id?: string | null;       // quién cotizó (Fase 1)
  incluir_portada?: boolean | null;  // Fase 3
  revision?: number | null;          // Fase 3
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
export function vigencia(cot: Pick<FilaCotizacion, 'created_at' | 'condiciones_comerciales' | 'valida_hasta'>) {
  const emision = fechaChile(new Date(cot.created_at));
  // Fase 4: la cotización guarda su «válida hasta» (se fija al enviarla).
  const vence = cot.valida_hasta || sumarDias(emision, diasValidez(cot.condiciones_comerciales));
  return { vence, vigente: fechaChile(new Date()) <= vence };
}

/** Quita todo dato interno de un ítem (costos, márgenes, imprevistos). */
function itemPublico(i: CotizacionItem & { ligadoA?: string | null; porUnidad?: number; ivaIncluido?: boolean }, moneda: Moneda): CotizacionItem & { ligadoA?: string | null; porUnidad?: number; itemId?: string } {
  // Un material con IVA incluido guarda su precio con IVA: al cliente va el neto (el IVA se suma en el total).
  const conIva = !!i.ivaIncluido && i.categoria === 'material' && i.iva !== 0;
  return {
    id: i.id, descripcion: i.descripcion, categoria: i.categoria,
    cantidad: i.cantidad, unidad: i.unidad, precio: conIva ? qp((i.precio || 0) / (1 + IVA / 100), moneda) : i.precio,
    iva: typeof i.iva === 'number' ? i.iva : (i.iva_incluido === false ? 0 : 19),
    descuento: i.descuento || 0,
    partidaId: i.partidaId, ligadoA: i.ligadoA || null, porUnidad: i.porUnidad,
    // El precio va congelado: se marca como del catálogo para que nadie lo recalcule.
    itemId: 'publico',
    costo: 0, imprevistos: 0, margen: 0,
  };
}

function partidaPublica(p: Partida & { tipo?: string }): Partida & { tipo?: string } {
  return { id: p.id, nombre: p.nombre, descripcion: p.descripcion, cantidad: p.cantidad, unidad: p.unidad, tipo: p.tipo || 'instalacion' };
}

/** Ajustes de cotización que ve el cliente (sin la fase 4: valores de siempre). */
async function ajustesPublicos() {
  try {
    const { data } = await getSupabaseAdmin().from('ajustes_cotizacion').select('*').eq('id', 1).maybeSingle();
    return { responde_en_linea: data ? !!data.responde_en_linea : true, importante: data?.importante ?? null, correo_aceptar: data?.correo_aceptar ?? null,
             plan_base: (data?.plan_cobro ?? null) as HitoCobro[] | null, pdf_diseno: (data?.pdf_diseno ?? null) as Record<string, unknown> | null };
  } catch {
    return { responde_en_linea: true, importante: null, correo_aceptar: null, plan_base: null as HitoCobro[] | null, pdf_diseno: null as Record<string, unknown> | null };
  }
}

async function lugarDe(sucursalId?: string | null, contactoId?: string | null) {
  const admin = getSupabaseAdmin();
  const [s, c] = await Promise.all([
    sucursalId ? admin.from('cliente_sucursales').select('nombre, direccion, comuna').eq('id', sucursalId).maybeSingle() : Promise.resolve({ data: null }),
    contactoId ? admin.from('cliente_contactos').select('nombre, email, telefono').eq('id', contactoId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { sucursal: (s.data || null) as CotizacionPublica['sucursal'], contacto: (c.data || null) as CotizacionPublica['contacto'] };
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

/** Links firmados (1 h) de las fotos de la visita (informes de la OT) o, en las de antes, del
 *  levantamiento, si la cotización las incluye. */
export async function fotosDe(levantamientoId: string | null, incluir: boolean | null, otId?: string | null, agendamientoId?: string | null): Promise<FotoPublica[]> {
  if (!incluir) return [];
  const admin = getSupabaseAdmin();
  if (agendamientoId) {
    // Fase 7: las fotos de la visita de la agenda.
    const { data: v } = await admin.from('agendamientos').select('fotos').eq('id', agendamientoId).maybeSingle();
    // Fase 9: más las fotos de las preguntas de sus informes.
    const { data: infs } = await admin.from('informes_visita').select('campos, respuestas').eq('agendamiento_id', agendamientoId).order('folio');
    const deInformes = ((infs || []) as { campos: { clave: string; etiqueta: string; tipo: string }[]; respuestas: Record<string, unknown> }[])
      .flatMap(i => (i.campos || []).filter(c => c.tipo === 'foto')
        .flatMap(c => ((i.respuestas?.[c.clave] as { path: string; caption?: string }[]) || []).map(f => ({ path: f.path, caption: f.caption || c.etiqueta }))));
    const fv = [...(((v as { fotos?: { path: string; caption?: string }[] } | null)?.fotos) || []), ...deInformes].filter(f => f?.path).slice(0, 24);
    if (!fv.length) return [];
    const { data: fir } = await admin.storage.from(BUCKET_FOTOS).createSignedUrls(fv.map(f => f.path), 3600);
    return (fir || []).map((f, i) => ({ url: f.signedUrl || '', caption: fv[i]?.caption || '' })).filter(f => f.url);
  }
  if (otId) {
    const { data: infs } = await admin.from('informes_ot').select('fotos').eq('ot_id', otId).order('folio');
    const fotosOT = ((infs || []) as { fotos: { path: string; caption?: string }[] | null }[]).flatMap(x => x.fotos || []).slice(0, 24);
    if (!fotosOT.length) return [];
    const { data: firmadasOT } = await admin.storage.from('ot-archivos').createSignedUrls(fotosOT.map(f => f.path), 3600);
    return (firmadasOT || []).map((f, i) => ({ url: f.signedUrl || '', caption: fotosOT[i]?.caption || '' })).filter(f => f.url);
  }
  if (!levantamientoId) return [];
  const { data } = await admin.from('levantamientos').select('data').eq('id', levantamientoId).maybeSingle();
  const fotos = ((data?.data as { fotos?: { path: string; caption?: string }[] } | undefined)?.fotos || []).slice(0, 24);
  if (!fotos.length) return [];
  const { data: firmadas } = await admin.storage.from(BUCKET_FOTOS).createSignedUrls(fotos.map(f => f.path), 3600);
  return (firmadas || [])
    .map((f, i) => ({ url: f.signedUrl || '', caption: fotos[i]?.caption || '' }))
    .filter(f => f.url);
}

/** Contacto de quien cotizó (solo nombre, cargo, teléfono y correo). */
async function vendedorDe(id: string | null | undefined): Promise<CotizacionPublica['vendedor']> {
  if (!id) return null;
  try {
    const { data } = await getSupabaseAdmin().from('profiles').select('nombre, email, cargo, telefono').eq('id', id).maybeSingle();
    if (!data) return null;
    return { nombre: data.nombre || data.email || '', cargo: data.cargo ?? null, telefono: data.telefono ?? null, email: data.email ?? null };
  } catch {
    return null;
  }
}

export async function aPublica(cot: FilaCotizacion): Promise<CotizacionPublica> {
  const { vence, vigente } = vigencia(cot);
  const [empresa, fotos, vendedor, ajustes, lugar] = await Promise.all([
    empresaDe(cot.empresa_id), fotosDe(cot.levantamiento_id, cot.incluir_fotos, cot.ot_id, cot.agendamiento_id), vendedorDe(cot.vendedor_id),
    ajustesPublicos(), lugarDe(cot.sucursal_id, cot.contacto_id),
  ]);
  const estado = normalizarEstado(cot.estado, !!cot.enviada_at || !!cot.vista_at);
  const c = cot.clientes;
  return {
    folio: cot.folio,
    estado,
    created_at: cot.created_at,
    titulo: cot.titulo || 'Cotización',
    fecha_emision: cot.fecha_emision || null,
    valida_hasta: cot.valida_hasta || null,
    fecha_valor_uf: cot.fecha_valor_uf || null,
    que_ve_cliente: (cot.que_ve_cliente as CotizacionPublica['que_ve_cliente']) || (cot.mostrar_detalle ? 'detalle' : 'partidas'),
    titulo_valorizacion: cot.titulo_valorizacion || null,
    aclaraciones: cot.aclaraciones ?? [cot.condiciones_servicio, cot.condiciones_comerciales].filter(Boolean).join('\n\n'),
    secciones: cot.secciones || [],
    plan_cobro: (cot.plan_cobro && cot.plan_cobro.length ? cot.plan_cobro : ajustes.plan_base) || null,
    responde_en_linea: ajustes.responde_en_linea, importante: ajustes.importante, correo_aceptar: ajustes.correo_aceptar, pdf_diseno: ajustes.pdf_diseno,
    ...lugar,
    moneda: (cot.moneda as Moneda) || 'CLP',
    valor_uf: cot.valor_uf,
    descuento_global: cot.descuento_global || 0,
    descripcion_general: cot.descripcion_general || '',
    condiciones_servicio: cot.condiciones_servicio || '',
    condiciones_comerciales: cot.condiciones_comerciales || '',
    ocultar_suministros: !!cot.ocultar_suministros,
    mostrar_detalle: !!cot.mostrar_detalle,
    incluir_portada: !!cot.incluir_portada,
    revision: cot.revision || 0,
    items: (cot.items || []).map(i => itemPublico(i, (cot.moneda as Moneda) || 'CLP')),
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
    respuesta_firma: estado === 'Aprobada' ? (cot.respuesta_firma ?? null) : null,
    vendedor,
    fotos,
  };
}
