// GET /api/push/clave — la clave PÚBLICA de los avisos, para que cada equipo se suscriba.
// Es pública por diseño (va dentro de cada suscripción); la privada nunca sale del servidor.

import { NextResponse } from 'next/server';
import { leerConfig } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const c = await leerConfig();
    if (!c.publica) return NextResponse.json({ error: 'Los avisos no están configurados.' }, { status: 503 });
    return NextResponse.json({ clave: c.publica }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Los avisos no están configurados.' }, { status: 503 });
  }
}
