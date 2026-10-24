/**
 * Cálculos de los libros del mes (fase 15). Puros: no tocan la base.
 * Un cobro (anticipo, saldo…) se factura por un monto con IVA; su neto, exento e IVA salen en la
 * misma proporción que en la cotización. Sin cotización (OT suelta), se asume todo afecto al 19 %.
 */

export interface Desglose { neto: number; exento: number; iva: number; total: number }

export function desglosarCobro(monto: number, cot?: { subtotal?: number | null; iva?: number | null; total?: number | null } | null): Desglose {
  const total = Math.round(monto);
  const cTotal = Number(cot?.total || 0), cIva = Number(cot?.iva || 0), cSub = Number(cot?.subtotal || 0);
  if (!(cTotal > 0)) {
    const neto = Math.round(total / 1.19);
    return { neto, exento: 0, iva: total - neto, total };
  }
  const iva = Math.round((total * cIva) / cTotal);
  // Lo exento de la cotización: el neto que no paga IVA (subtotal − base del IVA).
  const exentoCot = Math.max(0, cSub - cIva / 0.19);
  const exento = exentoCot >= 1 ? Math.min(total - iva, Math.round((total * exentoCot) / cTotal)) : 0;
  return { neto: total - iva - exento, exento, iva, total };
}

export interface ResumenIva { debito: number; credito: number; aPagar: number; remanente: number }
/** IVA del mes: débito (ventas) − crédito (compras con factura, menos notas de crédito). */
export function ivaDelMes(debito: number, credito: number): ResumenIva {
  const dif = Math.round(debito - credito);
  return { debito: Math.round(debito), credito: Math.round(credito), aPagar: Math.max(0, dif), remanente: Math.max(0, -dif) };
}
