// POST /api/push/prueba — la persona se manda un aviso de prueba a sus propios equipos.

import { NextResponse } from 'next/server';
import { usuarioAutenticado, noAutorizado } from '@/lib/authServidor';
import { enviarPush, faltaParaEnviar } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await usuarioAutenticado(req);
  if (!user) return noAutorizado();
  const falta = await faltaParaEnviar();
  if (falta) return NextResponse.json({ error: falta }, { status: 503 });
  try {
    const r = await enviarPush(user.id, {
      id: crypto.randomUUID(), titulo: 'Avisos de InnVolt activos', tipo: 'prueba', url: '/inicio',
      cuerpo: 'Así te llegarán las visitas, las cotizaciones aprobadas, las tareas y lo demás, aunque la app esté cerrada.',
    });
    if (!r.dispositivos) return NextResponse.json({ error: 'No tienes equipos con avisos activos.' }, { status: 404 });
    if (!r.enviados) return NextResponse.json({ error: `No llegó a ningún equipo${r.errores[0] ? `: ${r.errores[0]}` : ''}.`, ...r }, { status: 502 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo enviar' }, { status: 500 });
  }
}
