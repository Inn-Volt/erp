'use client';

/** Al marcar una cotización como Rechazada, registra POR QUÉ se perdió. */

import { useState } from 'react';
import { X, TrendingDown, Loader2 } from 'lucide-react';
import { MOTIVOS_PERDIDA } from '@/types';

export default function MotivoPerdidaModal({ folio, onConfirm, onClose }: {
  folio: string;
  onConfirm: (motivo: string, nota: string) => Promise<void>;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState<string>('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (!motivo) return;
    setGuardando(true);
    try { await onConfirm(motivo, nota.trim()); } finally { setGuardando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 420, width: '92%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><TrendingDown size={13} /> ¿Por qué se perdió {folio}?</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.2rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.76rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>
            Esto alimenta el análisis de pérdidas del dashboard para ajustar precios y propuestas.
          </p>
          {MOTIVOS_PERDIDA.map(m => (
            <button key={m} onClick={() => setMotivo(m)}
              style={{ textAlign: 'left', padding: '0.55rem 0.75rem', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: '0.84rem',
                border: `1px solid ${motivo === m ? 'var(--y-brand)' : 'var(--border2)'}`,
                background: motivo === m ? 'var(--y-soft)' : 'var(--bg3)', color: motivo === m ? 'var(--y)' : 'var(--text)', fontWeight: motivo === m ? 700 : 400 }}>
              {m}
            </button>
          ))}
          <textarea className="input" value={nota} onChange={e => setNota(e.target.value)} rows={2}
            placeholder="Detalle opcional (ej: la competencia cotizó 15% menos)" style={{ resize: 'vertical', marginTop: '0.3rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
            <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button onClick={confirmar} disabled={!motivo || guardando} className="btn btn-danger">
              {guardando ? <Loader2 size={13} className="iv-spin" /> : null} Marcar como rechazada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
