'use client';

/**
 * Iniciar un trabajo (fase 15): si falta pagar el anticipo, la base no lo deja partir y aquí se
 * pide por qué se parte igual (queda registrado en la cotización). Sin la fase 15, inicia como antes.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, Play, X } from 'lucide-react';
import { anticipoPendienteDe, trabajosService } from '@/services/trabajos';
import { useToast } from '@/hooks/useToast';

export function useIniciarTrabajo(onListo: () => void) {
  const { success, error: toastError } = useToast();
  const [pide, setPide] = useState<{ id: string; folio: number; falta: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const iniciar = async (t: { id: string; folio: number }, sinAnticipo?: string) => {
    setOcupado(t.id);
    try {
      await trabajosService.cambiarEstado(t.id, 'en_ejecucion', sinAnticipo);
      success('Trabajo en ejecución');
      setPide(null); setMotivo('');
      onListo();
    } catch (e) {
      const falta = anticipoPendienteDe(e);
      if (falta) setPide({ ...t, falta });
      else toastError(e instanceof Error ? e.message : 'No se pudo iniciar el trabajo');
    } finally { setOcupado(null); }
  };

  const modal = pide && (
    <div className="modal-overlay" onClick={() => setPide(null)}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><AlertTriangle size={14} color="var(--y)" /> El anticipo no está pagado</p>
          <button onClick={() => setPide(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
            IV-{String(pide.folio).padStart(4, '0')}: {pide.falta.charAt(0).toUpperCase() + pide.falta.slice(1)}</p>
          <textarea className="input" rows={3} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} style={{ resize: 'vertical' }}
            placeholder="Ej.: el cliente transfirió hoy y llega mañana; urgencia acordada con gerencia…" />
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
            Queda registrado en el trabajo. Si es un cliente de confianza, márcalo en su ficha y no se volverá a pedir.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border2)' }}>
          <button className="btn btn-ghost" onClick={() => setPide(null)}>Esperar el pago</button>
          <button className="btn btn-primary" disabled={!motivo.trim() || !!ocupado} onClick={() => iniciar(pide, motivo.trim())}>
            {ocupado ? <Loader2 size={13} className="iv-spin" /> : <Play size={13} />} Partir igual</button>
        </div>
      </div>
    </div>
  );

  return { iniciar, modal, ocupado };
}
