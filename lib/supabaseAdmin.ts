// ══════════════════════════════════════════════════════════════════════════════
// Cliente Supabase SERVER-SIDE con SERVICE ROLE.
//
// ⚠️  SOLO puede importarse desde código de servidor (route handlers en
//     app/api/**). Usa SUPABASE_SERVICE_ROLE_KEY, que SALTA RLS y JAMÁS debe
//     llegar al navegador. Por eso la key NO lleva prefijo NEXT_PUBLIC_.
//
// Se usa para: procesar el webhook de Mercado Pago (escribir estado de pagos
// y desbloquear documentos) y para generar signed URLs de documentos privados.
// ══════════════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Devuelve un cliente Supabase con permisos de service role (server-only). */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL en el entorno del servidor.');
  if (!serviceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.');

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
