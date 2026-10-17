// POST /api/usuarios/[id]/enlace — enlace nuevo de acceso.
// Para quien no alcanzó a usar su invitación (vence) o perdió su contraseña:
// si nunca entró, se regenera la invitación; si ya entró, es un enlace para
// cambiar la contraseña. Se comparte por WhatsApp o se copia.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso, origenPublico } from '@/lib/authServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (ses.permisos === null || !tienePermiso(ses.permisos, 'usuarios.gestionar')) return sinPermiso();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const { data: u, error: eu } = await admin.auth.admin.getUserById(id);
  if (eu || !u?.user?.email) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const redirectTo = `${origenPublico(req)}/restablecer`;
  const nuncaEntro = !u.user.email_confirmed_at && !u.user.last_sign_in_at;
  const { data, error } = nuncaEntro
    ? await admin.auth.admin.generateLink({ type: 'invite', email: u.user.email, options: { redirectTo } })
    : await admin.auth.admin.generateLink({ type: 'recovery', email: u.user.email, options: { redirectTo } });
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: 'No se pudo generar el enlace: ' + (error?.message || 'error desconocido') }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enlace: data.properties.action_link });
}
