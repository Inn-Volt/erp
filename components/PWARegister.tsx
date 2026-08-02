'use client';

import { useEffect } from 'react';

/** Registra el service worker para que la app sea instalable (PWA). */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const registrar = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Si la página ya cargó (caso común en SPA), registrar de inmediato.
    if (document.readyState === 'complete') { registrar(); return; }
    window.addEventListener('load', registrar);
    return () => window.removeEventListener('load', registrar);
  }, []);
  return null;
}
