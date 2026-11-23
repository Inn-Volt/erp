'use client';

/**
 * Botón «Leer con IA» (fase 20): lee la foto o el PDF de una boleta o factura y entrega los datos
 * para PRELLENAR el formulario (compras y rendir un gasto). Nunca guarda: la persona revisa lo que
 * quedó en amarillo y guarda. Solo aparece con el permiso «Usar la IA» y si hay una IA configurada
 * (con solo Groq basta: las fotos van a su modelo de visión, los PDF por su texto y un PDF escaneado
 * se reintenta como foto).
 */

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { hayLecturaIA, pedirLectura } from '@/services/leerConIA';
import type { LecturaDocumento } from '@/lib/leerDocumento';
import { usePermisos } from '@/hooks/usePermisos';
import { useToast } from '@/hooks/useToast';

/** ¿Se puede leer con IA? (permiso y una IA configurada). */
export function useLecturaIA(): boolean {
  const { puede } = usePermisos();
  const [hay, setHay] = useState(false);
  const permitido = puede('ia.usar');
  useEffect(() => {
    if (!permitido) return;
    let vivo = true;
    hayLecturaIA().then(v => { if (vivo) setHay(v); });
    return () => { vivo = false; };
  }, [permitido]);
  return permitido && hay;
}

export default function LeerDocumentoIA({ archivo, onLeido }: {
  /** La foto o el PDF ya elegido en el formulario. */
  archivo: File | null;
  onLeido: (r: LecturaDocumento) => void;
}) {
  const { error: toastError } = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const hay = useLecturaIA();
  if (!hay) return null;

  const leer = async () => {
    if (!archivo) return;
    setLeyendo(true);
    try { onLeido(await pedirLectura<LecturaDocumento>('/api/leer-documento', archivo)); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo leer el documento'); }
    finally { setLeyendo(false); }
  };

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={leer} disabled={!archivo || leyendo}
      title={archivo ? 'Prellena los datos desde la foto o el PDF (revísalos antes de guardar)' : 'Primero adjunta la foto o el PDF'}>
      {leyendo ? <Loader2 size={13} className="iv-spin" /> : <Sparkles size={13} />} Leer con IA
    </button>
  );
}
