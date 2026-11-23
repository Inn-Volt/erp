// GET  /api/leer-documento   → { disponible }: ¿hay una IA configurada que lea documentos?
// POST /api/leer-documento   (form-data «archivo»: foto o PDF de una boleta o factura)
//      → { doc, leidos, avisos }: los datos para PRELLENAR el formulario (fase 20). Nunca guarda nada.
// Requiere sesión y el permiso «Usar la IA». Cadena Groq → Gemini → Claude: Groq lee las fotos con su
// modelo de visión y los PDF por su texto. Un PDF escaneado con solo Groq configurado responde 422
// { codigo: 'pdf_escaneado' }: el navegador lo convierte en foto y lo reintenta.

import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { leerArchivoJSON, proveedoresConImagen } from '@/lib/ia';
import { ESQUEMA_DOCUMENTO, INSTRUCCIONES_DOCUMENTO, normalizarDocumento } from '@/lib/leerDocumento';
import { archivoDelFormulario, errorDeLectura } from '@/lib/leerDocumentoServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();
  return NextResponse.json({ disponible: proveedoresConImagen().length > 0 });
}

export async function POST(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'ia.usar')) return sinPermiso();

  const archivo = await archivoDelFormulario(await req.formData().catch(() => null));
  if (archivo instanceof NextResponse) return archivo;
  try {
    const crudo = await leerArchivoJSON<unknown>({
      system: INSTRUCCIONES_DOCUMENTO,
      user: 'Lee este documento y devuelve sus datos.',
      schema: ESQUEMA_DOCUMENTO,
      archivo,
    });
    return NextResponse.json(normalizarDocumento(crudo));
  } catch (e) {
    return errorDeLectura(e);
  }
}
