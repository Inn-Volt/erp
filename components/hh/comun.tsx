'use client';

/** Piezas compartidas de la Calculadora HH (fase 23). */

import { useState } from 'react';
import { AlertTriangle, Minus, Plus, TrendingDown, TrendingUp, X } from 'lucide-react';
import { formatCLP } from '@/utils';
import type { EstadoTarifa } from '@/lib/hh/calculo';
import type { IndicadoresDia } from '@/lib/hh/indicadores';
import type { CatalogoHH } from '@/services/hh';
import s from './hh.module.css';

/** Lo que recibe cada pestaña. */
export interface PropsPestana {
  cat: CatalogoHH;
  /** La UF y el dólar de hoy (números). */
  valores: { uf: number; usd: number };
  /** Con su fuente y su fecha. */
  dia: IndicadoresDia;
  onCambio: () => Promise<void> | void;
}

export function Interruptor({ activo, onChange, disabled, etiqueta }: { activo: boolean; onChange: () => void; disabled?: boolean; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} title={etiqueta} onClick={onChange} disabled={disabled}
      style={{
        width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative', border: 'none',
        background: activo ? 'var(--y-brand)' : 'var(--bg3)', boxShadow: 'inset 0 0 0 1px var(--border2)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background .15s',
      }}>
      <span style={{ position: 'absolute', top: 3, left: activo ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: activo ? 'var(--on-accent)' : 'var(--muted)', transition: 'left .15s' }} />
    </button>
  );
}

/** Las alertas de una tarifa: bajo el piso según costos y fuera del rango de mercado (siempre con texto e ícono). */
export function AlertasTarifa({ e, compacto }: { e: EstadoTarifa; compacto?: boolean }) {
  const chips: React.ReactNode[] = [];
  if (e.bajoPiso && e.piso !== null) {
    chips.push(
      <span key="piso" className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', gap: 4 }}>
        <AlertTriangle size={12} aria-hidden /> {compacto ? `Bajo el piso (${formatCLP(e.piso)}/h)` : `Bajo el piso de ${formatCLP(e.piso)}/h: estás perdiendo plata`}
      </span>,
    );
  }
  if (e.mercado === 'bajo' || e.mercado === 'sobre') {
    const Icono = e.mercado === 'bajo' ? TrendingDown : TrendingUp;
    chips.push(
      <span key="mercado" className="badge" style={{ background: 'var(--bg3)', color: 'var(--text)', gap: 4 }}>
        <Icono size={12} aria-hidden /> {e.mercado === 'bajo' ? 'Bajo el mercado' : 'Sobre el mercado'}
      </span>,
    );
  }
  if (!chips.length) return null;
  return <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{chips}</span>;
}

/** Un campo con su etiqueta arriba (y una ayuda corta debajo, si la hay). */
export function Campo({ etiqueta, children, ayuda, ancho }: { etiqueta: string; children: React.ReactNode; ayuda?: React.ReactNode; ancho?: number | string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, width: ancho }}>
      <span className="label-muted">{etiqueta}</span>
      {children}
      {ayuda && <span style={{ fontSize: '0.74rem', color: 'var(--muted)', lineHeight: 1.4 }}>{ayuda}</span>}
    </label>
  );
}

/** Cantidad con botones − y + (cómodo con el dedo). Acepta decimales con coma. */
export function Cantidad({ valor, onCambio, min = 0, paso = 1, grande, etiqueta }: {
  valor: number; onCambio: (v: number) => void; min?: number; paso?: number; grande?: boolean; etiqueta: string;
}) {
  // Mientras se escribe se conserva el texto tal cual («1,» para llegar a «1,5»).
  const [texto, setTexto] = useState<string | null>(null);
  const fijar = (v: number) => onCambio(Math.max(min, Math.round(v * 100) / 100));
  return (
    <span className={`${s.stepper} ${grande ? s.stepperGrande : ''}`}>
      <button type="button" onClick={() => fijar(valor - paso)} disabled={valor - paso < min} aria-label={`Menos ${etiqueta}`}><Minus size={15} /></button>
      <input inputMode="decimal" aria-label={etiqueta} value={texto ?? String(valor).replace('.', ',')}
        onFocus={e => { setTexto(String(valor).replace('.', ',')); e.target.select(); }}
        onBlur={() => setTexto(null)}
        onChange={e => {
          setTexto(e.target.value);
          const v = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
          if (e.target.value.trim() && Number.isFinite(v)) fijar(v);
        }} />
      <button type="button" onClick={() => fijar(valor + paso)} aria-label={`Más ${etiqueta}`}><Plus size={15} /></button>
    </span>
  );
}

/** Ventana: en el celular sube desde abajo y ocupa casi toda la pantalla. Esc la cierra (CerrarConEscape). */
export function Hoja({ titulo, onCerrar, children, pie, ancho = 560 }: {
  titulo: React.ReactNode; onCerrar: () => void; children: React.ReactNode; pie?: React.ReactNode; ancho?: number;
}) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={`modal-box ${s.hoja}`} role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}
        style={{ maxWidth: ancho, width: `min(95vw, ${ancho}px)` }}>
        <div className={s.hojaCabeza}>
          <h2>{titulo}</h2>
          <button type="button" className={s.iconoBtn} onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className={s.hojaCuerpo}>{children}</div>
        {pie && <div className={s.hojaPie}>{pie}</div>}
      </div>
    </div>
  );
}

/** Fecha AAAA-MM-DD → DD-MM-AAAA. */
export const fechaCL = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${a}`;
};

/** Porcentaje es-CL con hasta 1 decimal: 0,25 → «25 %». */
export const pctCL = (v: number) => `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(v * 100)} %`;

/** Mensaje con su ícono para una sección vacía o un aviso. */
export function Vacio({ children }: { children: React.ReactNode }) {
  return <div className={`panel ${s.vacio}`}>{children}</div>;
}
