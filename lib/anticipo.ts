/**
 * Primer pago al aprobar (fase 20): en % o en $, cómo queda el plan de cobro y qué se hace con esa
 * plata. Sin React ni Supabase (pruebas: tests/unit/anticipo.test.ts).
 *
 *  · planConAnticipo: lo mismo que cot_aprobar_con_anticipo en la base: el hito «al aprobar» pasa a
 *    ser el primer pago. En un plan solo en %, los demás se reparten lo que queda en su misma
 *    proporción (si no hay ninguno, un «Saldo» al terminar). En uno con montos fijos o «el resto»
 *    (fase 24), el primer pago queda como monto en pesos y los demás igual (con un «Saldo» que se
 *    lleve el resto si no lo hay).
 *  · desgloseAnticipo: de lo que paga el cliente, cuánto es IVA (se paga al SII) y cómo se reparte
 *    el neto según lo cotizado: materiales, mano de obra, servicios, operación y utilidad. Y cuánto
 *    de los materiales cotizados alcanza a cubrir.
 */

import type { HitoCobro } from '@/lib/cotizador/tipos';
import { montosHitos, tipoHito, type ValoresMoneda } from '@/lib/cotizador/planCobro';
import { TIPOS_COSTO, type Presupuesto, type TipoCosto } from '@/lib/controlProyecto';

const n = (v: unknown) => Number(v) || 0;

/** El primer pago (en pesos) que trae el plan: el monto del primer hito «al aprobar». */
export function anticipoDelPlan(plan: HitoCobro[], total: number, valores?: ValoresMoneda): number {
  return montosHitos(total, plan, valores).find(h => h.cuando === 'aprobar')?.monto ?? 0;
}

export function planConAnticipo(plan: HitoCobro[], total: number, anticipo: number): HitoCobro[] {
  const t = n(total);
  const nombre = plan.find(h => h.cuando === 'aprobar')?.nombre || 'Anticipo';
  const resto = plan.filter(h => h.cuando !== 'aprobar');
  if (!plan.every(h => tipoHito(h) === 'pct')) {
    const monto = Math.round(Math.min(Math.max(n(anticipo), 0), t));
    const nuevo: HitoCobro[] = monto > 0 ? [{ nombre, porcentaje: 0, cuando: 'aprobar', tipo: 'CLP', valor: monto }] : [];
    nuevo.push(...resto);
    if (!resto.some(h => tipoHito(h) === 'resto') && monto < t) {
      nuevo.push({ nombre: resto.some(h => h.nombre.trim() === 'Saldo') ? 'Saldo final' : 'Saldo', porcentaje: 0, cuando: 'terminar', tipo: 'resto' });
    }
    return nuevo;
  }
  const pct = t > 0 ? (Math.round(Math.min(Math.max(n(anticipo), 0), t)) * 100) / t : 0;
  const sumaResto = resto.reduce((s, h) => s + n(h.porcentaje), 0);
  const nuevo: HitoCobro[] = pct > 0 ? [{ nombre, porcentaje: pct, cuando: 'aprobar' }] : [];
  if (pct < 100) {
    if (sumaResto > 0) nuevo.push(...resto.map(h => ({ ...h, porcentaje: (n(h.porcentaje) * (100 - pct)) / sumaResto })));
    else nuevo.push({ nombre: 'Saldo', porcentaje: 100 - pct, cuando: 'terminar' });
  }
  return nuevo;
}

export interface DesgloseAnticipo {
  monto: number;
  /** % del total. */
  pct: number;
  /** IVA incluido en el pago (va al SII). */
  iva: number;
  neto: number;
  /** El neto repartido como lo cotizado. */
  costos: Record<TipoCosto, number>;
  utilidad: number;
  /** Lo que queda por cobrar. */
  saldo: number;
  /** Materiales cotizados y cuánto de ellos cubre el neto del pago (%). */
  materiales: number;
  cubreMateriales: number | null;
}

/** `ivaRatio`: IVA ÷ total de la cotización (0 si es exenta). Todo en pesos. */
export function desgloseAnticipo(o: { monto: number; total: number; ivaRatio: number; presupuesto: Presupuesto }): DesgloseAnticipo {
  const monto = Math.round(n(o.monto));
  const iva = Math.round(monto * Math.min(Math.max(n(o.ivaRatio), 0), 1));
  const neto = monto - iva;
  const venta = o.presupuesto.venta;
  const costos = Object.fromEntries(TIPOS_COSTO.map(t => [t.clave, venta > 0 ? Math.round((neto * o.presupuesto.costoPorTipo[t.clave]) / venta) : 0])) as Record<TipoCosto, number>;
  const materiales = o.presupuesto.costoPorTipo.material;
  return {
    monto, pct: n(o.total) > 0 ? (monto / n(o.total)) * 100 : 0, iva, neto, costos,
    utilidad: neto - Object.values(costos).reduce((s, v) => s + v, 0),
    saldo: Math.max(Math.round(n(o.total)) - monto, 0),
    materiales, cubreMateriales: materiales > 0 ? (neto / materiales) * 100 : null,
  };
}
