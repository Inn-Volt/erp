'use client';

/**
 * Modales del cotizador
 * ─────────────────────────────────────────────────────────────────────────────
 *  · DescripcionModal — edita descripción general, garantía y condiciones
 *    comerciales, con una VISTA PREVIA en vivo estilo PDF (papel blanco).
 *  · OpcionesModal — opciones de la cotización (agrupar suministros, mostrar
 *    costos internos).
 */

import { FileText, X, Eye, SlidersHorizontal, Check } from 'lucide-react';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
  letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--y)',
  display: 'flex', alignItems: 'center', gap: '0.45rem',
};
const fieldLabel: React.CSSProperties = {
  fontSize: '0.62rem', color: 'var(--muted)', marginBottom: '0.3rem', display: 'block',
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
};
const ta: React.CSSProperties = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
  color: 'var(--text)', borderRadius: 'var(--r-sm)', padding: '0.55rem 0.7rem',
  fontSize: '0.85rem', outline: 'none', resize: 'vertical', lineHeight: 1.5,
};

/** Convierte texto multilínea en viñetas (quita •/-/* iniciales, filtra vacíos). */
const lineas = (t?: string): string[] =>
  (t || '').split('\n').map(l => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);

// ══════════════════════════════════════════════════════════════════════════════
export function DescripcionModal({
  descripcion, garantia, condiciones, empresa,
  onChange, onClose,
}: {
  descripcion: string; garantia: string; condiciones: string; empresa: EmpresaInfo | null;
  onChange: (campo: 'descripcion' | 'garantia' | 'condiciones', v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 900, width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <span style={sectionLabel}><FileText size={13} /> Descripción y condiciones</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>

        <div className="desc-modal-grid" style={{ overflowY: 'auto', flex: 1 }}>
          {/* Editor */}
          <div style={{ padding: '1.2rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid var(--border2)' }}>
            <div>
              <span style={fieldLabel}>Descripción general</span>
              <textarea style={ta} rows={3} value={descripcion} onChange={e => onChange('descripcion', e.target.value)} placeholder="Detalle o alcance general del servicio…" autoFocus />
            </div>
            <div>
              <span style={fieldLabel}>Garantía</span>
              <textarea style={ta} rows={4} value={garantia} onChange={e => onChange('garantia', e.target.value)} placeholder={'• Garantía de 6 meses sobre la mano de obra…'} />
            </div>
            <div>
              <span style={fieldLabel}>Condiciones comerciales</span>
              <textarea style={ta} rows={4} value={condiciones} onChange={e => onChange('condiciones', e.target.value)} placeholder={'• Validez de la oferta: 15 días…'} />
            </div>
          </div>

          {/* Vista previa PDF */}
          <div style={{ padding: '1.2rem 1.4rem', background: 'var(--bg3)' }}>
            <p style={{ ...sectionLabel, color: 'var(--muted)', marginBottom: '0.7rem' }}><Eye size={12} /> Vista previa</p>
            <div style={{ background: '#ffffff', color: '#1a1a1a', borderRadius: 6, padding: '1.1rem 1.2rem', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', fontSize: '0.72rem', lineHeight: 1.5 }}>
              <div style={{ borderBottom: '2px solid #111', paddingBottom: 6, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.8rem', letterSpacing: '0.02em' }}>{empresa?.nombre || 'InnVolt SpA'}</strong>
                <span style={{ fontSize: '0.62rem', color: '#666' }}>PRESUPUESTO</span>
              </div>
              {descripcion.trim() ? (
                <p style={{ margin: '0 0 12px', color: '#333' }}>{descripcion}</p>
              ) : (
                <p style={{ margin: '0 0 12px', color: '#aaa', fontStyle: 'italic' }}>La descripción general aparecerá aquí…</p>
              )}
              <PreviewBloque titulo="Garantía" items={lineas(garantia)} />
              <PreviewBloque titulo="Condiciones comerciales" items={lineas(condiciones)} />
            </div>
            <p style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.6rem', lineHeight: 1.4 }}>
              Referencia de cómo se verán estos textos en el PDF. El diseño final del PDF incluye logo, ítems y totales.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border2)' }}>
          <button onClick={onClose} className="btn btn-primary"><Check size={14} /> Listo</button>
        </div>
      </div>

      <style>{`
        .desc-modal-grid { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 720px) { .desc-modal-grid { grid-template-columns: 1fr; } .desc-modal-grid > div:first-child { border-right: none !important; border-bottom: 1px solid var(--border2); } }
      `}</style>
    </div>
  );
}

function PreviewBloque({ titulo, items }: { titulo: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontWeight: 700, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px', color: '#111' }}>{titulo}</p>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#888' }}>•</span>
          <span style={{ color: '#333' }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export function OpcionesModal({
  ocultarSuministros, ocultarCostos, onToggle, onClose,
}: {
  ocultarSuministros: boolean; ocultarCostos: boolean;
  onToggle: (campo: 'ocultarSuministros' | 'ocultarCostos') => void;
  onClose: () => void;
}) {
  const filas = [
    {
      campo: 'ocultarSuministros' as const, val: ocultarSuministros,
      label: 'Agrupar suministros en el PDF',
      hint: 'Los materiales se muestran como una sola línea "Suministros y materiales".',
    },
    {
      campo: 'ocultarCostos' as const, val: ocultarCostos,
      label: 'Ocultar costos y margen interno',
      hint: 'Oculta en pantalla las columnas de costo, imprevistos y margen. No afecta al PDF del cliente.',
    },
  ];
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.4rem', borderBottom: '1px solid var(--border2)' }}>
          <span style={sectionLabel}><SlidersHorizontal size={13} /> Opciones de la cotización</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {filas.map(f => (
            <div key={f.campo} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>{f.label}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.15rem 0 0', lineHeight: 1.4 }}>{f.hint}</p>
              </div>
              <button onClick={() => onToggle(f.campo)} aria-pressed={f.val} style={{ width: 42, height: 24, flexShrink: 0, background: f.val ? 'var(--y-brand)' : 'var(--bg3)', border: '1px solid var(--border2)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', borderRadius: 12 }}>
                <span style={{ position: 'absolute', top: 2, left: f.val ? 20 : 2, width: 18, height: 18, background: f.val ? 'var(--on-accent)' : 'var(--muted)', borderRadius: '50%', transition: 'left 0.2s' }} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.9rem 1.4rem', borderTop: '1px solid var(--border2)' }}>
          <button onClick={onClose} className="btn btn-primary"><Check size={14} /> Listo</button>
        </div>
      </div>
    </div>
  );
}
