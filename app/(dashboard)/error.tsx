'use client';

/**
 * Si una pantalla se cae, en vez de una página en blanco se ve este aviso con «Reintentar».
 * El error queda anotado para revisarlo en Configuración → Errores recientes (fase 15).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { describirError, reportarError } from '@/lib/errores';

export default function ErrorPantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const { mensaje, detalle } = describirError(error);
    reportarError(mensaje, [error.digest && `digest ${error.digest}`, detalle].filter(Boolean).join('\n'));
  }, [error]);

  return (
    <div className="panel-y" style={{ maxWidth: 520, margin: '2rem auto', padding: '1.75rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <AlertTriangle size={32} color="var(--y)" />
      <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>Algo falló en esta pantalla</p>
      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
        No se perdió nada de lo guardado. Prueba de nuevo; si se repite, avísanos: el error quedó anotado.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={reset}><RotateCcw size={14} /> Reintentar</button>
        <Link href="/inicio" className="btn btn-ghost"><Home size={14} /> Ir a Inicio</Link>
      </div>
    </div>
  );
}
