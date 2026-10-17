// POST /api/usuarios — invitar a una persona al ERP.
// ─────────────────────────────────────────────────────────────────────────────
// Crea el usuario y devuelve un ENLACE DE ACCESO para crear su contraseña. El
// enlace se comparte por WhatsApp o se copia: el correo de Supabase sin SMTP propio
// solo llega a los miembros de la organización de Supabase, así que no se depende
// de él. Los roles se asignan como el administrador que invita (RLS + auditoría).

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso, clienteComoUsuario, origenPublico } from '@/lib/authServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (ses.permisos === null) {
    return NextResponse.json({ error: 'Primero ejecuta supabase_fase1_usuarios_permisos.sql en Supabase.' }, { status: 409 });
  }
  if (!tienePermiso(ses.permisos, 'usuarios.gestionar')) return sinPermiso();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Netlify → Environment variables).' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const nombre = String(body?.nombre ?? '').trim().slice(0, 80);
  const roles: string[] = Array.isArray(body?.roles) ? body.roles.filter((r: unknown) => typeof r === 'string' && UUID.test(r)).slice(0, 10) : [];
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Escribe un correo válido.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const origin = origenPublico(req);
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite', email, options: { data: { nombre }, redirectTo: `${origin}/restablecer` },
  });
  if (error || !data?.user) {
    const msg = error?.message || '';
    if (/already|registered|exists/i.test(msg)) {
      return NextResponse.json({ error: 'Ese correo ya tiene un usuario. Búscalo en la lista y usa «Nuevo enlace de acceso».' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo crear el usuario: ' + (msg || 'error desconocido') }, { status: 500 });
  }

  const nuevoId = data.user.id;
  const comoAdmin = clienteComoUsuario(ses.token);
  if (nombre) await comoAdmin.from('profiles').update({ nombre }).eq('id', nuevoId);
  let aviso: string | undefined;
  if (roles.length) {
    const { error: e2 } = await comoAdmin.from('usuario_roles').insert(roles.map(rol_id => ({ usuario_id: nuevoId, rol_id })));
    if (e2) aviso = 'Se creó el usuario, pero no se pudieron asignar sus roles: ' + e2.message;
  }
  return NextResponse.json({ ok: true, id: nuevoId, enlace: data.properties?.action_link, aviso });
}
