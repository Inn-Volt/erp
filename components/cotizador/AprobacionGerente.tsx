'use client';

/**
 * Aprobación del gerente (fase 15): si una cotización trae un descuento sobre el máximo o una
 * utilidad bajo el mínimo (fijados en los ajustes del cotizador), quien no tiene permiso para
 * autorizar debe pedir aprobación antes de enviarla. Sin umbrales fijados, nunca se pide.
 */

import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, X, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import type { CotizacionDoc } from '@/lib/cotizador/tipos';

/** El estado de aprobación guardado y, si hoy necesita aprobación, por qué (null = no la necesita). */
export async function revisarAprobacion(id: string): Promise<{ estado: CotizacionDoc['aprobacion_estado']; motivo: string | null } | null> {
  const { data, error } = await supabase.from('cotizaciones').select('aprobacion_estado, motivo:cot_motivo_aprobacion').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const d = data as { aprobacion_estado: CotizacionDoc['aprobacion_estado']; motivo: string | null };
  return { estado: d.aprobacion_estado, motivo: d.motivo };
}

/** El error de la base al enviar sin aprobación: trae el motivo. */
export const aprobacionRequerida = (e: unknown): string | null => {
  const m = (e as { message?: string } | null)?.message || '';
  return m.startsWith('APROBACION_REQUERIDA') ? m.replace(/^APROBACION_REQUERIDA:\s*/, '') : null;
};

export function PedirAprobacion({ cotId, folio, motivo, onCerrar, onListo }: {
  cotId: string; folio: string; motivo: string; onCerrar: () => void; onListo: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pedir = async () => {
    setEnviando(true);
    const { error } = await supabase.from('cotizaciones').update({
      aprobacion_estado: 'pendiente', aprobacion_motivo: nota.trim() ? `${motivo} — ${nota.trim()}` : motivo, aprobacion_nota: null,
    }).eq('id', cotId);
    setEnviando(false);
    if (error) { toastError(error.message); return; }
    success('Se pidió la aprobación: te llega el aviso cuando respondan');
    onListo();
  };
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0, flex: 1 }}><ShieldAlert size={14} color="var(--y)" /> {folio} necesita aprobación</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>{motivo}.</p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Antes de enviarla, la tiene que aprobar quien autoriza descuentos. Puedes ajustar el precio o pedir la aprobación.</p>
          <textarea className="input" rows={3} autoFocus value={nota} onChange={e => setNota(e.target.value)} style={{ resize: 'vertical' }}
            placeholder="Por qué conviene (opcional): cliente nuevo grande, competencia, volumen…" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border2)' }}>
          <button className="btn btn-ghost" onClick={onCerrar}>Ajustar primero</button>
          <button className="btn btn-primary" onClick={pedir} disabled={enviando}>{enviando ? <Loader2 size={13} className="iv-spin" /> : <ShieldCheck size={13} />} Pedir aprobación</button>
        </div>
      </div>
    </div>
  );
}

/** Lo que se ve en la cotización según su estado de aprobación (y los botones de quien autoriza). */
export function BannerAprobacion({ cot, autoriza, onCambio }: { cot: CotizacionDoc; autoriza: boolean; onCambio: () => void }) {
  const { success, error: toastError } = useToast();
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const estado = cot.aprobacion_estado;
  if (!estado || cot.estado !== 'Borrador') return null;

  const responder = async (r: 'aprobada' | 'rechazada') => {
    if (r === 'rechazada' && !nota.trim()) { toastError('Escribe por qué no se aprueba (le llega al vendedor).'); return; }
    setOcupado(true);
    const { error } = await supabase.from('cotizaciones').update({ aprobacion_estado: r, aprobacion_nota: nota.trim() || null }).eq('id', cot.id);
    setOcupado(false);
    if (error) { toastError(error.message); return; }
    success(r === 'aprobada' ? 'Aprobada: ya se puede enviar' : 'No aprobada: se le avisó al vendedor');
    setNota(''); onCambio();
  };

  const caja = (color: string, bg: string): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.8rem 1rem', marginBottom: 12, borderRadius: 10, border: `1px solid ${color}`, background: bg });
  if (estado === 'pendiente') {
    return (
      <div style={caja('var(--y-brand)', 'var(--y-soft)')}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldAlert size={16} color="var(--y)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{autoriza ? 'Piden tu aprobación para enviarla: ' : 'Esperando la aprobación de gerencia: '}<b>{cot.aprobacion_motivo || 'descuento o utilidad fuera de rango'}</b></span>
        </p>
        {autoriza && <>
          <input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Comentario para el vendedor (obligatorio si no se aprueba)" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => responder('aprobada')}>{ocupado ? <Loader2 size={13} className="iv-spin" /> : <CheckCircle2 size={13} />} Aprobar</button>
            <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => responder('rechazada')} style={{ color: 'var(--danger)' }}><XCircle size={13} /> No aprobar</button>
          </div>
        </>}
      </div>
    );
  }
  if (estado === 'rechazada') {
    return (
      <div style={caja('var(--danger)', 'rgba(220,38,38,0.06)')}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', display: 'flex', gap: 8 }}>
          <XCircle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Gerencia no la aprobó{cot.aprobacion_nota ? <>: <b>{cot.aprobacion_nota}</b></> : '.'} Ajusta el precio y vuelve a pedirla al enviar.</span>
        </p>
      </div>
    );
  }
  return (
    <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: 'var(--success)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <ShieldCheck size={15} /> Aprobada por gerencia{cot.aprobacion_nota ? `: ${cot.aprobacion_nota}` : ''}. Ya se puede enviar.
    </p>
  );
}
