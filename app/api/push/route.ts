// POST /api/push — lo llama la BASE (pg_net, supabase_fase6_ot_terreno.sql) por cada aviso
// nuevo de la campana, para mandarlo también a los celulares de su destinatario.
// Se protege con una clave compartida (PUSH_SECRET en Netlify = push_config.secreto en la base).

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { enviarPush, pushConfigurado } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function claveValida(recibida: string | null): boolean {
  const esperada = process.env.PUSH_SECRET || '';
  if (!esperada || !recibida) return false;
  const a = Buffer.from(recibida), b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!claveValida(req.headers.get('x-push-secreto'))) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const falta = pushConfigurado();
  if (falta) return NextResponse.json({ error: falta }, { status: 503 });
  const b = await req.json().catch(() => null);
  if (!b || !UUID.test(String(b.usuario_id || ''))) return NextResponse.json({ error: 'Falta el destinatario' }, { status: 400 });
  try {
    const r = await enviarPush(b.usuario_id, { titulo: b.titulo, cuerpo: b.cuerpo, url: b.url, tipo: b.tipo });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo enviar' }, { status: 500 });
  }
}
