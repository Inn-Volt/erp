/**
 * Cobranza (fase 25): cada trabajo es una cuenta corriente. Total de la cotización, abonos libres
 * (1,5M hoy, 500k mañana…) y saldo. El plan de cobro es la guía de lo que se espera y cuándo: lo
 * abonado va cubriendo sus cobros en orden. De lo abonado se descuentan los impuestos: el IVA (lo
 * que la cotización lleva de IVA, va al SII) y el PPM (% del neto que define el contador).
 * Sin React ni Supabase (pruebas: tests/unit/cobranza.test.ts).
 */

import type { HitoCobro } from '@/lib/cotizador/tipos';
import { montosHitos, type ValoresMoneda } from '@/lib/cotizador/planCobro';

const n = (v: unknown) => Number(v) || 0;

export type MedioAbono = 'transferencia' | 'efectivo' | 'cheque' | 'tarjeta' | 'otro';
export const MEDIOS_ABONO: { clave: MedioAbono; nombre: string }[] = [
  { clave: 'transferencia', nombre: 'Transferencia' },
  { clave: 'efectivo', nombre: 'Efectivo' },
  { clave: 'cheque', nombre: 'Cheque' },
  { clave: 'tarjeta', nombre: 'Tarjeta' },
  { clave: 'otro', nombre: 'Otro' },
];

export type EstadoCuenta = 'sin_abonos' | 'parcial' | 'pagado' | 'de_mas';
export const NOMBRE_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  sin_abonos: 'Sin abonos', parcial: 'Abonado', pagado: 'Pagado', de_mas: 'Pagó de más',
};

export type EstadoHito = 'cubierto' | 'parcial' | 'pendiente' | 'por_venir';

export interface HitoCuenta {
  nombre: string;
  cuando: HitoCobro['cuando'];
  /** Lo que se espera de este cobro, en pesos. */
  monto: number;
  /** Cuánto de lo abonado lo cubre (en orden del plan). */
  cubierto: number;
  estado: EstadoHito;
}

export interface EntradaCuenta {
  /** El total de la cotización en pesos (con IVA). */
  total: number;
  /** IVA ÷ total de la cotización (0 si no lleva IVA). */
  ivaRatio: number;
  plan: HitoCobro[];
  valores?: ValoresMoneda;
  abonos: { fecha: string; monto: number }[];
  /** El trabajo terminó: ya se espera también lo «al terminar». */
  terminado: boolean;
  /** PPM en % (0,25 = 0,25 %). */
  ppmPct?: number;
}

export interface Cuenta {
  total: number;
  abonado: number;
  /** Lo que falta (0 si ya se pagó todo). */
  saldo: number;
  /** Lo pagado de más (0 si no). */
  deMas: number;
  /** % del total abonado. */
  pct: number;
  estado: EstadoCuenta;
  /** Lo que ya debería haber entrado según el plan (lo «al aprobar» y, si terminó, lo «al terminar»). */
  esperado: number;
  /** Lo esperado que todavía no llega. */
  atrasado: number;
  hitos: HitoCuenta[];
  /** Impuestos de lo abonado y lo que de verdad queda. */
  iva: number;
  ppm: number;
  queda: number;
  ultimoAbono: string | null;
}

export function cuentaTrabajo(e: EntradaCuenta): Cuenta {
  const total = Math.round(n(e.total));
  const abonado = e.abonos.reduce((s, a) => s + Math.round(n(a.monto)), 0);
  let resto = abonado;
  const hitos: HitoCuenta[] = montosHitos(total, e.plan, e.valores).filter(h => h.monto > 0).map(h => {
    const cubierto = Math.min(h.monto, resto);
    resto -= cubierto;
    const vence = h.cuando === 'aprobar' || e.terminado;
    const estado: EstadoHito = cubierto >= h.monto ? 'cubierto' : cubierto > 0 ? 'parcial' : vence ? 'pendiente' : 'por_venir';
    return { nombre: h.nombre, cuando: h.cuando, monto: h.monto, cubierto, estado };
  });
  const esperado = hitos.filter(h => h.cuando === 'aprobar' || e.terminado).reduce((s, h) => s + h.monto, 0);
  const iva = Math.round(abonado * Math.min(Math.max(n(e.ivaRatio), 0), 1));
  const ppm = Math.round(((abonado - iva) * Math.max(n(e.ppmPct), 0)) / 100);
  const fechas = e.abonos.map(a => a.fecha).sort();
  return {
    total, abonado,
    saldo: Math.max(total - abonado, 0),
    deMas: Math.max(abonado - total, 0),
    pct: total > 0 ? (abonado / total) * 100 : 0,
    estado: abonado <= 0 ? 'sin_abonos' : abonado < total ? 'parcial' : abonado === total ? 'pagado' : 'de_mas',
    esperado,
    atrasado: Math.max(esperado - abonado, 0),
    hitos, iva, ppm, queda: abonado - iva - ppm,
    ultimoAbono: fechas.length ? fechas[fechas.length - 1] : null,
  };
}

/** Días entre dos fechas AAAA-MM-DD (b − a). */
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

/**
 * Lo de todos los trabajos junto (panel de dinero): por cobrar, atrasado y la antigüedad de lo
 * atrasado (0-30, 31-60, más de 60 días) desde que se esperaba (`desde`: aprobación o término).
 */
export function resumenCobranza(items: { cuenta: Cuenta; desde: string | null }[], hoy: string) {
  const tramos: [number, number, number] = [0, 0, 0];
  let porCobrar = 0, atrasado = 0;
  for (const { cuenta, desde } of items) {
    porCobrar += cuenta.saldo;
    atrasado += cuenta.atrasado;
    if (cuenta.atrasado > 0) {
      const d = desde ? Math.max(diasEntre(desde, hoy), 0) : 0;
      tramos[d <= 30 ? 0 : d <= 60 ? 1 : 2] += cuenta.atrasado;
    }
  }
  return { porCobrar, atrasado, tramos };
}

const pesos = (v: number) => `$${new Intl.NumberFormat('es-CL').format(Math.round(v))}`;

/** El recordatorio del saldo para el cliente (WhatsApp o correo): amable, con lo abonado y dónde pagar. */
export function recordatorioSaldo(o: {
  contacto?: string | null; folio: string; titulo?: string | null; abonado: number; total: number; saldo: number;
  empresa?: { nombre?: string | null; rut?: string | null; banco?: string | null; tipo_cuenta?: string | null; cuenta_bancaria?: string | null; email?: string | null } | null;
}): string {
  const e = o.empresa;
  const pago = e?.cuenta_bancaria
    ? `\n\nDatos para transferir: ${e.nombre}, RUT ${e.rut}, ${[e.banco, e.tipo_cuenta].filter(Boolean).join(' · ')} N° ${e.cuenta_bancaria}${e.email ? `, comprobante a ${e.email}` : ''}.`
    : '';
  const quien = o.contacto?.trim().split(' ')[0];
  return `Hola${quien ? ` ${quien}` : ''}, junto con saludar, te escribimos por el trabajo ${o.folio}${o.titulo ? ` «${o.titulo}»` : ''}: `
    + `a la fecha registramos abonos por ${pesos(o.abonado)} de ${pesos(o.total)}, y queda un saldo de ${pesos(o.saldo)}.${pago}`
    + `\n\nSi ya lo pagaste, envíanos el comprobante y disculpa la molestia. ¡Gracias!${e?.nombre ? `\n${e.nombre}` : ''}`;
}
