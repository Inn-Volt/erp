'use client';

/** Avances de una tarea (TecApp): comentarios con quién y cuándo; avisan a quien la creó y al responsable. */

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { avancesService, type Avance } from '@/services/fase5';
import { useToast } from '@/hooks/useToast';
import type { Vendedor } from '@/types';

export default function AvancesTarea({ tareaId, equipo }: { tareaId: string; equipo: Record<string, Vendedor> }) {
  const { error: toastError } = useToast();
  const [avances, setAvances] = useState<Avance[] | null>(null);
  const [texto, setTexto] = useState('');
  const cargar = () => avancesService.deTarea(tareaId).then(setAvances).catch(() => setAvances([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [tareaId]);
  const enviar = async () => {
    if (!texto.trim()) return;
    try { await avancesService.agregar(tareaId, texto.trim()); setTexto(''); cargar(); }
    catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar el avance'); }
  };
  return (
    <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {avances === null ? <Loader2 size={13} className="iv-spin" /> : avances.map(a => (
        <p key={a.id} style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)' }}>
          {a.texto} <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>· {equipo[a.usuario_id || '']?.nombre?.split(' ')[0] || ''} {new Date(a.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </p>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
          placeholder="Anotar un avance…" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
        <button className="btn btn-ghost btn-xs" onClick={enviar} disabled={!texto.trim()} aria-label="Guardar avance"><Send size={12} /></button>
      </div>
    </div>
  );
}
