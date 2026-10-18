// POST /api/push/prueba — la persona se manda un aviso de prueba a sus propios equipos.

import { NextResponse } from 'next/server';
import { usuarioAutenticado, noAutorizado } from '@/lib/authServidor';
import { enviarPush, pushConfigurado } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await usuarioAutenticado(req);
  if (!user) return noAutorizado();
  const falta = pushConfigurado();
  if (falta) return NextResponse.json({ error: falta }, { status: 503 });
  try {
    const r = await enviarPush(user.id, { titulo: 'Avisos de InnVolt activos', cuerpo: 'Así te llegarán las solicitudes nuevas, las cotizaciones aprobadas y lo demás.', url: '/inicio', tipo: 'prueba' });
    if (!r.dispositivos) return NextResponse.json({ error: 'Este usuario no tiene equipos con avisos activos.' }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo enviar' }, { status: 500 });
  }
}
