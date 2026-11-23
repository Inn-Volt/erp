'use client';

/** La lista de cálculos guardados: abrir, duplicar y eliminar los propios. */

import { useMemo, useState } from 'react';
import { Copy, FolderOpen, Loader2, Search, Trash2 } from 'lucide-react';
import { formatCLP } from '@/utils';
import { formatoUF } from '@/lib/hh/calculo';
import type { CalculoHHBD } from '@/services/hh';
import { fechaCL, tdEstilo, thEstilo } from './comun';

export default function CalculosGuardados({ lista, miId, configura, actual, onAbrir, onDuplicar, onEliminar }: {
  lista: CalculoHHBD[] | null; miId: string | null; configura: boolean; actual: string | null;
  onAbrir: (id: string) => void; onDuplicar: (id: string) => void; onEliminar: (c: CalculoHHBD) => void;
}) {
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista || []).filter(c => !q || `${c.nombre} ${c.cliente_texto || ''}`.toLowerCase().includes(q));
  }, [lista, busca]);

  if (!lista) return <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}><Loader2 size={13} className="iv-spin" /> Cargando…</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg3)', borderRadius: 8, padding: '0.6rem' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} aria-hidden />
        <input className="input input-sm" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre o cliente…" style={{ paddingLeft: '2.2rem' }} aria-label="Buscar cálculos" />
      </div>
      {filtrados.length === 0 ? (
        <p style={{ margin: 0, padding: '1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>{lista.length ? 'Nada con esa búsqueda.' : 'Todavía no hay cálculos guardados.'}</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560, fontSize: '0.84rem' }}>
            <thead><tr>
              <th style={thEstilo}>Cálculo</th><th style={thEstilo}>Fecha</th>
              <th style={{ ...thEstilo, textAlign: 'right' }}>Neto</th><th style={thEstilo} aria-label="Acciones" />
            </tr></thead>
            <tbody>{filtrados.map(c => {
              const propio = c.created_by === miId;
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border2)', background: c.id === actual ? 'var(--y-soft)' : undefined }}>
                  <td style={tdEstilo}>
                    <b style={{ color: 'var(--text)' }}>{c.nombre}</b>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)' }}>{[c.cliente_texto, propio ? 'tuyo' : null].filter(Boolean).join(' · ') || '—'}</span>
                  </td>
                  <td style={{ ...tdEstilo, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fechaCL(c.fecha)}</td>
                  <td style={{ ...tdEstilo, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <b style={{ color: 'var(--text)' }}>{formatoUF(c.neto_uf)}</b>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--muted)' }}>{formatCLP(c.neto_clp)}</span>
                  </td>
                  <td style={{ ...tdEstilo, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => onAbrir(c.id)}><FolderOpen size={12} /> Abrir</button>{' '}
                    <button className="btn btn-ghost btn-xs" onClick={() => onDuplicar(c.id)} aria-label={`Duplicar ${c.nombre}`}><Copy size={12} /></button>{' '}
                    {(propio || configura) && <button className="btn btn-ghost btn-xs" onClick={() => onEliminar(c)} aria-label={`Eliminar ${c.nombre}`}><Trash2 size={12} /></button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
