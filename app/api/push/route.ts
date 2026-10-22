// POST /api/push — lo llama la BASE (pg_net) por cada aviso nuevo de la campana y en los
// reintentos (supabase_fase14_push.sql), para mandarlo a los equipos de su destinatario.
// Se protege con la clave compartida (push_config.secreto, o PUSH_SECRET en Netlify).
//   { notificacion_id }                        → fase 14: el servidor lee el aviso y anota si llegó
//   { usuario_id, titulo, cuerpo, url, tipo }  → fase 6 (base sin actualizar)

import { NextResponse } from 'next/server';
import { enviarNotificacion, enviarPush, faltaParaEnviar, secretoValido } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await secretoValido(req.headers.get('x-push-secreto')))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const falta = await faltaParaEnviar();
  if (falta) return NextResponse.json({ error: falta }, { status: 503 });
  const b = await req.json().catch(() => null);
  try {
    if (b && UUID.test(String(b.notificacion_id || ''))) return NextResponse.json(await enviarNotificacion(b.notificacion_id));
    if (b && UUID.test(String(b.usuario_id || ''))) return NextResponse.json(await enviarPush(b.usuario_id, { titulo: b.titulo, cuerpo: b.cuerpo, url: b.url, tipo: b.tipo }));
    return NextResponse.json({ error: 'Falta el aviso' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo enviar' }, { status: 500 });
  }
}
