'use client';

/**
 * SupuestosPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Equivale a la fila "SUPUESTOS GLOBALES" que cada hoja de presupuesto tiene
 * en el Excel de InnVolt (Margen Utilidad / Imprevistos / IVA por categoría).
 *
 * Al cambiar un supuesto se puede propagar a todos los ítems de esa categoría.
 */

import { useState } from 'react';
import { SlidersHorizontal, ChevronDown, RotateCcw, Info } from 'lucide-react';
import type { Supuestos, CategoriaItem } from '@/types';
import { CATEGORIA_LABELS, CATEGORIAS_ORDEN, CATEGORIA_COLORS, SUPUESTOS_DEFAULT } from '@/types';

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
  letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--y)',
  display: 'flex', alignItems: 'center', gap: '0.5rem',
};

const numInput: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)',
  fontFamily: 'var(--font-body)', fontSize: '0.78rem', padding: '0.3rem 0.35rem',
  outline: 'none', width: '100%', borderRadius: 'var(--r-sm)', textAlign: 'center',
};

const headCell: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.5rem',
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)',
  textAlign: 'center',
};

interface Props {
  supuestos: Supuestos;
  onChange: (s: Supuestos) => void;
  /** Reaplica los supuestos a todos los ítems existentes. */
  onAplicarATodos: () => void;
}

type Campo = 'margen' | 'imprevistos' | 'iva';

export default function SupuestosPanel({ supuestos, onChange, onAplicarATodos }: Props) {
  const [open, setOpen] = useState(false);

  const set = (cat: CategoriaItem, campo: Campo, valor: string) => {
    const v = Math.max(0, Math.min(parseFloat(valor) || 0, campo === 'margen' ? 99 : 100));
    onChange({ ...supuestos, [cat]: { ...supuestos[cat], [campo]: v } });
  };

  const resetear = () => onChange({ ...SUPUESTOS_DEFAULT });

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border2)',
      borderTop: '2px solid var(--y-brand)', borderRadius: 'var(--r)',
    }}>
      {/* Cabecera plegable */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '1rem', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '0.5rem',
        }}
      >
        <span style={sectionLabel}><SlidersHorizontal size={12} /> Supuestos Globales</span>
        <ChevronDown
          size={14}
          style={{
            opacity: 0.5, flexShrink: 0, transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div style={{ padding: '0 1rem 1rem' }}>
          {/* Tabla de supuestos */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 46px 46px 46px',
            gap: '4px', alignItems: 'center',
          }}>
            <span />
            <span style={headCell}>Marg.</span>
            <span style={headCell}>Impr.</span>
            <span style={headCell}>IVA</span>

            {CATEGORIAS_ORDEN.map(cat => (
              <FilaCategoria
                key={cat}
                cat={cat}
                valores={supuestos[cat]}
                onSet={set}
              />
            ))}
          </div>

          {/* Nota explicativa */}
          <div style={{
            marginTop: '0.7rem', padding: '0.5rem 0.6rem',
            background: 'var(--y-soft)', border: '1px solid var(--y-soft)',
            borderRadius: 'var(--r-sm)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start',
          }}>
            <Info size={11} color="var(--y)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: '0.63rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              Precio = Costo × (1 + Imprevistos) ÷ (1 − Margen). Valores del Excel InnVolt.
            </p>
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '0.6rem' }}>
            <button
              onClick={onAplicarATodos}
              style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border2)',
                color: 'var(--y)', cursor: 'pointer', padding: '0.45rem',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.58rem',
                letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 'var(--r-sm)',
              }}
            >
              Aplicar a todos los ítems
            </button>
            <button
              onClick={resetear}
              title="Restaurar valores del Excel"
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border2)',
                color: 'var(--muted)', cursor: 'pointer', padding: '0.45rem 0.6rem',
                borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center',
              }}
            >
              <RotateCcw size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fila de una categoría ────────────────────────────────────────────────────
function FilaCategoria({
  cat, valores, onSet,
}: {
  cat: CategoriaItem;
  valores: { margen: number; imprevistos: number; iva: number };
  onSet: (cat: CategoriaItem, campo: Campo, valor: string) => void;
}) {
  const color = CATEGORIA_COLORS[cat];
  const campos: Campo[] = ['margen', 'imprevistos', 'iva'];

  return (
    <>
      <span style={{
        fontSize: '0.68rem', color, fontFamily: 'var(--font-display)',
        fontWeight: 700, letterSpacing: '0.04em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {CATEGORIA_LABELS[cat]}
      </span>
      {campos.map(campo => (
        <input
          key={campo}
          type="number"
          min="0"
          max={campo === 'margen' ? 99 : 100}
          step="1"
          value={valores[campo]}
          onChange={e => onSet(cat, campo, e.target.value)}
          style={numInput}
          aria-label={`${CATEGORIA_LABELS[cat]} ${campo}`}
        />
      ))}
    </>
  );
}
