'use client';

/**
 * Fotos de levantamientos (Supabase Storage, bucket PRIVADO).
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes de subir, cada foto se COMPRIME en el navegador (máx. 1600 px, JPEG):
 * una foto de celular de 4–5 MB queda en ~200–400 KB → sube rápido con datos
 * móviles y el PDF no queda pesado. Además todo queda en JPEG, el formato que
 * el generador de PDF soporta (HEIC/WEBP no).
 */

import { supabase } from '@/lib/supabase';

export const BUCKET_FOTOS = 'levantamientos-fotos';
export interface FotoLevantamiento { path: string; caption: string; }

const MAX_LADO = 1600;
const CALIDAD = 0.8;

/** Redimensiona y convierte a JPEG. Si el navegador no puede, sube el original. */
export async function comprimirImagen(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';            // PNG transparente → fondo blanco en JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', CALIDAD));
    return blob || file;
  } catch {
    return file;
  }
}

export const fotosService = {
  /** Sube una foto (comprimida) a la carpeta del levantamiento. Devuelve su path. */
  async subir(levantamientoId: string, file: File): Promise<string> {
    const blob = await comprimirImagen(file);
    const path = `${levantamientoId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, blob, {
      contentType: 'image/jpeg', upsert: false,
    });
    if (error) {
      if (/bucket not found/i.test(error.message)) throw new Error('Falta ejecutar supabase_mejoras_comerciales.sql (bucket de fotos).');
      throw error;
    }
    return path;
  },

  /** Links firmados temporales (1 h) para ver las fotos o ponerlas en un PDF. */
  async urls(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {};
    const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(paths, 3600);
    if (error) return {};
    const out: Record<string, string> = {};
    (data || []).forEach((d, i) => { if (d.signedUrl) out[paths[i]] = d.signedUrl; });
    return out;
  },

  async eliminar(path: string): Promise<void> {
    await supabase.storage.from(BUCKET_FOTOS).remove([path]);
  },

  /** Fotos listas para un PDF (url firmada + leyenda), en el orden guardado. */
  async paraPDF(fotos: FotoLevantamiento[] | undefined): Promise<{ url: string; caption: string }[]> {
    const lista = (fotos || []).slice(0, 24);
    const mapa = await this.urls(lista.map(f => f.path));
    return lista.map(f => ({ url: mapa[f.path] || '', caption: f.caption || '' })).filter(f => f.url);
  },
};
