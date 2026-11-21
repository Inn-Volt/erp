/**
 * Mano de obra (fase 20): cuánto cuesta el personal interno y cuánto los externos. Son las mismas
 * cuentas que hace la base al registrar (trabajador_costo_dia y mano_obra_reglas); aquí sirven
 * para mostrarlas antes de guardar. Sin React ni Supabase (pruebas: tests/unit/manoObra.test.ts).
 *
 *  · Interno: se registra su sueldo LÍQUIDO (sin colación ni movilización) y sus descuentos, los de
 *             cada uno: AFP, salud y cesantía (% del bruto) y otros en $ (Isapre adicional,
 *             impuesto…). Bruto = (líquido + otros) ÷ (1 − AFP − salud − cesantía).
 *             Costo del día = bruto × (1 + aportes del empleador %) ÷ días del mes + colación +
 *             movilización + otros. Las horas valen su parte del día: costo = costo del día ×
 *             horas ÷ horas de su jornada (9 h de 9 = el día completo).
 *  · Externo: se registra lo que se le paga líquido. Con boleta de honorarios la empresa además
 *             paga la retención al SII: costo = líquido ÷ (1 − retención %). Sin boleta, lo líquido.
 */

/** Retención de la boleta de honorarios por omisión (2026). La que vale está en los ajustes. */
export const RETENCION_HONORARIOS = 15.25;

export interface JornadaInterno {
  sueldo_liquido: number; afp_pct: number; salud_pct: number; cesantia_pct: number; otros_descuentos: number;
  aportes_pct: number; dias_mes: number; horas_dia: number; colacion_dia: number; movilizacion_dia: number; otros_dia: number;
}

const n = (v: unknown) => Number(v) || 0;

/** % del bruto que se le descuenta (AFP + salud + cesantía), acotado bajo 100. */
const pctDescuentos = (t: JornadaInterno) => Math.min(n(t.afp_pct) + n(t.salud_pct) + n(t.cesantia_pct), 99.99);

export function sueldoBruto(t: JornadaInterno): number {
  return Math.round((n(t.sueldo_liquido) + n(t.otros_descuentos)) / (1 - pctDescuentos(t) / 100));
}

/** Cuánto se le descuenta de su bruto, por concepto (para mostrarlo). */
export function descuentos(t: JornadaInterno) {
  const bruto = sueldoBruto(t);
  const de = (pct: number) => Math.round((bruto * n(pct)) / 100);
  return { bruto, afp: de(t.afp_pct), salud: de(t.salud_pct), cesantia: de(t.cesantia_pct), otros: Math.round(n(t.otros_descuentos)) };
}

export function costoDia(t: JornadaInterno): number {
  const dias = n(t.dias_mes) || 1;
  return Math.round((sueldoBruto(t) * (1 + n(t.aportes_pct) / 100)) / dias + n(t.colacion_dia) + n(t.movilizacion_dia) + n(t.otros_dia));
}

export const costoHora = (t: JornadaInterno) => Math.round(costoDia(t) / (n(t.horas_dia) || 1));

/** Lo que cuestan `horas` de un interno cuyo día cuesta `dia` y dura `horasDia`. */
export const costoHoras = (dia: number, horas: number, horasDia: number) => Math.round((n(dia) * n(horas)) / (n(horasDia) || 1));

/** Lo que cuesta pagarle `liquido` a un externo (con boleta de honorarios, lo bruto). */
export function costoExterno(liquido: number, honorarios: boolean, retencionPct: number = RETENCION_HONORARIOS): number {
  const r = honorarios ? Math.min(Math.max(n(retencionPct), 0), 99.99) : 0;
  return Math.round(n(liquido) / (1 - r / 100));
}

/** La retención que se paga al SII por un pago líquido con boleta de honorarios. */
export const retencion = (liquido: number, honorarios: boolean, retencionPct?: number) =>
  costoExterno(liquido, honorarios, retencionPct) - Math.round(n(liquido));
