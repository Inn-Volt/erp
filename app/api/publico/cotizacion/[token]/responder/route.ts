// POST /api/publico/cotizacion/[token]/responder
// El cliente ACEPTA o RECHAZA la cotización desde el link. Reglas:
//   · solo si está Enviada (la actualización exige ese estado, así no hay doble
//     respuesta aunque lleguen dos solicitudes a la vez), y si la empresa deja
//     que los clientes respondan en línea (Ajustes de cotización);
//   · aceptar exige que siga vigente y el nombre de quien acepta;
//   · rechazar registra el motivo de pérdida;
//   · la solicitud de origen (si existe) se actualiza igual que desde el ERP.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cargarPorToken, esTokenValido, vigencia } from '@/lib/cotizacionPublica';
import { normalizarEstado } from '@/lib/cotizador/tipos';
import { MOTIVOS_PERDIDA } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limpio = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Firma como PNG en base64 (data URI). Cualquier otra cosa se descarta. */
const FIRMA_MAX = 250_000;
function firmaValida(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > FIRMA_MAX) return null;
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!esTokenValido(token)) return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'La respuesta online no está habilitada todavía.' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const accion = body?.accion === 'aceptar' ? 'aceptar' : body?.accion === 'rechazar' ? 'rechazar' : null;
  if (!accion) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  const nombre = limpio(body?.nombre, 120);
  const rut = limpio(body?.rut, 20);
  const comentario = limpio(body?.comentario, 1000);
  const motivo = MOTIVOS_PERDIDA.includes(body?.motivo) ? body.motivo as string : 'Otro';
  const firma = accion === 'aceptar' ? firmaValida(body?.firma) : null;

  if (accion === 'aceptar' && nombre.length < 3) {
    return NextResponse.json({ error: 'Indica el nombre de quien acepta la cotización.' }, { status: 400 });
  }

  try {
    const cot = await cargarPorToken(token);
    if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    const estadoAhora = normalizarEstado(cot.estado, !!cot.enviada_at || !!cot.vista_at);
    if (estadoAhora === 'Borrador') {
      return NextResponse.json({ error: 'Esta cotización se está actualizando: te enviaremos la nueva versión.' }, { status: 409 });
    }
    if (estadoAhora !== 'Enviada') {
      return NextResponse.json({ error: 'Esta cotización ya fue respondida.' }, { status: 409 });
    }
    const { data: aj } = await getSupabaseAdmin().from('ajustes_cotizacion').select('responde_en_linea').eq('id', 1).maybeSingle();
    if (aj && aj.responde_en_linea === false) {
      return NextResponse.json({ error: 'Para responder, escríbenos directamente.' }, { status: 403 });
    }
    const { vigente } = vigencia(cot);
    if (accion === 'aceptar' && !vigente) {
      return NextResponse.json({ error: 'Esta cotización ya venció. Contáctanos para actualizarla.' }, { status: 410 });
    }

    const admin = getSupabaseAdmin();
    const ahora = new Date().toISOString();
    // Base con la fase 4: Aprobada/Rechazada; sin ella, los estados de antes.
    const fase4 = cot.estado === 'Enviada';
    const nuevoEstado = accion === 'aceptar' ? (fase4 ? 'Aprobada' : 'Aceptado') : (fase4 ? 'Rechazada' : 'Rechazado');
    const cambios: Record<string, unknown> = {
      estado: nuevoEstado,
      respondida_at: ahora,
      respondida_por: nombre || null,
      respondida_rut: rut || null,
      respuesta_comentario: comentario || null,
      ...(accion === 'rechazar' ? { motivo_perdida: motivo, motivo_perdida_nota: comentario || null } : {}),
      ...(firma ? { respuesta_firma: firma } : {}),
      ...(fase4 && accion === 'aceptar' ? { revision_aprobada: cot.revision || 0 } : {}),
      updated_at: ahora,
    };
    const actualizar = (c: Record<string, unknown>) => admin.from('cotizaciones')
      .update(c).eq('id', cot.id).eq('estado', cot.estado).select('id');
    let { data: act, error } = await actualizar(cambios);
    // Si aún no se corrió el SQL de la firma, la aceptación NO se pierde: se guarda sin firma.
    if (error && firma && /respuesta_firma/.test(error.message || '')) {
      delete cambios.respuesta_firma;
      ({ data: act, error } = await actualizar(cambios));
    }
    if (error) throw error;
    if (!act?.length) return NextResponse.json({ error: 'Esta cotización ya fue respondida.' }, { status: 409 });

    // Solicitud de origen: venta → CERRADA; rechazo → queda en el historial.
    if (cot.solicitud_id) {
      const { data: sol } = await admin.from('solicitudes').select('id, estado, historial').eq('id', cot.solicitud_id).maybeSingle();
      if (sol) {
        const folio = `#${String(cot.folio).padStart(4, '0')}`;
        const texto = accion === 'aceptar'
          ? `Cotización ${folio} aceptada online por ${nombre} — venta concretada.`
          : `Cotización ${folio} rechazada online (${motivo}).`;
        await admin.from('solicitudes').update({
          estado: accion === 'aceptar' ? 'CERRADA' : sol.estado,
          historial: [...((sol.historial as unknown[]) || []), { fecha: ahora, texto }],
        }).eq('id', sol.id);
      }
    }

    return NextResponse.json({ ok: true, estado: nuevoEstado });
  } catch {
    return NextResponse.json({ error: 'No se pudo registrar la respuesta. Intenta de nuevo.' }, { status: 500 });
  }
}
