// POST /api/push/configurar — deja los avisos al celular listos con un clic (Configuración):
// genera las claves y la clave compartida (si no existen) y anota la dirección de este ERP
// para que la base sepa a dónde llamar. Solo quien cambia la configuración.

import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { configurarPush, serviceRoleLista } from '@/lib/pushServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'configuracion.gestionar')) return sinPermiso();
  if (!serviceRoleLista()) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Netlify.' }, { status: 503 });
  // En Netlify, URL es la dirección principal del sitio (no la de una vista previa).
  const origen = process.env.URL || new URL(req.url).origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origen)) {
    return NextResponse.json({ error: 'Configúralo desde el ERP publicado: la base no puede llamar a este computador.' }, { status: 400 });
  }
  try {
    await configurarPush(origen);
    return NextResponse.json({ ok: true, url: `${origen}/api/push` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo configurar' }, { status: 500 });
  }
}
