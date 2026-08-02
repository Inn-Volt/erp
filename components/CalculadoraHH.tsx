'use client';

/**
 * CalculadoraHH
 * ─────────────────────────────────────────────────────────────────────────────
 * Réplica del bloque de cálculo de horas hombre de la hoja
 * "Presupuesto Mano de Obra" del Excel de InnVolt (celdas Q1:V4).
 *
 *   Horas Reales    = HH Base / (técnicos + ayudantes)          (T2)
 *   Sueldo día 8 h  = sueldo base × (1 + margen extra)          (V2 / V4)
 *   Valor Hora      = Sueldo día / 8                            (R4 / S4)
 *   Costo Total     = Horas Reales × (téc×VHtéc + ayu×VHayu)    (T4)
 *
 * Al confirmar, genera un ítem de Mano de Obra listo para la cotización.
 */

import { useState, useMemo } from 'react';
import { X, HardHat, Calculator, Check, Users, Clock } from 'lucide-react';
import { calcularHH, formatCLP, HH_DEFAULT } from '@/utils';
import type { HHInput } from '@/utils';
import NumeroInput from '@/components/NumeroInput';

const label: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
  letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)',
  display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem',
};
const fieldLabel: React.CSSProperties = {
  fontSize: '0.65rem', color: 'var(--muted)', marginBottom: '0.2rem',
  display: 'block', fontFamily: 'var(--font-display)',
  letterSpacing: '0.08em', textTransform: 'uppercase',
};
const input: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)',
  fontFamily: 'var(--font-body)', fontSize: '0.85rem', padding: '0.45rem 0.6rem',
  outline: 'none', width: '100%', borderRadius: 'var(--r)', textAlign: 'right',
};
const panel: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border2)',
  borderTop: '2px solid var(--y-brand)', padding: '1rem', borderRadius: 'var(--r)',
};

interface Props {
  /** Descripción sugerida para el ítem generado. */
  descripcionInicial?: string;
  onConfirm: (costo: number, descripcion: string, horas: number) => void;
  onClose: () => void;
}

export default function CalculadoraHH({ descripcionInicial = '', onConfirm, onClose }: Props) {
  const [hh, setHH] = useState<HHInput>({ ...HH_DEFAULT });
  const [descripcion, setDescripcion] = useState(descripcionInicial);

  const r = useMemo(() => calcularHH(hh), [hh]);

  const set = (k: keyof HHInput, v: string) =>
    setHH(prev => ({ ...prev, [k]: parseFloat(v) || 0 }));

  const filas: [string, string][] = [
    ['Horas reales por persona', `${Math.round(r.horasReales * 100) / 100} h`],
    ['Valor hora técnico',        formatCLP(r.valorHoraTecnico)],
    ['Valor hora ayudante',       formatCLP(r.valorHoraAyudante)],
    ['Personal en obra',          `${r.totalPersonas} persona${r.totalPersonas === 1 ? '' : 's'}`],
  ];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 560, width: '95%', maxHeight: '92vh', overflowY: 'auto', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 10,
        }}>
          <span style={{ ...label, marginBottom: 0 }}>
            <Calculator size={13} /> Calculadora de Horas Hombre
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Trabajo ── */}
          <div style={panel}>
            <p style={label}><Clock size={12} /> Trabajo a realizar</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div>
                <span style={fieldLabel}>Descripción del trabajo</span>
                <input
                  style={{ ...input, textAlign: 'left' }}
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder="Ej. Instalación de tablero eléctrico"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div>
                  <span style={fieldLabel}>HH Base (horas totales)</span>
                  <input style={input} type="number" min="0" step="0.5"
                    value={hh.hhBase || ''} onChange={e => set('hhBase', e.target.value)} placeholder="24" />
                </div>
                <div>
                  <span style={fieldLabel}>Recargo por especialidad %</span>
                  <input style={input} type="number" min="0" step="1"
                    value={hh.margenExtra || ''} onChange={e => set('margenExtra', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Cuadrilla ── */}
          <div style={panel}>
            <p style={label}><Users size={12} /> Cuadrilla</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <span style={fieldLabel}>N° Técnicos</span>
                <input style={input} type="number" min="0" step="1"
                  value={hh.tecnicos} onChange={e => set('tecnicos', e.target.value)} />
              </div>
              <div>
                <span style={fieldLabel}>N° Ayudantes</span>
                <input style={input} type="number" min="0" step="1"
                  value={hh.ayudantes} onChange={e => set('ayudantes', e.target.value)} />
              </div>
              <div>
                <span style={fieldLabel}>Sueldo técnico / día 8 h</span>
                <NumeroInput prefijo="$" value={hh.sueldoTecnicoDia} onChange={v => setHH(p => ({ ...p, sueldoTecnicoDia: v }))} placeholder="60.000" style={{ ...input, textAlign: 'right' }} />
              </div>
              <div>
                <span style={fieldLabel}>Sueldo ayudante / día 8 h</span>
                <NumeroInput prefijo="$" value={hh.sueldoAyudanteDia} onChange={v => setHH(p => ({ ...p, sueldoAyudanteDia: v }))} placeholder="40.000" style={{ ...input, textAlign: 'right' }} />
              </div>
            </div>
          </div>

          {/* ── Resultado ── */}
          <div style={{ ...panel, borderTopColor: 'var(--success)' }}>
            <p style={{ ...label, color: 'var(--success)' }}><HardHat size={12} /> Resultado</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {filas.map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingBottom: '0.25rem', borderBottom: '1px solid var(--border-soft)',
                }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: '0.75rem', padding: '0.7rem 0.85rem', background: 'var(--bg3)',
              borderTop: '2px solid var(--success)', borderRadius: 'var(--r-sm)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{
                fontSize: '0.62rem', color: 'var(--muted)', fontFamily: 'var(--font-display)',
                letterSpacing: '0.15em', textTransform: 'uppercase',
              }}>
                Costo mano de obra
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.3rem', color: 'var(--success)' }}>
                {formatCLP(r.costoTotal)}
              </span>
            </div>

            <p style={{ fontSize: '0.65rem', color: 'var(--muted)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
              Este es el <strong>costo interno</strong>. Al agregarlo se le aplicarán los
              imprevistos y el margen de Mano de Obra definidos en los supuestos.
            </p>
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              background: 'var(--bg3)', border: '1px solid var(--border2)',
              color: 'var(--muted)', cursor: 'pointer',
              padding: '0 1.2rem', height: 40, borderRadius: 'var(--r)',
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(
                Math.round(r.costoTotal),
                descripcion.trim() || 'Mano de obra según cálculo HH',
                Math.round(r.horasReales * 100) / 100,
              )}
              disabled={r.costoTotal <= 0}
              style={{
                background: r.costoTotal > 0 ? 'var(--y-brand)' : 'var(--bg3)',
                color: r.costoTotal > 0 ? 'var(--on-accent)' : 'var(--muted)',
                border: 'none', cursor: r.costoTotal > 0 ? 'pointer' : 'not-allowed',
                padding: '0 1.5rem', height: 40, borderRadius: 'var(--r)',
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}
            >
              <Check size={13} /> Agregar a cotización
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
