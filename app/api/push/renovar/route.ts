// POST /api/push/renovar — lo llama el service worker cuando el navegador cambia la
// suscripción de un equipo (pushsubscriptionchange), aunque la app esté cerrada y sin sesión.
// Solo se puede renovar una suscripción que ya existe: hay que conocer su dirección anterior,
// que es secreta (solo la tienen ese navegador y el servidor).

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { serviceRoleLista } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const valida = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 1000;
const clave = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{8,200}={0,2}$/.test(k);

export async function POST(req: Request) {
  if (!serviceRoleLista()) return NextResponse.json({ error: 'Sin configurar' }, { status: 503 });
  const b = await req.json().catch(() => null);
  if (!b || !valida(b.anterior) || !valida(b.endpoint) || !clave(b.keys?.p256dh) || !clave(b.keys?.auth)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (b.anterior !== b.endpoint) {
    // Si la nueva ya estaba registrada (la app la registró al abrirse), basta con borrar la vieja.
    const { data: ya } = await admin.from('push_suscripciones').select('id').eq('endpoint', b.endpoint).maybeSingle();
    if (ya) { await admin.from('push_suscripciones').delete().eq('endpoint', b.anterior); return NextResponse.json({ ok: true }); }
  }
  const { data, error } = await admin.from('push_suscripciones')
    .update({ endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, updated_at: new Date().toISOString() })
    .eq('endpoint', b.anterior).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
