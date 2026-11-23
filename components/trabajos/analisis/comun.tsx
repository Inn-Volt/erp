'use client';

/**
 * Piezas comunes del análisis de proyecto (fase 22): la barra de avance (lo gastado sobre lo
 * presupuestado), la celda «gastado de presupuestado», el «queda» y los estilos de las tablas.
 * El estado nunca va solo en el color: la celda dice «se pasó» o el % cuando se acerca al tope.
 */

import { AlertTriangle, CircleAlert } from 'lucide-react';
import type { Celda, Semaforo } from '@/lib/analisisProyecto';
import { formatCLP } from '@/utils';

export const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
export const inputTabla: React.CSSProperties = { padding: '0.25rem 0.4rem', fontSize: '0.78rem' };
/** 1.5 → «1,5»; 1000 → «1.000». */
export const cant = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-CL');
export const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} %`);

const COLOR: Record<Semaforo, string> = { ok: 'var(--success)', alerta: 'var(--y-brand)', sobre: 'var(--danger)' };

/** Barra delgada: el relleno es lo gastado sobre lo presupuestado y su color, el estado. */
export function Barra({ presupuesto, gastado, estado, ancho }: { presupuesto: number; gastado: number; estado: Semaforo; ancho?: number }) {
  const lleno = presupuesto > 0 ? Math.min(gastado / presupuesto, 1) : gastado > 0 ? 1 : 0;
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={Math.max(presupuesto, 1)} aria-valuenow={gastado}
      aria-label={`Gastado ${formatCLP(gastado)} de ${formatCLP(presupuesto)}`}
      style={{ height: 6, width: ancho ?? '100%', borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
      <div style={{ width: `${lleno * 100}%`, height: '100%', borderRadius: 3, background: COLOR[estado] }} />
    </div>
  );
}

/** El estado en palabras (con ícono) cuando no es verde: «se pasó» o «92 %». */
export function EstadoTexto({ c }: { c: Pick<Celda, 'presupuesto' | 'gastado' | 'estado'> }) {
  if (c.estado === 'ok') return null;
  const sobre = c.estado === 'sobre';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 700, color: sobre ? 'var(--danger)' : 'var(--y)' }}>
      {sobre ? <CircleAlert size={11} /> : <AlertTriangle size={11} />}
      {sobre ? (c.presupuesto > 0 ? 'se pasó' : 'sin presupuesto') : `${Math.round((c.gastado / c.presupuesto) * 100)} %`}
    </span>
  );
}

/** «$120.000 de $300.000» con su barra (vacío si no hay nada). */
export function CeldaGasto({ c, compacta }: { c: Celda; compacta?: boolean }) {
  if (!c.presupuesto && !c.gastado) return <span style={{ color: 'var(--faint)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: compacta ? 90 : 120 }}
      title={`Gastado ${formatCLP(c.gastado)} de ${formatCLP(c.presupuesto)} · queda ${formatCLP(c.queda)}`}>
      <span style={{ ...num, textAlign: 'left', fontSize: '0.78rem' }}>
        <b style={{ color: 'var(--text)' }}>{formatCLP(c.gastado)}</b> <span style={{ color: 'var(--muted)' }}>de {formatCLP(c.presupuesto)}</span>
      </span>
      <Barra presupuesto={c.presupuesto} gastado={c.gastado} estado={c.estado} />
      <EstadoTexto c={c} />
    </div>
  );
}

/** Lo que queda (en rojo si es negativo: se pasó). */
export function Queda({ v }: { v: number }) {
  return <span style={{ color: v < 0 ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>{formatCLP(v)}</span>;
}

/** Etiqueta pequeña: «no cotizado», «de más», «adicional»… */
export function Marca({ texto, tono = 'y' }: { texto: string; tono?: 'y' | 'danger' | 'muted' }) {
  const fondo = tono === 'danger' ? 'var(--danger-soft)' : tono === 'muted' ? 'var(--bg3)' : 'var(--y-soft)';
  const color = tono === 'danger' ? 'var(--danger)' : tono === 'muted' ? 'var(--muted)' : 'var(--text)';
  return <span className="badge" style={{ marginLeft: 4, fontSize: '0.64rem', background: fondo, color, whiteSpace: 'nowrap' }}>{texto}</span>;
}
