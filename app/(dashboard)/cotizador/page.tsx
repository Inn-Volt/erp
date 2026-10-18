'use client';

/**
 * Comercial → Cotizador (el de TecApp, adaptado a InnVolt).
 *   /cotizador                      nueva
 *   /cotizador?edit=<id>            abrir una
 *   /cotizador?clone=<id>           clonar (copia nueva en borrador)
 *   /cotizador?cliente=<id>         nueva para ese cliente
 *   /cotizador?solicitud=<id>       nueva desde una solicitud analizada con IA
 *   /cotizador?ot=<id>              nueva desde una OT (lo que vio el técnico y sus fotos)
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import EditorCotizacion from '@/components/cotizador/EditorCotizacion';

function Cotizador() {
  const sp = useSearchParams();
  const id = sp.get('edit');
  const clone = sp.get('clone');
  return (
    <EditorCotizacion key={id || clone || 'nueva'} id={id} clonarDe={clone}
      clienteInicial={sp.get('cliente')} solicitudInicial={sp.get('solicitud')} otInicial={sp.get('ot')} proyectoInicial={sp.get('proyecto')} />
  );
}

export default function CotizadorPage() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}><Loader2 className="iv-spin" /></div>}>
      <Cotizador />
    </Suspense>
  );
}
