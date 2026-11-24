'use client';

/** Mis cálculos (y los de mi equipo): abrir, duplicar y eliminar los propios. */

import { useMemo, useState } from 'react';
import { Copy, FolderOpen, Loader2, Search, Trash2 } from 'lucide-react';
import { formatCLP } from '@/utils';
import { formatoUF } from '@/lib/hh/calculo';
import type { CalculoHHBD } from '@/services/hh';
import { Hoja, fechaCL } from './comun';
import s from './hh.module.css';

export default function CalculosGuardados({ lista, miId, configura, actual, onAbrir, onDuplicar, onEliminar, onCerrar }: {
  lista: CalculoHHBD[] | null; miId: string | null; configura: boolean; actual: string | null;
  onAbrir: (id: string) => void; onDuplicar: (id: string) => void; onEliminar: (c: CalculoHHBD) => void; onCerrar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista || []).filter(c => !q || `${c.nombre} ${c.cliente_texto || ''}`.toLowerCase().includes(q));
  }, [lista, busca]);

  return (
    <Hoja titulo="Mis cálculos" onCerrar={onCerrar} ancho={620}>
      <div className={s.buscar}>
        <Search size={15} aria-hidden />
        <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre o cliente…" aria-label="Buscar cálculos" />
      </div>
      {!lista ? (
        <p className={s.ayuda}><Loader2 size={13} className="iv-spin" /> Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p className={s.ayuda} style={{ textAlign: 'center', padding: '1.5rem 0' }}>{lista.length ? 'Nada con esa búsqueda.' : 'Todavía no hay cálculos guardados.'}</p>
      ) : (
        <div className={s.tarjetas}>
          {filtrados.map(c => {
            const propio = c.created_by === miId;
            return (
              <div key={c.id} className="panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                boxShadow: c.id === actual ? 'inset 0 0 0 1px var(--y-brand)' : undefined }}>
                <button type="button" className={s.expandir} onClick={() => onAbrir(c.id)}>
                  <span className={s.tarjetaTitulo}>
                    <b>{c.nombre}</b>
                    <small>{[fechaCL(c.fecha), c.cliente_texto, propio ? 'tuyo' : 'de tu equipo'].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className={s.precio}><b>{formatoUF(c.neto_uf)}</b><small>{formatCLP(c.neto_clp)}</small></span>
                </button>
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  <button type="button" className={s.iconoBtn} onClick={() => onAbrir(c.id)} aria-label={`Abrir ${c.nombre}`}><FolderOpen size={15} /></button>
                  <button type="button" className={s.iconoBtn} onClick={() => onDuplicar(c.id)} aria-label={`Duplicar ${c.nombre}`}><Copy size={15} /></button>
                  {(propio || configura) && <button type="button" className={s.iconoBtn} onClick={() => onEliminar(c)} aria-label={`Eliminar ${c.nombre}`}><Trash2 size={15} /></button>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Hoja>
  );
}
