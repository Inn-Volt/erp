// GET  /api/ia-estado          → qué proveedores de IA están configurados y en qué orden.
// POST /api/ia-estado {proveedor} → prueba ese proveedor con una consulta mínima.
// Requiere sesión. Nunca devuelve las keys.

import { NextResponse } from 'next/server';
import { usuarioAutenticado, noAutorizado } from '@/lib/authServidor';
import { cadenaProveedores, probarProveedor, type ProveedorIA } from '@/lib/ia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await usuarioAutenticado(req))) return noAutorizado();
  return NextResponse.json({
    orden: cadenaProveedores(),
    configurados: {
      groq: !!process.env.GROQ_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
    modelos: {
      groq: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      gemini: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      anthropic: process.env.IA_MODEL || 'claude-haiku-4-5',
    },
  });
}

export async function POST(req: Request) {
  if (!(await usuarioAutenticado(req))) return noAutorizado();
  const body = await req.json().catch(() => ({}));
  const p = body?.proveedor as ProveedorIA;
  if (!cadenaProveedores().includes(p)) {
    return NextResponse.json({ ok: false, ms: 0, detalle: 'Proveedor no configurado' }, { status: 400 });
  }
  return NextResponse.json(await probarProveedor(p));
}
