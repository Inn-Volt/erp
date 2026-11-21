'use client';

/**
 * Botón «Leer con IA» (fase 20): lee la foto o el PDF de una boleta o factura y entrega los datos
 * para PRELLENAR el formulario (compras y rendir un gasto). Nunca guarda: la persona revisa lo que
 * quedó en amarillo y guarda. Solo aparece con el permiso «Usar la IA» y si hay una IA configurada
 * que lea imágenes (Gemini o Claude).
 */

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { fetchConSesion } from '@/lib/fetchConSesion';
import { comprimirImagen } from '@/services/fotos';
import { MAX_BYTES_DOCUMENTO, type LecturaDocumento } from '@/lib/leerDocumento';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';

// ¿Hay IA que lea documentos? Se pregunta una vez por sesión.
let disponible: Promise<boolean> | null = null;
const hayLectura = () => (disponible ??= fetchConSesion('/api/leer-documento')
  .then(r => (r.ok ? r.json() : { disponible: false }))
  .then(j => !!j.disponible)
  .catch(() => false));

export default function LeerDocumentoIA({ archivo, onLeido }: {
  /** La foto o el PDF ya elegido en el formulario. */
  archivo: File | null;
  onLeido: (r: LecturaDocumento) => void;
}) {
  const { puede } = usePermisos();
  const { error: toastError } = useToast();
  const [hay, setHay] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const permitido = puede('ia.usar');
  useEffect(() => {
    if (!permitido) return;
    let vivo = true;
    hayLectura().then(v => { if (vivo) setHay(v); });
    return () => { vivo = false; };
  }, [permitido]);
  if (!permitido || !hay) return null;

  const leer = async () => {
    if (!archivo) return;
    setLeyendo(true);
    try {
      let envio: Blob = archivo;
      if (archivo.type.startsWith('image/')) envio = await comprimirImagen(archivo);
      if (envio.size > MAX_BYTES_DOCUMENTO) { toastError('El archivo pesa más de 4 MB: saca una foto o un PDF más liviano.'); return; }
      const fd = new FormData();
      fd.append('archivo', envio, archivo.type.startsWith('image/') ? 'documento.jpg' : archivo.name || 'documento.pdf');
      const res = await fetchConSesion('/api/leer-documento', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No se pudo leer el documento');
      onLeido(j as LecturaDocumento);
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo leer el documento'); }
    finally { setLeyendo(false); }
  };

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={leer} disabled={!archivo || leyendo}
      title={archivo ? 'Prellena los datos desde la foto o el PDF (revísalos antes de guardar)' : 'Primero adjunta la foto o el PDF'}>
      {leyendo ? <Loader2 size={13} className="iv-spin" /> : <Sparkles size={13} />} Leer con IA
    </button>
  );
}
