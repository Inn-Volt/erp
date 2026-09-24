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
