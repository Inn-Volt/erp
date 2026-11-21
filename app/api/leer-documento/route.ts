// GET  /api/leer-documento   → { disponible }: ¿hay una IA configurada que lea imágenes y PDF?
// POST /api/leer-documento   (form-data «archivo»: foto o PDF de una boleta o factura)
//      → { doc, leidos, avisos }: los datos para PRELLENAR el formulario (fase 20). Nunca guarda nada.
// Requiere sesión y el permiso «Usar la IA». Solo usa Gemini y Claude (Groq no lee imágenes).

import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { leerArchivoJSON, proveedoresConImagen } from '@/lib/ia';
import { ESQUEMA_DOCUMENTO, INSTRUCCIONES_DOCUMENTO, MAX_BYTES_DOCUMENTO, normalizarDocumento, TIPOS_ARCHIVO_DOCUMENTO } from '@/lib/leerDocumento';

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

  let archivo: File | null = null;
  try {
    const f = (await req.formData()).get('archivo');
    archivo = f instanceof File ? f : null;
  } catch { /* sin form-data */ }
  if (!archivo || !archivo.size) return NextResponse.json({ error: 'Adjunta la foto o el PDF del documento.' }, { status: 400 });
  if (!TIPOS_ARCHIVO_DOCUMENTO.includes(archivo.type)) return NextResponse.json({ error: 'Solo fotos (JPG, PNG, WEBP) o PDF.' }, { status: 400 });
  if (archivo.size > MAX_BYTES_DOCUMENTO) return NextResponse.json({ error: 'El archivo pesa más de 4 MB: saca una foto o un PDF más liviano.' }, { status: 413 });

  try {
    const base64 = Buffer.from(await archivo.arrayBuffer()).toString('base64');
    const crudo = await leerArchivoJSON<unknown>({
      system: INSTRUCCIONES_DOCUMENTO,
      user: 'Lee este documento y devuelve sus datos.',
      schema: ESQUEMA_DOCUMENTO,
      archivo: { base64, mime: archivo.type },
    });
    return NextResponse.json(normalizarDocumento(crudo));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo leer el documento.' }, { status: 502 });
  }
}
