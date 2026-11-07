/**
 * Fondos por persona (fase 19, las «Rendiciones 2.0» de TecApp): las cuentas en palabras y el
 * libro del fondo. La base calcula el saldo de verdad (fondo_cuentas); aquí solo se ordena lo
 * mismo para leerlo: cada movimiento y cada gasto con el saldo que deja.
 *
 *   Fondo de la persona = entregas − devoluciones − compensaciones − lo gastado del fondo
 *   Lo que se le debe   = lo que puso de su bolsillo − pagos − compensaciones
 */

export type TipoMovimiento = 'entrega' | 'devolucion' | 'pago' | 'compensacion' | 'reversa';
export interface MovimientoFondo {
  id: string; folio: number; usuario_id: string; tipo: TipoMovimiento; monto: number; fecha: string;
  estado: 'confirmado' | 'por_confirmar' | 'descartado'; nota: string | null; motivo: string | null;
  comprobante_path: string | null; revierte_id: string | null; revertido: boolean; anticipo_id: string | null;
  creado_por: string | null; confirmado_por: string | null; created_at: string;
}
export interface GastoDelFondo {
  id: string; fecha: string; monto: number; monto_fondo: number | null; monto_propio: number | null;
  pagado_con: 'fondo' | 'mixto' | 'propio' | 'empresa' | null; estado: string; descripcion: string | null; categoria: string; created_at?: string | null;
}
export interface Cuentas { en_fondo: number; disponible: number; por_confirmar: number; debemos: number; en_revision: number }

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  entrega: 'Entrega', devolucion: 'Devolución', pago: 'Pago de lo que puso', compensacion: 'Descontado del fondo', reversa: 'Reversa',
};
export const folioMovimiento = (n: number) => `FM-${String(n || 0).padStart(4, '0')}`;

/** Lo que un movimiento confirmado le hace al fondo y a lo que se le debe (una reversa, lo contrario del revertido). */
export function efectoMovimiento(m: Pick<MovimientoFondo, 'tipo' | 'monto'>, tipoRevertido?: TipoMovimiento | null): { fondo: number; deuda: number } {
  const clase = m.tipo === 'reversa' ? tipoRevertido : m.tipo;
  const signo = m.tipo === 'reversa' ? -1 : 1;
  const monto = Number(m.monto) || 0;
  const fondo = clase === 'entrega' ? monto : clase === 'devolucion' || clase === 'compensacion' ? -monto : 0;
  const deuda = clase === 'pago' || clase === 'compensacion' ? -monto : 0;
  return { fondo: signo * fondo, deuda: signo * deuda };
}

export interface FilaLibro {
  clave: string; fecha: string; tipo: 'movimiento' | 'gasto';
  texto: string; detalle: string;
  /** Lo que mueve en el fondo y en lo que se le debe (0 si no toca). */
  fondo: number; deuda: number;
  /** Cómo quedan después de esta fila. */
  saldoFondo: number; saldoDeuda: number;
  /** Devolución declarada que espera confirmación: reserva, pero aún no sale. */
  enCamino?: boolean;
  /** Descartada o revertida: se muestra tachada. */
  tachada?: boolean;
  movimiento?: MovimientoFondo; gasto?: GastoDelFondo;
}

const n = (v: number | null | undefined) => Number(v) || 0;
const clp = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');

/** El libro: movimientos y gastos por fecha, con el saldo del fondo y de lo que se le debe en cada paso. */
export function libroDelFondo(movimientos: MovimientoFondo[], gastos: GastoDelFondo[]): FilaLibro[] {
  const porId = new Map(movimientos.map(m => [m.id, m]));
  const filas: Omit<FilaLibro, 'saldoFondo' | 'saldoDeuda'>[] = [];
  for (const m of movimientos) {
    const rev = m.revierte_id ? porId.get(m.revierte_id) : undefined;
    const cuenta = m.estado === 'confirmado';
    const e = cuenta ? efectoMovimiento(m, rev?.tipo) : { fondo: 0, deuda: 0 };
    filas.push({
      clave: `m:${m.id}`, fecha: m.fecha, tipo: 'movimiento',
      texto: m.tipo === 'reversa' && rev ? `Reversa de ${folioMovimiento(rev.folio)} (${NOMBRE_MOVIMIENTO[rev.tipo].toLowerCase()})` : NOMBRE_MOVIMIENTO[m.tipo],
      detalle: [folioMovimiento(m.folio), m.nota, m.motivo, m.estado === 'por_confirmar' ? 'por confirmar' : m.estado === 'descartado' ? 'no llegó' : m.revertido ? 'revertido' : '']
        .filter(Boolean).join(' · '),
      fondo: e.fondo, deuda: e.deuda,
      enCamino: m.estado === 'por_confirmar', tachada: m.estado === 'descartado',
      movimiento: m,
    });
  }
  for (const g of gastos) {
    if (g.estado === 'rechazado') continue;
    const propio = g.estado === 'observado' ? 0 : n(g.monto_propio);
    filas.push({
      clave: `g:${g.id}`, fecha: g.fecha, tipo: 'gasto',
      texto: g.descripcion?.trim() || conMayuscula(g.categoria || 'gasto'),
      detalle: [g.pagado_con === 'empresa' ? 'tarjeta de la empresa' : n(g.monto_fondo) && n(g.monto_propio) ? `${clp(n(g.monto_fondo))} del fondo y ${clp(n(g.monto_propio))} de su bolsillo`
        : n(g.monto_propio) ? 'de su bolsillo' : 'del fondo', g.estado === 'observado' ? 'observado' : g.estado === 'reembolsado' ? 'pagado' : ''].filter(Boolean).join(' · '),
      fondo: -n(g.monto_fondo), deuda: propio, gasto: g,
    });
  }
  // Por fecha; el mismo día, en el orden en que se registraron.
  const orden = (f: Omit<FilaLibro, 'saldoFondo' | 'saldoDeuda'>) => f.movimiento?.created_at || f.gasto?.created_at || '';
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || orden(a).localeCompare(orden(b)));
  let sf = 0, sd = 0;
  return filas.map(f => { sf += f.fondo; sd += f.deuda; return { ...f, saldoFondo: Math.round(sf * 100) / 100, saldoDeuda: Math.round(sd * 100) / 100 }; });
}

/** Lo que saldrá del fondo y lo que pondrá la persona (lo mismo que hará la base al guardar). */
export function repartoPrevisto(monto: number, disponible: number): { delFondo: number; propio: number; como: 'fondo' | 'mixto' | 'propio' } {
  const m = Math.max(Number(monto) || 0, 0);
  const delFondo = Math.min(Math.max(Number(disponible) || 0, 0), m);
  const propio = m - delFondo;
  return { delFondo, propio, como: propio === 0 ? 'fondo' : delFondo === 0 ? 'propio' : 'mixto' };
}

/**
 * «¿Con qué pagaste?»: si el fondo alcanza, solo «con mi fondo»; si alcanza a medias, «con mi fondo
 * y mi dinero»; sin fondo, «con mi dinero». La tarjeta de la empresa, solo para quien paga.
 */
export function opcionesDePago(monto: number, disponible: number, puedeTarjeta: boolean): { valor: 'fondo' | 'empresa'; texto: string }[] {
  const r = repartoPrevisto(monto, disponible);
  const propia = r.como === 'fondo' ? 'Con mi fondo' : r.como === 'mixto' ? 'Con mi fondo y mi dinero' : 'Con mi dinero';
  return [{ valor: 'fondo', texto: propia }, ...(puedeTarjeta ? [{ valor: 'empresa' as const, texto: 'Con la tarjeta de la empresa' }] : [])];
}

/** «Tienes $35.000 para el día a día · te debemos $5.000» */
export function resumenCuentas(c: Cuentas, fmt: (v: number) => string): string {
  const partes = [`${fmt(c.disponible)} disponible en el fondo`];
  if (c.por_confirmar > 0) partes.push(`${fmt(c.por_confirmar)} en devoluciones por confirmar`);
  if (c.debemos > 0) partes.push(`se le deben ${fmt(c.debemos)}`);
  if (c.en_revision > 0) partes.push(`${fmt(c.en_revision)} en gastos observados`);
  return partes.join(' · ');
}
