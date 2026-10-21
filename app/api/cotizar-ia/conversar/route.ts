import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { generarJSON } from '@/lib/ia';
import { normalizarTurno, type CandidatoIA, type MensajeIA } from '@/lib/cotizador/iaConversacion';
import { armarPedido, SCHEMA_CONVERSA, SYSTEM_CONVERSA } from '@/lib/cotizador/iaConversacionPrompt';

/**
 * Cotizar con IA conversando: recibe la conversación y una preselección de la biblioteca;
 * devuelve el siguiente turno: preguntas (con opciones) o la propuesta de partidas.
 * Cada turno es una llamada corta (la función del servidor corta a los ~10 s).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();

  let mensajes: MensajeIA[] = [];
  let candidatos: CandidatoIA[] = [];
  let generarYa = false;
  try {
    const body = await req.json();
    mensajes = (Array.isArray(body?.mensajes) ? body.mensajes : []).slice(-24)
      .map((m: MensajeIA) => ({ rol: m?.rol === 'asistente' ? 'asistente' : 'usuario', texto: String(m?.texto ?? '').slice(0, 3000) }))
      .filter((m: MensajeIA) => m.texto.trim());
    candidatos = (Array.isArray(body?.candidatos) ? body.candidatos : []).slice(0, 90);
    generarYa = !!body?.generarYa;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }
  if (!mensajes.length || mensajes[0].rol !== 'usuario' || mensajes[0].texto.trim().length < 5) {
    return NextResponse.json({ error: 'Escribe el requerimiento para empezar.' }, { status: 400 });
  }

  const { user, debeProponer } = armarPedido(mensajes, candidatos, generarYa);

  try {
    const turno = normalizarTurno(await generarJSON<unknown>({ system: SYSTEM_CONVERSA, user, schema: SCHEMA_CONVERSA, rescatar: true }));
    if (debeProponer && turno.tipo !== 'propuesta') {
      return NextResponse.json({ error: 'La IA no alcanzó a armar la propuesta. Intenta «Generar cotización» de nuevo.' }, { status: 502 });
    }
    if (turno.tipo === 'preguntas' && !turno.preguntas.length && !turno.mensaje) {
      return NextResponse.json({ error: 'La IA respondió vacío. Intenta de nuevo.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, turno });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 500 });
  }
}
