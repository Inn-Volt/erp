'use client';

/**
 * Errores de la app (fase 15): lo que se cae en el navegador de alguien queda anotado en
 * errores_app para verlo en Configuración. Sin la fase 15 (o sin sesión) no anota nada y no
 * molesta. Se guarda solo la ruta (sin parámetros) y cada error una vez por sesión, máx. 15.
 */

import { supabase } from '@/lib/supabase';

const RUIDO = /ResizeObserver loop|Non-Error promise rejection captured|AbortError|The user aborted a request|Load failed$|cancelled|cancelado/i;
const vistos = new Set<string>();
let enviados = 0;

export function reportarError(mensaje: string, detalle?: string | null) {
  if (typeof window === 'undefined') return;
  const m = (mensaje || '').trim().slice(0, 2000);
  if (!m || RUIDO.test(m) || vistos.has(m) || enviados >= 15) return;
  vistos.add(m);
  enviados++;
  supabase.from('errores_app').insert({
    mensaje: m, detalle: detalle ? detalle.slice(0, 8000) : null,
    url: window.location.pathname, navegador: navigator.userAgent.slice(0, 300),
  }).then(() => {}, () => {});
}

/** El texto y la pila de cualquier cosa lanzada. */
export function describirError(e: unknown): { mensaje: string; detalle: string | null } {
  if (e instanceof Error) return { mensaje: `${e.name !== 'Error' ? `${e.name}: ` : ''}${e.message}`, detalle: e.stack || null };
  if (typeof e === 'object' && e && 'message' in e) {
    const x = e as { message?: string; code?: string; details?: string; hint?: string };
    return { mensaje: String(x.message), detalle: [x.code, x.details, x.hint].filter(Boolean).join(' · ') || null };
  }
  return { mensaje: String(e), detalle: null };
}
