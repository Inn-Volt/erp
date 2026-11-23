// Lo común de las rutas que leen documentos con IA (/api/leer-documento y /api/asignar-materiales):
// revisar el archivo del formulario y responder el error de la IA. Solo servidor.

import { NextResponse } from 'next/server';
import { PdfEscaneadoError, type ArchivoIA } from '@/lib/ia';
import { MAX_BYTES_DOCUMENTO, TIPOS_ARCHIVO_DOCUMENTO } from '@/lib/leerDocumento';

/** El archivo «archivo» del form-data, ya revisado (o la respuesta de error). */
export async function archivoDelFormulario(fd: FormData | null): Promise<ArchivoIA | NextResponse> {
  const f = fd?.get('archivo');
  const archivo = f instanceof File ? f : null;
  if (!archivo || !archivo.size) return NextResponse.json({ error: 'Adjunta la foto o el PDF del documento.' }, { status: 400 });
  if (!TIPOS_ARCHIVO_DOCUMENTO.includes(archivo.type)) return NextResponse.json({ error: 'Solo fotos (JPG, PNG, WEBP) o PDF.' }, { status: 400 });
  if (archivo.size > MAX_BYTES_DOCUMENTO) return NextResponse.json({ error: 'El archivo pesa más de 4 MB: saca una foto o un PDF más liviano.' }, { status: 413 });
  return { base64: Buffer.from(await archivo.arrayBuffer()).toString('base64'), mime: archivo.type };
}

/** La respuesta cuando la IA falla: 422 «pdf_escaneado» si se puede reintentar como foto; si no, 502. */
export function errorDeLectura(e: unknown): NextResponse {
  if (e instanceof PdfEscaneadoError) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: 422 });
  return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo leer el documento.' }, { status: 502 });
}
