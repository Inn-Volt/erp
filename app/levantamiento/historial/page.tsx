'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, Edit2, FileText, AlertTriangle } from 'lucide-react';
import { levantamientosService } from '@/services/levantamientos';
import type { Levantamiento, EstadoLevantamiento } from '@/types/levantamiento';
import { ESTADO_LEV_COLORS } from '@/types/levantamiento';
import { formatDate } from '@/utils';

function Skeleton({ h = 48 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h, width: '100%', marginBottom: 2 }} />;
}

const ESTADOS: EstadoLevantamiento[] = ['Borrador', 'Completado', 'Enviado', 'Archivado'];

export default function LevantamientoHistorialPage() {
  const router = useRouter();
  const [items, setItems] = useState<Levantamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoLevantamiento | ''>('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    levantamientosService.getAll()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(lev => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      lev.data.cliente_nombre.toLowerCase().includes(q) ||
      lev.data.empresa.toLowerCase().includes(q) ||
      lev.data.tecnico.toLowerCase().includes(q) ||
      lev.data.tipo_proyecto.toLowerCase().includes(q) ||
      String(lev.folio).includes(q);
    const matchEstado = !filterEstado || lev.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este levantamiento? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    try { await levantamientosService.delete(id); load(); }
    catch { alert('Error al eliminar'); }
    setDeleting(null);
  };

  const handleEstado = async (id: string, estado: EstadoLevantamiento) => {
    try { await levantamientosService.updateEstado(id, estado); load(); }
    catch { alert('Error al actualizar estado'); }
  };

  const criticalCount = (lev: Levantamiento) =>
    Object.values(lev.data.checklist || {}).filter(Boolean).length;

  return (
    <div className="anim-in">
      {/* Header */}
      <div className="iv-page-header">
        <div>
          <p className="label-muted" style={{ marginBottom: '0.35rem', letterSpacing: '0.4em' }}>Módulo técnico</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'clamp(1.6rem,4vw,2.8rem)', textTransform: 'uppercase', lineHeight: 0.9, color: '#fff' }}>
            HISTO<span style={{ color: 'var(--y)' }}>RIAL</span>
          </h1>
        </div>
        <div className="iv-header-actions">
          <button onClick={() => router.push('/levantamiento')} className="btn btn-primary">
            <Plus size={14} /> Nuevo levantamiento
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, empresa, técnico, folio…"
            style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', padding: '9px 12px 9px 32px', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--y)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')} />
        </div>
        <div style={{ position: 'relative' }}>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as any)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', color: filterEstado ? 'var(--text)' : 'var(--muted)', padding: '9px 32px 9px 12px', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: '0.6rem' }}>▼</span>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
        {ESTADOS.map(e => {
          const count = items.filter(i => i.estado === e).length;
          const { color, bg } = ESTADO_LEV_COLORS[e];
          return (
            <div key={e} style={{ padding: '6px 14px', background: bg, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color }}>{count}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>{e}</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={56} />)}</>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            {search || filterEstado ? 'Sin resultados' : 'Sin levantamientos'}
          </p>
          <p style={{ fontSize: '0.78rem', marginTop: 6 }}>
            {!search && !filterEstado && 'Crea tu primer levantamiento técnico'}
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border2)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 120px 100px 130px 90px', gap: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--border2)', padding: '8px 16px' }}>
            {['Folio','Cliente','Técnico','Tipo proyecto','Estado','Fecha',''].map((h, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.52rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--y)' }}>{h}</div>
            ))}
          </div>

          {filtered.map((lev, i) => {
            const { color, bg } = ESTADO_LEV_COLORS[lev.estado] || { color: 'var(--muted)', bg: 'transparent' };
            const crit = criticalCount(lev);
            return (
              <div key={lev.id} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 1fr 120px 100px 130px 90px',
                gap: 0, padding: '11px 16px', borderBottom: '1px solid var(--border2)',
                background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent',
                alignItems: 'center', transition: 'background .15s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,198,0,0.03)')}
              onMouseOut={e => (e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent')}>

                {/* Folio */}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.8rem', color: 'var(--y)' }}>
                  LV-{String(lev.folio || 0).padStart(4,'0')}
                </div>

                {/* Cliente */}
                <div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lev.data.cliente_nombre || '—'}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lev.data.empresa || ''}
                  </p>
                </div>

                {/* Técnico */}
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lev.data.tecnico || '—'}
                </p>

                {/* Tipo */}
                <p style={{ fontSize: '0.72rem', color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lev.data.tipo_proyecto || '—'}
                </p>

                {/* Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select value={lev.estado} onChange={e => handleEstado(lev.id, e.target.value as EstadoLevantamiento)}
                    onClick={e => e.stopPropagation()}
                    style={{ background: bg, border: `1px solid ${color}44`, color, padding: '3px 6px', fontSize: '0.65rem', fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                {/* Fecha */}
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(lev.created_at)}</p>
                  {crit > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <AlertTriangle size={10} color="#f87171" />
                      <span style={{ fontSize: '0.6rem', color: '#f87171' }}>{crit} crítico{crit>1?'s':''}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => router.push(`/levantamiento?id=${lev.id}`)} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} title="Editar">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => handleDelete(lev.id)} disabled={deleting === lev.id} className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} title="Eliminar">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <p style={{ marginTop: 12, fontSize: '0.7rem', color: 'var(--muted)' }}>
          {filtered.length} levantamiento{filtered.length !== 1 ? 's' : ''}{search || filterEstado ? ' (filtrado)' : ''}
        </p>
      )}
    </div>
  );
}
