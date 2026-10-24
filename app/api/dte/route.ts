import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso, clienteComoUsuario } from '@/lib/authServidor';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { desglosarCobro } from '@/lib/contabilidad';
import { armarDTE, faltantesDTE, type DatosEmision } from '@/lib/dte';

/**
 * Factura electrónica con OpenFactura (Haulmer) — fase 15.
 * GET                         → estado de la configuración (nunca devuelve la clave).
 * POST { accion: 'configurar', apiKey?, ambiente, acteco, comuna, sucursal }  (configuracion.gestionar)
 * POST { accion: 'emitir', id, tipo? }   (facturacion.gestionar): emite el cobro «id» como
 *   factura 33 (o exenta 34), guarda el PDF y deja el cobro facturado con el folio del SII.
 *   La clave de idempotencia es el id del cobro: aunque se apriete dos veces, se emite una sola.
 * La clave de la API vive en dte_config (solo la lee el servidor con la service role).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Config { api_key: string | null; ambiente: 'prueba' | 'produccion'; emisor_acteco: string | null; emisor_comuna: string | null; emisor_sucursal: string | null }

async function leerConfig(): Promise<Config | null> {
  const { data, error } = await getSupabaseAdmin().from('dte_config').select('*').eq('id', true).maybeSingle();
  if (error) return null;
  return data as Config | null;
}
const base = (c: Config) => (c.ambiente === 'produccion' ? 'https://api.haulmer.com' : 'https://dev-api.haulmer.com');
const falla = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!['facturacion.ver', 'facturacion.gestionar', 'configuracion.gestionar'].some(p => tienePermiso(ses.permisos, p))) return sinPermiso();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ configurado: false, motivo: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' });
  const c = await leerConfig();
  if (!c) return NextResponse.json({ configurado: false, motivo: 'Falta ejecutar supabase_fase15_revision.sql.' });
  return NextResponse.json({
    configurado: !!c.api_key && !!c.emisor_acteco && !!c.emisor_comuna, tieneClave: !!c.api_key, ambiente: c.ambiente,
    acteco: c.emisor_acteco, comuna: c.emisor_comuna, sucursal: c.emisor_sucursal,
  });
}

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return falla('Cuerpo de la solicitud inválido.'); }

  if (b.accion === 'configurar') {
    if (!tienePermiso(ses.permisos, 'configuracion.gestionar')) return sinPermiso();
    const cambios: Record<string, unknown> = {
      id: true, proveedor: 'openfactura', ambiente: b.ambiente === 'produccion' ? 'produccion' : 'prueba',
      emisor_acteco: String(b.acteco ?? '').replace(/\D/g, '').slice(0, 6) || null,
      emisor_comuna: String(b.comuna ?? '').trim().slice(0, 40) || null,
      emisor_sucursal: String(b.sucursal ?? '').replace(/\D/g, '').slice(0, 9) || null,
      actualizado_at: new Date().toISOString(),
    };
    const clave = String(b.apiKey ?? '').trim();
    if (clave) cambios.api_key = clave.slice(0, 200);
    const { error } = await getSupabaseAdmin().from('dte_config').upsert(cambios);
    if (error) return falla(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  if (b.accion !== 'emitir') return falla('Acción desconocida.');
  if (!tienePermiso(ses.permisos, 'facturacion.gestionar')) return sinPermiso();
  const cfg = await leerConfig();
  if (!cfg?.api_key) return falla('La factura electrónica no está configurada (Configuración → Factura electrónica).');

  // El cobro se lee como el usuario: si no lo puede ver, no lo puede facturar.
  const db = clienteComoUsuario(ses.token);
  const { data: pf, error: e1 } = await db.from('por_facturar')
    .select('*, clientes(*), cotizaciones(folio, titulo, subtotal, iva, total, empresa_id)').eq('id', String(b.id ?? '')).maybeSingle();
  if (e1 || !pf) return falla('No se encontró el cobro.', 404);
  if (pf.dte_folio) return falla(`Este cobro ya tiene la factura electrónica N° ${pf.dte_folio}.`, 409);
  if (pf.etapa === 'sin_cobro') return falla('Este cobro está marcado «sin cobro».');

  const admin = getSupabaseAdmin();
  const cot = pf.cotizaciones as { folio: number; titulo: string | null; subtotal: number | null; iva: number | null; total: number | null; empresa_id: string | null } | null;
  const { data: emps } = cot?.empresa_id
    ? await admin.from('empresas').select('*').eq('id', cot.empresa_id).limit(1)
    : await admin.from('empresas').select('*').limit(1);
  const emp = (emps || [])[0] as { nombre?: string; rut?: string; giro?: string; direccion?: string } | undefined;
  const cli = pf.clientes as {
    nombre_cliente?: string; empresa?: string | null; rut?: string | null; giro?: string | null; direccion?: string | null;
    comuna?: string | null; contacto_nombre?: string | null; email?: string | null; correo_dte?: string | null;
  } | null;

  const montos = desglosarCobro(Number(pf.monto), cot);
  const tipo: 33 | 34 = b.tipo === 34 || (montos.iva === 0 && b.tipo !== 33) ? 34 : 33;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const datos: DatosEmision = {
    tipo, fecha: hoy,
    emisor: { rut: emp?.rut || '', razon: emp?.nombre || '', giro: emp?.giro || '', acteco: cfg.emisor_acteco || '', direccion: emp?.direccion || '', comuna: cfg.emisor_comuna || '', sucursal: cfg.emisor_sucursal },
    receptor: {
      rut: cli?.rut || '', razon: cli?.empresa || cli?.nombre_cliente || '', giro: cli?.giro || '', direccion: cli?.direccion || '',
      comuna: cli?.comuna || '', contacto: cli?.contacto_nombre, correo: cli?.correo_dte || cli?.email,
    },
    item: {
      nombre: cot ? `IV-${String(cot.folio).padStart(4, '0')} ${cot.titulo || ''}`.trim() : pf.descripcion || 'Servicios eléctricos',
      descripcion: [pf.hito, pf.descripcion].filter(Boolean).join(' · '),
    },
    montos: tipo === 34 ? { neto: 0, exento: montos.total, iva: 0, total: montos.total } : montos,
  };
  const faltan = faltantesDTE(datos);
  if (faltan.length) return falla(`Para emitir falta: ${faltan.join(', ')}.`);

  const r = await fetch(`${base(cfg)}/v2/dte/document`, {
    method: 'POST',
    headers: { apikey: cfg.api_key, 'Idempotency-Key': `innvolt-${pf.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: ['PDF', 'FOLIO'], dte: armarDTE(datos) }),
  }).catch(() => null);
  if (!r) return falla('No se pudo conectar con OpenFactura.', 502);
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) {
    const e = (j.error || {}) as { message?: string; code?: string; details?: { field?: string; issue?: string }[] };
    const det = (e.details || []).map(x => [x.field, x.issue].filter(Boolean).join(': ')).join(' · ');
    return falla(`OpenFactura: ${e.message || `respondió ${r.status}`}${e.code ? ` (${e.code})` : ''}${det ? ` — ${det}` : ''}`, 502);
  }
  const folio = String(j.FOLIO ?? j.folio ?? '');
  const pdf = String(j.PDF ?? j.pdf ?? '');
  if (!folio) return falla('OpenFactura no devolvió el folio: revisa el documento en su plataforma antes de reintentar.', 502);

  let pdfPath: string | null = null;
  if (pdf) {
    pdfPath = `${hoy.slice(0, 4)}/${tipo}-${folio}.pdf`;
    const { error: e2 } = await admin.storage.from('dte').upload(pdfPath, Buffer.from(pdf, 'base64'), { contentType: 'application/pdf', upsert: true });
    if (e2) pdfPath = null;
  }
  const dte = { dte_tipo: tipo, dte_folio: folio, dte_estado: 'emitido', dte_pdf: pdfPath, dte_emitido_at: new Date().toISOString() };
  const vence = new Date(`${hoy}T12:00:00`);
  vence.setDate(vence.getDate() + 30);
  const { error: e3 } = await db.from('por_facturar').update({
    ...dte, numero_factura: folio, fecha_factura: hoy, etapa: 'facturado', vencimiento: pf.vencimiento || vence.toISOString().slice(0, 10),
  }).eq('id', pf.id);
  let aviso: string | null = null;
  if (e3) {
    // La factura ya existe en el SII: al menos queda anotada (sin tocar lo demás).
    await admin.from('por_facturar').update(dte).eq('id', pf.id);
    aviso = `La factura N° ${folio} se emitió, pero no se pudo actualizar el cobro (${e3.message}). Revísalo.`;
  }
  return NextResponse.json({ ok: true, folio, tipo, pdf: pdfPath, aviso });
}
