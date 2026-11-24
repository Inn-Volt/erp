/**
 * La forma de pago (plan de cobro) de una cotización: cada cobro es un % del total, un monto fijo
 * en pesos, UF o dólares, o «el resto» (lo que falte del total). Lo mismo que hace la base al
 * crear los cobros en «Por facturar» (_cot_generar_cobros, fase 24): un cobro en UF o dólares pasa
 * a pesos con el valor del día y el resto se lleva la diferencia, así la suma da el total exacto.
 * Sin React ni Supabase (pruebas: tests/unit/planCobro.test.ts).
 */

import { CUANDO_COBRO, type HitoCobro, type TipoHito } from './tipos';

/** La UF y el dólar con que se pasan a pesos los cobros en esas monedas. */
export interface ValoresMoneda { uf?: number | null; usd?: number | null }

const n = (v: unknown) => Number(v) || 0;
const numero = (v: number, decimales: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: decimales }).format(v);

export const TIPOS_HITO: { clave: TipoHito; nombre: string }[] = [
  { clave: 'pct', nombre: '%' },
  { clave: 'CLP', nombre: '$' },
  { clave: 'UF', nombre: 'UF' },
  { clave: 'USD', nombre: 'US$' },
  { clave: 'resto', nombre: 'El resto' },
];

export const tipoHito = (h: HitoCobro): TipoHito => h.tipo ?? 'pct';
/** Un monto fijo en UF o dólares (se pasa a pesos con el valor del día). */
export const enMonedaExtranjera = (h: HitoCobro) => tipoHito(h) === 'UF' || tipoHito(h) === 'USD';
const esFijo = (h: HitoCobro) => ['CLP', 'UF', 'USD'].includes(tipoHito(h));

/** El cobro pide algo: un % o un monto mayor que 0, o el resto. */
export function hitoActivo(h: HitoCobro): boolean {
  const t = tipoHito(h);
  return t === 'resto' || (t === 'pct' ? n(h.porcentaje) > 0 : n(h.valor) > 0);
}
export const planActivo = (plan: HitoCobro[] | null | undefined) => (plan || []).some(hitoActivo);

/** «30 %», «$500.000», «10 UF», «US$ 1.500» o «el saldo». */
export function detalleHito(h: HitoCobro): string {
  switch (tipoHito(h)) {
    case 'CLP': return `$${numero(Math.round(n(h.valor)), 0)}`;
    case 'UF': return `${numero(n(h.valor), 2)} UF`;
    case 'USD': return `US$ ${numero(n(h.valor), 2)}`;
    case 'resto': return 'el saldo';
    default: return `${numero(n(h.porcentaje), 2)} %`;
  }
}

/** Lo que lee el cliente: «10 UF al aprobar y el saldo al terminar el trabajo». */
export const planEnPalabras = (plan: HitoCobro[]) =>
  plan.filter(hitoActivo).map(h => `${detalleHito(h)} ${CUANDO_COBRO[h.cuando]}`).join(', ').replace(/, ([^,]*)$/, ' y $1');

/** Suma de los cobros en % (con 2 decimales). */
export const sumaPct = (plan: HitoCobro[]) => Math.round(plan.filter(h => tipoHito(h) === 'pct').reduce((s, h) => s + n(h.porcentaje), 0) * 100) / 100;

/** Lo que impide usar el plan (null = está bien). */
export function revisarPlan(plan: HitoCobro[]): string | null {
  if (!plan.some(hitoActivo)) return 'Agrega al menos un cobro.';
  if (plan.some(h => !h.nombre?.trim())) return 'Ponle nombre a cada cobro.';
  const nombres = plan.map(h => h.nombre.trim().toLowerCase());
  if (new Set(nombres).size < nombres.length) return 'Dos cobros no pueden llamarse igual.';
  const sinMonto = plan.find(h => esFijo(h) && !(n(h.valor) > 0));
  if (sinMonto) return `Falta el monto de «${sinMonto.nombre.trim()}».`;
  const restos = plan.filter(h => tipoHito(h) === 'resto').length;
  if (restos > 1) return 'Solo un cobro puede ser «el resto».';
  const suma = sumaPct(plan);
  if (restos) return suma >= 100 ? `Los porcentajes suman ${numero(suma, 2)} %: con «el resto» tienen que sumar menos de 100 %.` : null;
  if (plan.some(esFijo)) return 'Con montos fijos, uno de los cobros tiene que ser «el resto» (lo que falte del total).';
  return suma === 100 ? null : `Los porcentajes suman ${numero(suma, 2)} %: tienen que sumar 100 %.`;
}

// round(total × % / 100) como la base (numeric): el % va con toda su precisión (un primer pago en $
// deja un % con muchos decimales) y el medio peso sube aunque el decimal binario quede apenas debajo.
export const redondearPct = (total: number, porcentaje: number) => Math.round((n(total) * n(porcentaje)) / 100 + 1e-6);

/**
 * Cuánto es cada cobro en pesos. Solo en %: se reparte sobre el acumulado (la suma da exacta el
 * total). Con montos fijos o «el resto»: cada uno lo suyo (UF y dólares con `valores`) y el resto
 * se lleva lo que falte.
 */
export function montosHitos(total: number, plan: HitoCobro[], valores: ValoresMoneda = {}): (HitoCobro & { monto: number })[] {
  if (plan.every(h => tipoHito(h) === 'pct')) {
    let acum = 0;
    return plan.map(h => {
      const antes = acum;
      acum += n(h.porcentaje);
      return { ...h, monto: n(h.porcentaje) > 0 ? redondearPct(total, acum) - redondearPct(total, antes) : 0 };
    });
  }
  const propio = (h: HitoCobro): number => {
    if (!hitoActivo(h)) return 0;
    switch (tipoHito(h)) {
      case 'pct': return redondearPct(total, n(h.porcentaje));
      case 'CLP': return Math.round(n(h.valor));
      case 'UF': return Math.round(n(h.valor) * n(valores.uf));
      case 'USD': return Math.round(n(h.valor) * n(valores.usd));
      default: return 0;
    }
  };
  const montos = plan.map(propio);
  const otros = montos.reduce((s, m) => s + m, 0);
  return plan.map((h, i) => ({ ...h, monto: tipoHito(h) === 'resto' ? Math.max(0, Math.round(n(total)) - otros) : montos[i] }));
}
