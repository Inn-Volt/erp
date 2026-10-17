// Verificación de sesión en rutas API (server-side).
// ─────────────────────────────────────────────────────────────────────────────
// Las rutas de IA consumen cuota gratuita y, si se configura Claude, dinero:
// no pueden quedar abiertas a cualquiera que conozca la URL. El navegador envía
// el token de Supabase ("Authorization: Bearer …", ver lib/fetchConSesion.ts) y
// aquí se valida contra Supabase Auth con la anon key (no requiere service role).

import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';

export async function usuarioAutenticado(req: Request): Promise<User | null> {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export const noAutorizado = () =>
  NextResponse.json({ error: 'Sesión expirada o no autorizada. Vuelve a iniciar sesión.' }, { status: 401 });

export const sinPermiso = () =>
  NextResponse.json({ error: 'No tienes permiso para hacer esto. Pídeselo al administrador.' }, { status: 403 });

/**
 * Cliente Supabase que actúa COMO el usuario: respeta sus permisos (RLS) y deja su
 * nombre en la auditoría. Para escribir en nombre de quien hizo la acción.
 */
export function clienteComoUsuario(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Sesión + permisos del usuario que llama. `permisos === null` = la base aún no
 * tiene la Fase 1 (sin roles): se mantiene el comportamiento anterior (todo
 * permitido a quien tiene sesión).
 */
export async function sesionConPermisos(req: Request): Promise<{ user: User; token: string; permisos: string[] | null } | null> {
  const user = await usuarioAutenticado(req);
  if (!user) return null;
  const token = (req.headers.get('authorization') || '').slice(7);
  const { data, error } = await clienteComoUsuario(token).rpc('mis_permisos');
  if (error) {
    if (error.code === 'PGRST202' || /mis_permisos|could not find the function/i.test(error.message)) {
      return { user, token, permisos: null };
    }
    return { user, token, permisos: [] };
  }
  return { user, token, permisos: (data as string[] | null) || [] };
}

/**
 * Dirección pública del ERP desde la que se hizo la petición (para armar enlaces
 * de vuelta, como el de crear contraseña). Primero la página del navegador
 * (cabecera Origin), luego la del proxy, y al final la de la propia petición.
 * Supabase igual solo acepta las direcciones autorizadas en su configuración.
 */
export function origenPublico(req: Request): string {
  const o = req.headers.get('origin');
  if (o && /^https?:\/\/[^/]+$/.test(o)) return o;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

/** ¿Tiene el permiso? (Sin Fase 1 en la base: sí, como antes.) */
export const tienePermiso = (permisos: string[] | null, clave: string) =>
  permisos === null || permisos.includes('*') || permisos.includes(clave);
