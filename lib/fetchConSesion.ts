'use client';

import { supabase } from '@/lib/supabase';

/**
 * fetch a las rutas API internas enviando la sesión del usuario
 * ("Authorization: Bearer <token>"), que las rutas validan con
 * `usuarioAutenticado` (lib/authServidor.ts).
 */
export async function fetchConSesion(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
