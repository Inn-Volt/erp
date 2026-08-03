'use client';

/**
 * Modales del cotizador
 * ─────────────────────────────────────────────────────────────────────────────
 *  · DescripcionModal — edita descripción general, garantía y condiciones
 *    comerciales, con una VISTA PREVIA en vivo estilo PDF (papel blanco).
 *  · OpcionesModal — opciones de la cotización (agrupar suministros, mostrar
 *    costos internos).
 */

import { useRef } from 'react';
import { FileText, X, Eye, SlidersHorizontal, Check, Bold, List } from 'lucide-react';
import type { EmpresaInfo } from '@/components/pdf/PresupuestoPDF';

type Campo = 'descripcion' | 'garantia' | 'condiciones';

/** Convierte **negrita** de un texto en nodos React (para la vista previa). */
function renderInline(text: string): React.ReactNode {
  const re = /\*\*([^*]+)\*\*/g;
  const out: React.ReactNode[] = [];
  let last = 0; let k = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={k++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}

/** Barra con acciones de formato (negrita, viñeta) para un campo de texto. */
function FmtBar({ onBold, onBullet }: { onBold: () => void; onBullet: () => void }) {
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.22rem 0.5rem',
    fontSize: '0.68rem', background: 'var(--bg2)', border: '1px solid var(--input-border)',
    borderRadius: 'var(--r-xs)', color: 'var(--muted)', cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      <button type="button" onClick={onBold} style={btn} title="Negrita: **texto**"><Bold size={12} /> Negrita</button>
      <button type="button" onClick={onBullet} style={btn} title="Viñeta al inicio de línea"><List size={12} /> Viñeta</button>
    </div>
  );
}

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
  onChange: (campo: Campo, v: string) => void;
  onClose: () => void;
}) {
  const refs = useRef<Record<Campo, HTMLTextAreaElement | null>>({ descripcion: null, garantia: null, condiciones: null });

  /** Aplica formato (negrita/viñeta) sobre la selección del textarea del campo. */
  const aplicar = (field: Campo, tipo: 'bold' | 'bullet') => {
    const el = refs.current[field];
    if (!el) return;
    const value = el.value;
    const a = el.selectionStart ?? value.length;
    const b = el.selectionEnd ?? value.length;
    let next = value; let selA = a; let selB = b;

    if (tipo === 'bold') {
      const sel = value.slice(a, b) || 'texto';
      next = value.slice(0, a) + '**' + sel + '**' + value.slice(b);
      selA = a + 2; selB = a + 2 + sel.length;
    } else {
      // Viñeta: prefija cada línea del rango (o la línea actual) con "• "
      const lineStart = value.lastIndexOf('\n', a - 1) + 1;
      const nl = value.indexOf('\n', b);
      const end = nl === -1 ? value.length : nl;
      const bloque = value.slice(lineStart, end);
      const conVinetas = bloque.split('\n').map(l => (/^\s*•\s/.test(l) ? l : '• ' + l)).join('\n');
      next = value.slice(0, lineStart) + conVinetas + value.slice(end);
      selA = lineStart; selB = lineStart + conVinetas.length;
    }

    onChange(field, next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(selA, selB); });
  };

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
              <FmtBar onBold={() => aplicar('descripcion', 'bold')} onBullet={() => aplicar('descripcion', 'bullet')} />
              <textarea ref={el => { refs.current.descripcion = el; }} style={ta} rows={5} value={descripcion} onChange={e => onChange('descripcion', e.target.value)} placeholder={'Detalle o alcance general del servicio…\nUsa **negrita** y el botón Viñeta para dar formato.'} autoFocus />
            </div>
            <div>
              <span style={fieldLabel}>Garantía</span>
              <FmtBar onBold={() => aplicar('garantia', 'bold')} onBullet={() => aplicar('garantia', 'bullet')} />
              <textarea ref={el => { refs.current.garantia = el; }} style={ta} rows={4} value={garantia} onChange={e => onChange('garantia', e.target.value)} placeholder={'• Garantía de 6 meses sobre la mano de obra…'} />
            </div>
            <div>
              <span style={fieldLabel}>Condiciones comerciales</span>
              <FmtBar onBold={() => aplicar('condiciones', 'bold')} onBullet={() => aplicar('condiciones', 'bullet')} />
              <textarea ref={el => { refs.current.condiciones = el; }} style={ta} rows={4} value={condiciones} onChange={e => onChange('condiciones', e.target.value)} placeholder={'• Validez de la oferta: 15 días…'} />
            </div>
          </div>

          {/* Vista previa — réplica fiel del PDF (papel blanco, negro + remate amarillo) */}
          <div style={{ padding: '1.2rem 1.4rem', background: 'var(--bg3)' }}>
            <p style={{ ...sectionLabel, color: 'var(--muted)', marginBottom: '0.7rem' }}><Eye size={12} /> Vista previa</p>
            <div style={{ background: '#ffffff', color: '#1a1a1a', borderRadius: 6, overflow: 'hidden', boxShadow: '0 6px 22px rgba(0,0,0,0.22)', fontFamily: 'Helvetica, Arial, sans-serif' }}>
              {/* barra de acento (como el PDF) */}
              <div style={{ display: 'flex', height: 4 }}>
                <div style={{ flex: 1, background: '#1a1a1a' }} />
                <div style={{ width: 64, background: '#ffc600' }} />
              </div>
              <div style={{ padding: '0.95rem 1.1rem' }}>
                {/* header */}
                <div style={{ borderBottom: '1px solid #e2e2e2', paddingBottom: 8, marginBottom: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '0.82rem', color: '#1a1a1a' }}>{empresa?.nombre || 'InnVolt SpA'}</strong>
                  <span style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.16em', color: '#8a8a8a' }}>COTIZACIÓN</span>
                </div>
                {/* descripción (tarjeta con borde amarillo) */}
                <div style={{ background: '#f6f6f4', borderLeft: '3px solid #ffc600', borderRadius: 4, padding: '0.55rem 0.65rem', marginBottom: 13 }}>
                  <p style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.14em', color: '#1a1a1a', margin: '0 0 4px' }}>DESCRIPCIÓN DEL TRABAJO</p>
                  {descripcion.trim() ? (
                    <div style={{ margin: 0, color: '#333', fontSize: '0.68rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderInline(descripcion)}</div>
                  ) : (
                    <p style={{ margin: 0, color: '#aaa', fontStyle: 'italic', fontSize: '0.68rem' }}>La descripción general aparecerá aquí…</p>
                  )}
                </div>
                <PreviewBloque titulo="Garantía" items={lineas(garantia)} />
                <PreviewBloque titulo="Condiciones comerciales" items={lineas(condiciones)} />
              </div>
            </div>
            <p style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.6rem', lineHeight: 1.4 }}>
              Así se verán estos textos en el PDF. El documento final incluye además logo, ítems, totales y firmas.
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
    <div style={{ marginBottom: 11 }}>
      <p style={{ fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 5px', paddingBottom: 3, borderBottom: '1.5px solid #1a1a1a', color: '#1a1a1a' }}>{titulo}</p>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
          <span style={{ color: '#8a8a8a' }}>•</span>
          <span style={{ color: '#333', fontSize: '0.66rem', lineHeight: 1.45 }}>{renderInline(t)}</span>
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
