import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';

/**
 * Envío automático de correos (fase 15) con Resend: la cotización (o un recordatorio de pago)
 * sale desde el servidor, con el PDF adjunto y «responder a» la persona que la envía.
 * Se activa con RESEND_API_KEY y CORREO_REMITENTE (p. ej. «InnVolt <cotizaciones@innvolt.cl>»,
 * con el dominio verificado en Resend). Sin eso, la app sigue abriendo el correo del usuario.
 *
 * GET  → { activo }        ¿está configurado?
 * POST → { para, asunto, texto, responderA?, adjunto?: { nombre, base64 } }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const configurado = () => !!process.env.RESEND_API_KEY && !!process.env.CORREO_REMITENTE;
const esCorreo = (s: string) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s);
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Texto plano → HTML simple: párrafos y enlaces clicables. */
const html = (t: string) => `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">${
  escapar(t).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  return NextResponse.json({ activo: configurado() });
}

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'cotizaciones.crear') && !tienePermiso(ses.permisos, 'facturacion.gestionar')) return sinPermiso();
  if (!configurado()) return NextResponse.json({ error: 'El envío automático de correos no está configurado.' }, { status: 501 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 }); }
  const para = String(b.para ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const asunto = String(b.asunto ?? '').trim().slice(0, 200);
  const texto = String(b.texto ?? '').slice(0, 20000);
  const responderA = String(b.responderA ?? ses.user.email ?? '').trim();
  if (!para.length || para.length > 5 || !para.every(esCorreo)) return NextResponse.json({ error: 'Revisa el correo del destinatario.' }, { status: 400 });
  if (!asunto || !texto.trim()) return NextResponse.json({ error: 'Falta el asunto o el mensaje.' }, { status: 400 });

  const adj = b.adjunto as { nombre?: string; base64?: string } | undefined;
  const adjuntos = adj?.base64 && adj.nombre
    ? [{ filename: String(adj.nombre).replace(/[^\w.\- ]+/g, '_').slice(0, 120), content: String(adj.base64) }]
    : [];
  // ~7 MB de PDF como máximo (en base64 pesa un tercio más).
  if (adjuntos.some(a => a.content.length > 9_500_000)) return NextResponse.json({ error: 'El PDF es demasiado grande para adjuntarlo.' }, { status: 413 });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CORREO_REMITENTE, to: para, subject: asunto, text: texto, html: html(texto),
      ...(esCorreo(responderA) ? { reply_to: responderA } : {}),
      ...(adjuntos.length ? { attachments: adjuntos } : {}),
    }),
  }).catch(() => null);
  if (!r) return NextResponse.json({ error: 'No se pudo conectar con el servicio de correo.' }, { status: 502 });
  const data = await r.json().catch(() => ({})) as { id?: string; message?: string };
  if (!r.ok) return NextResponse.json({ error: data.message || `El servicio de correo respondió ${r.status}.` }, { status: 502 });
  return NextResponse.json({ ok: true, id: data.id });
}
