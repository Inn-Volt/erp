'use client';

/**
 * Correo automático (fase 15): si el servidor tiene Resend configurado, el correo sale solo
 * (con el PDF adjunto). Si no, quien llama abre el correo del usuario como siempre.
 */

import { fetchConSesion } from '@/lib/fetchConSesion';

let activo: Promise<boolean> | null = null;

export function correoAutomatico(): Promise<boolean> {
  activo ??= fetchConSesion('/api/correo').then(r => (r.ok ? r.json() : { activo: false })).then(d => !!d.activo).catch(() => false);
  return activo;
}

const aBase64 = (b: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => mal(r.error);
  r.readAsDataURL(b);
});

/** Envía el correo desde el servidor. Lanza error si no se pudo (para caer al correo del usuario). */
export async function enviarCorreo(c: { para: string; asunto: string; texto: string; responderA?: string | null; pdf?: { nombre: string; blob: Blob } | null }) {
  const res = await fetchConSesion('/api/correo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      para: c.para, asunto: c.asunto, texto: c.texto, responderA: c.responderA || undefined,
      adjunto: c.pdf ? { nombre: c.pdf.nombre, base64: await aBase64(c.pdf.blob) } : undefined,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
}
