// PATCH /api/usuarios/[id] — activar o desactivar a un usuario.
// El perfil se cambia COMO el administrador (la base valida el permiso, que nadie
// se desactive a sí mismo y que quede un Administrador; y lo anota en la auditoría).
// Además se bloquea o desbloquea su inicio de sesión en Supabase Auth.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso, clienteComoUsuario } from '@/lib/authServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (ses.permisos === null || !tienePermiso(ses.permisos, 'usuarios.gestionar')) return sinPermiso();
  if (id === ses.user.id) return NextResponse.json({ error: 'No puedes desactivar tu propio usuario.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'Falta «activo».' }, { status: 400 });
  const activo: boolean = body.activo;

  const { data: act, error } = await clienteComoUsuario(ses.token)
    .from('profiles').update({ activo }).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!act?.length) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  // Bloquear también el inicio de sesión (la base ya le niega los datos).
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await getSupabaseAdmin().auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' }).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
