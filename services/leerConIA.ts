'use client';

/**
 * Mandar una foto o un PDF (o una lista pegada) a una ruta que lee con IA: /api/leer-documento y
 * /api/asignar-materiales. La foto se achica antes de mandarla. Si la ruta responde 422
 * «pdf_escaneado» (solo hay Groq y el PDF es una imagen: no trae texto), se convierten las primeras
 * páginas en una imagen (una bajo la otra) y se reintenta una vez como foto.
 */

import { fetchConSesion } from '@/lib/fetchConSesion';
import { comprimirImagen } from '@/services/fotos';
import { MAX_BYTES_DOCUMENTO } from '@/lib/leerDocumento';

/** Páginas del PDF escaneado que se mandan como foto (una boleta o factura casi siempre cabe en una). */
const PAGINAS_ESCANEADO = 2;

/** Las primeras páginas de un PDF, una bajo la otra, como una imagen PNG (unpdf, cargado solo aquí). */
async function pdfAImagen(pdf: File): Promise<File> {
  const { getDocumentProxy, renderPageAsImage } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(await pdf.arrayBuffer()));
  try {
    const imagenes: ImageBitmap[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, PAGINAS_ESCANEADO); i++) {
      const png = await renderPageAsImage(doc, i, { scale: 2 });
      imagenes.push(await createImageBitmap(new Blob([png], { type: 'image/png' })));
    }
    if (!imagenes.length) throw new Error('El PDF no tiene páginas.');
    const ancho = Math.max(...imagenes.map(b => b.width)), alto = imagenes.reduce((s, b) => s + b.height, 0);
    const canvas = document.createElement('canvas');
    canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo convertir el PDF en imagen.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    let y = 0;
    for (const b of imagenes) { ctx.drawImage(b, 0, y); y += b.height; }
    const blob = await new Promise<Blob>((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo convertir el PDF en imagen.'))), 'image/png'));
    return new File([blob], 'documento.png', { type: 'image/png' });
  } finally {
    // PDFDocumentProxy no tiene destroy(): se libera con su tarea de carga.
    await doc.loadingTask.destroy().catch(() => {});
  }
}

/** POST a una ruta de IA con el archivo (si hay) y los demás campos; devuelve su JSON o lanza su error. */
export async function pedirLectura<T>(ruta: string, archivo: File | null, campos: Record<string, string> = {}): Promise<T> {
  const enviar = async (f: File | null) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.append(k, v);
    if (f) {
      const foto = f.type.startsWith('image/');
      const envio: Blob = foto ? await comprimirImagen(f) : f;
      if (envio.size > MAX_BYTES_DOCUMENTO) throw new Error('El archivo pesa más de 4 MB: saca una foto o un PDF más liviano.');
      fd.append('archivo', envio, foto ? 'documento.jpg' : f.name || 'documento.pdf');
    }
    const res = await fetchConSesion(ruta, { method: 'POST', body: fd });
    return { res, j: await res.json().catch(() => ({})) as { error?: string; codigo?: string } };
  };
  let { res, j } = await enviar(archivo);
  if (res.status === 422 && j.codigo === 'pdf_escaneado' && archivo) ({ res, j } = await enviar(await pdfAImagen(archivo)));
  if (!res.ok) throw new Error(j.error || 'No se pudo leer el documento');
  return j as T;
}

// ¿Hay IA que lea documentos? Se pregunta una vez por sesión.
let disponible: Promise<boolean> | null = null;
export const hayLecturaIA = () => (disponible ??= fetchConSesion('/api/leer-documento')
  .then(r => (r.ok ? r.json() : { disponible: false }))
  .then(j => !!j.disponible)
  .catch(() => false));
