'use client';

/** Piezas compartidas de la Calculadora HH (fase 23). */

import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCLP } from '@/utils';
import type { EstadoTarifa } from '@/lib/hh/calculo';
import type { IndicadoresDia } from '@/lib/hh/indicadores';
import type { CatalogoHH } from '@/services/hh';

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
        width: 42, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative', border: 'none',
        background: activo ? 'var(--y-brand)' : 'var(--bg3)', boxShadow: 'inset 0 0 0 1px var(--border2)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background .15s',
      }}>
      <span style={{ position: 'absolute', top: 3, left: activo ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: activo ? 'var(--on-accent)' : 'var(--muted)', transition: 'left .15s' }} />
    </button>
  );
}

/** Las alertas de una tarifa: bajo el piso según costos y fuera del rango de mercado (siempre con texto e ícono). */
export function AlertasTarifa({ e, compacto }: { e: EstadoTarifa; compacto?: boolean }) {
  const chips: React.ReactNode[] = [];
  if (e.bajoPiso && e.piso !== null) {
    chips.push(
      <span key="piso" className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', gap: 4 }}>
        <AlertTriangle size={12} aria-hidden /> {compacto ? `Bajo el piso (${formatCLP(e.piso)})` : `Bajo el piso de ${formatCLP(e.piso)}: estás perdiendo plata`}
      </span>,
    );
  }
  if (e.mercado === 'bajo' || e.mercado === 'sobre') {
    const Icono = e.mercado === 'bajo' ? TrendingDown : TrendingUp;
    chips.push(
      <span key="mercado" className="badge" style={{ background: 'var(--bg3)', color: 'var(--text)', gap: 4 }}>
        <Icono size={12} aria-hidden /> {e.mercado === 'bajo' ? 'Bajo el rango de mercado' : 'Sobre el rango de mercado'}
      </span>,
    );
  }
  if (!chips.length) return null;
  return <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{chips}</span>;
}

/** Un campo con su etiqueta arriba. */
export function Campo({ etiqueta, children, ancho, ayuda }: { etiqueta: string; children: React.ReactNode; ancho?: number | string; ayuda?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, width: ancho, flex: ancho ? undefined : 1 }}>
      <span className="label-muted" title={ayuda}>{etiqueta}</span>
      {children}
    </label>
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

export const thEstilo: React.CSSProperties = {
  padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
};
export const tdEstilo: React.CSSProperties = { padding: '0.45rem 0.6rem', verticalAlign: 'middle' };
