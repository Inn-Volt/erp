import { Database } from 'lucide-react';

/** Aviso cuando la pantalla necesita un archivo SQL que aún no se ejecuta en Supabase. */
export default function FaltaSQL({ archivo = 'supabase_fase2_operacion.sql' }: { archivo?: string }) {
  return (
    <div className="panel" style={{ padding: '2rem 1.25rem', textAlign: 'center', maxWidth: 560, margin: '1rem auto' }}>
      <Database size={30} style={{ margin: '0 auto 0.75rem', color: 'var(--muted)' }} />
      <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Falta un paso en Supabase</p>
      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        Para usar esta sección, ejecuta el archivo <b>{archivo}</b> en Supabase → SQL Editor (está en la carpeta del proyecto) y recarga la página.
      </p>
    </div>
  );
}
