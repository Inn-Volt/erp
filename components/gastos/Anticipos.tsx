'use client';

/**
 * Anticipos a rendir (TecApp): quien aprueba gastos entrega un monto a un técnico; el técnico
 * rinde sus gastos contra él y el saldo baja solo. Con saldo 0 queda «rendido». No se editan:
 * se anulan con motivo.
 */

import { useState } from 'react';
import { HandCoins, Loader2, Plus, X } from 'lucide-react';
import NumeroInput from '@/components/NumeroInput';
import { anticiposService, type Anticipo } from '@/services/fase5';
import { folioOT, type OrdenTrabajo } from '@/services/operacion';
import { useToast } from '@/hooks/useToast';
import { fechaLocal, formatCLP, formatDate } from '@/utils';
import type { Vendedor } from '@/types';

const COLOR: Record<Anticipo['estado'], string> = { entregado: '#2563eb', rendido: '#16a34a', anulado: '#78716c' };

export default function Anticipos({ anticipos, equipo, ots, aprueba, yo, onCambio }: {
  anticipos: Anticipo[]; equipo: Record<string, Vendedor>; ots: OrdenTrabajo[]; aprueba: boolean; yo?: string; onCambio: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [nuevo, setNuevo] = useState<{ usuario_id: string; monto: number; motivo: string; ot_id: string; fecha: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verRendidos, setVerRendidos] = useState(false);
  const lista = anticipos.filter(a => verRendidos || a.estado === 'entregado');
  const porRendir = anticipos.filter(a => a.estado === 'entregado').reduce((s, a) => s + (a.saldo ?? a.monto), 0);

  const entregar = async () => {
    if (!nuevo?.usuario_id || !(nuevo.monto > 0)) { toastError('Elige a quién y el monto'); return; }
    setOcupado(true);
    try {
      await anticiposService.entregar({ usuario_id: nuevo.usuario_id, monto: nuevo.monto, motivo: nuevo.motivo || null, ot_id: nuevo.ot_id || null, fecha: nuevo.fecha });
      success('Anticipo entregado; le llega el aviso');
      setNuevo(null); onCambio();
    } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
    finally { setOcupado(false); }
  };

  if (!anticipos.length && !aprueba) return null;
  return (
    <div className="panel-y" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.8rem 1rem', borderBottom: '1px solid var(--border2)', flexWrap: 'wrap' }}>
        <p className="section-label" style={{ margin: 0, flex: 1 }}><HandCoins size={15} /> Anticipos a rendir · {formatCLP(porRendir)} por rendir</p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <input type="checkbox" checked={verRendidos} onChange={e => setVerRendidos(e.target.checked)} style={{ accentColor: 'var(--y-brand)' }} /> Ver rendidos y anulados</label>
        {aprueba && !nuevo && <button className="btn btn-ghost btn-sm" onClick={() => setNuevo({ usuario_id: '', monto: 0, motivo: '', ot_id: '', fecha: fechaLocal() })}><Plus size={13} /> Entregar anticipo</button>}
      </div>
      {nuevo && (
        <div style={{ padding: '0.8rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, borderBottom: '1px solid var(--border2)', alignItems: 'end' }}>
          <label><span className="label-muted">A quién</span>
            <select className="input" value={nuevo.usuario_id} onChange={e => setNuevo({ ...nuevo, usuario_id: e.target.value })}>
              <option value="">Elegir…</option>{Object.values(equipo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label><span className="label-muted">Monto</span><NumeroInput className="input" prefijo="$" value={nuevo.monto} onChange={v => setNuevo({ ...nuevo, monto: v })} /></label>
          <label><span className="label-muted">Fecha</span><input className="input" type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></label>
          <label><span className="label-muted">OT (opcional)</span>
            <select className="input" value={nuevo.ot_id} onChange={e => setNuevo({ ...nuevo, ot_id: e.target.value })}>
              <option value="">—</option>{ots.map(o => <option key={o.id} value={o.id}>{folioOT(o.folio)} · {o.titulo}</option>)}</select></label>
          <label style={{ gridColumn: '1 / -1' }}><span className="label-muted">Para qué</span><input className="input" value={nuevo.motivo} onChange={e => setNuevo({ ...nuevo, motivo: e.target.value })} placeholder="Bencina y peajes de la semana" /></label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setNuevo(null)}><X size={13} /> Cancelar</button>
            <button className="btn btn-primary" onClick={entregar} disabled={ocupado}>{ocupado ? <Loader2 size={14} className="iv-spin" /> : <HandCoins size={14} />} Entregar</button>
          </div>
        </div>
      )}
      {lista.length === 0 ? <p style={{ padding: '0.8rem 1rem', margin: 0, color: 'var(--muted)', fontSize: '0.84rem' }}>Sin anticipos {verRendidos ? '' : 'por rendir'}.</p> : lista.map(a => (
        <div key={a.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '0.6rem 1rem', borderTop: '1px solid var(--border2)' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)', fontSize: '0.88rem' }}>
              AN-{String(a.folio).padStart(4, '0')}{a.usuario_id !== yo ? ` · ${equipo[a.usuario_id]?.nombre || ''}` : ''}{a.motivo ? ` · ${a.motivo}` : ''}</span>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{formatDate(a.fecha)} · entregado {formatCLP(Number(a.monto))} · rendido {formatCLP(a.rendido || 0)}{a.motivo_anulacion ? ` · anulado: ${a.motivo_anulacion}` : ''}</span>
          </span>
          <b style={{ fontVariantNumeric: 'tabular-nums', color: (a.saldo || 0) < 0 ? 'var(--danger)' : 'var(--text)' }}>{formatCLP(a.saldo ?? 0)}</b>
          <span className="badge" style={{ background: COLOR[a.estado], color: '#fff', fontSize: '0.68rem' }}>{a.estado === 'entregado' ? 'por rendir' : a.estado}</span>
          {aprueba && a.estado !== 'anulado' && <button className="btn btn-ghost btn-xs" onClick={async () => {
            const m = prompt('¿Por qué se anula el anticipo?'); if (!m?.trim()) return;
            try { await anticiposService.anular(a.id, m.trim()); success('Anticipo anulado'); onCambio(); } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo'); }
          }}>Anular</button>}
        </div>
      ))}
      <p style={{ padding: '0.5rem 1rem', margin: 0, fontSize: '0.74rem', color: 'var(--muted)', borderTop: '1px solid var(--border2)' }}>
        Saldo negativo = gastaste más que el anticipo: la diferencia se te reembolsa al aprobar los gastos.</p>
    </div>
  );
}
