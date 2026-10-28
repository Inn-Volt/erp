/**
 * Utilidad: un solo número para ponerle precio a las cosas.
 *
 *   Utilidad % = de lo que paga el cliente (neto), qué parte queda para InnVolt.
 *   precio = costo ÷ (1 − utilidad)        ej. costo 60.000 con 30 % → 85.714
 *
 * Por dentro, una línea guarda su «ganancia» (lo que se suma al costo: 85.714 = 60.000 × 1,4286),
 * que es lo mismo dicho de otra forma; en pantalla solo se ve la utilidad.
 *
 * La utilidad mínima sale de los gastos fijos: si los gastos fijos del mes son el 20 % de lo que
 * se vende, cada cotización necesita 20 % solo para pagarlos, más la ganancia que se quiera.
 */

import type { CategoriaItem } from '@/types';

export const TIPOS: { clave: CategoriaItem; nombre: string }[] = [
  { clave: 'material', nombre: 'Material' }, { clave: 'mano_obra', nombre: 'Mano de obra' },
  { clave: 'servicio', nombre: 'Servicio' }, { clave: 'operacion', nombre: 'Operación' },
];

/** Las de siempre (equivalen a las ganancias 33 / 92 / 41 / 41 % que se usaban). */
export const UTILIDAD_POR_OMISION: Record<CategoriaItem, number> = { material: 25, mano_obra: 48, servicio: 29, operacion: 29 };
const TOPE = 95;

export const gananciaDesdeUtilidad = (u: number) => {
  const x = Math.min(Math.max(u, 0), TOPE) / 100;
  return (1 / (1 - x) - 1) * 100;
};
export const utilidadDesdeGanancia = (g: number | null | undefined) =>
  g === null || g === undefined || g <= -100 ? 0 : (1 - 1 / (1 + g / 100)) * 100;
export const precioConUtilidad = (costo: number, u: number) => costo / (1 - Math.min(Math.max(u, 0), TOPE) / 100);

export interface GastoFijo { nombre: string; monto: number }
export interface EstructuraCostos { gastos: GastoFijo[]; ventas_mensuales: number; ganancia_deseada: number }
export type UtilidadPorTipo = Partial<Record<CategoriaItem, number>>;

export const GASTOS_SUGERIDOS = [
  'Sueldos fijos (administración y técnicos que no se cobran como mano de obra)', 'Leyes sociales e imposiciones',
  'Arriendo de oficina o bodega', 'Luz', 'Agua', 'Internet y teléfonos', 'Vehículos: cuotas, combustible y mantención',
  'Contador y trámites', 'Seguros', 'Herramientas y su desgaste', 'Software y suscripciones', 'Publicidad', 'Otros',
];

export function recomendacion(e: EstructuraCostos) {
  const gastos = e.gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const ventas = Number(e.ventas_mensuales) || 0;
  const pctGastos = ventas > 0 ? (gastos / ventas) * 100 : null;
  const recomendada = pctGastos === null ? null : Math.min(pctGastos + (Number(e.ganancia_deseada) || 0), TOPE);
  return { gastos, ventas, pctGastos, recomendada };
}

/** La utilidad por omisión de cada tipo (la guardada o la de siempre). */
export function utilidadesDe(guardadas: UtilidadPorTipo | null | undefined): Record<CategoriaItem, number> {
  const out = { ...UTILIDAD_POR_OMISION };
  for (const t of TIPOS) {
    const v = guardadas?.[t.clave];
    if (typeof v === 'number' && Number.isFinite(v)) out[t.clave] = Math.min(Math.max(v, 0), TOPE);
  }
  return out;
}

/** La ganancia (lo que se suma al costo) con que entra algo nuevo de ese tipo. */
export const gananciaPorOmision = (guardadas: UtilidadPorTipo | null | undefined, tipo: CategoriaItem) =>
  gananciaDesdeUtilidad(utilidadesDe(guardadas)[tipo] ?? 25);

/**
 * Imprevistos (fase 18): un colchón sobre el costo para lo que no se ve (mermas, cortes, sorpresas).
 * Lo que tiene su propia utilidad (fuera de la biblioteca o ajustado aquí) sube su precio para
 * mantenerla; lo de la biblioteca mantiene su precio y la utilidad que se ve ya lo descuenta.
 * La operación (traslados, fletes) y los cargos no llevan: se cobran tal cual.
 */
export type ImprevistosPorTipo = Partial<Record<CategoriaItem, number>>;
export const TOPE_IMPREVISTOS = 50;
export const TIPOS_CON_IMPREVISTOS = TIPOS.filter(t => t.clave !== 'operacion');
export const imprevistosPorOmision = (guardados: ImprevistosPorTipo | null | undefined, tipo: CategoriaItem) =>
  tipo === 'operacion' ? 0 : Math.min(Math.max(Number(guardados?.[tipo]) || 0, 0), TOPE_IMPREVISTOS);
