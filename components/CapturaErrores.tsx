'use client';

/** Anota los errores no atrapados del navegador (fase 15). No muestra nada. */

import { useEffect } from 'react';
import { describirError, reportarError } from '@/lib/errores';

export default function CapturaErrores() {
  useEffect(() => {
    const alError = (ev: ErrorEvent) => {
      const { mensaje, detalle } = describirError(ev.error ?? ev.message);
      reportarError(mensaje || ev.message, detalle || (ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : null));
    };
    const alRechazo = (ev: PromiseRejectionEvent) => {
      const { mensaje, detalle } = describirError(ev.reason);
      reportarError(mensaje, detalle);
    };
    window.addEventListener('error', alError);
    window.addEventListener('unhandledrejection', alRechazo);
    return () => {
      window.removeEventListener('error', alError);
      window.removeEventListener('unhandledrejection', alRechazo);
    };
  }, []);
  return null;
}
