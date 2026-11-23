/** El estado de un trabajo contra su presupuesto (OK, ALERTA, SOBRE PRESUPUESTO…), con texto: nunca solo el color. */

import { NOMBRE_ESTADO, type EstadoControl } from '@/lib/controlProyecto';

const COLOR: Record<EstadoControl, { fondo: string; texto: string }> = {
  ok: { fondo: 'var(--success-soft)', texto: 'var(--success)' },
  alerta: { fondo: 'var(--y-soft)', texto: 'var(--y)' },
  sobre: { fondo: 'var(--danger-soft)', texto: 'var(--danger)' },
  sin_presupuesto: { fondo: 'var(--danger-soft)', texto: 'var(--danger)' },
};

export function ChipEstado({ estado }: { estado: EstadoControl }) {
  const c = COLOR[estado];
  return <span className="badge" style={{ background: c.fondo, color: c.texto, fontWeight: 700, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{NOMBRE_ESTADO[estado]}</span>;
}
