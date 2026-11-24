/**
 * El estado de un cobro de «Por facturar y cobranza» (anticipo, saldo, OT cerrada…).
 * El pago y la factura van por separado: un anticipo se puede pagar antes de facturarlo (o sin
 * factura todavía) y queda pagado igual; la etapa (OC, HES, factura) solo dice en qué va la factura.
 */

type Cobro = { etapa: string; monto: number | string; monto_pagado?: number | string | null };

/** Lo que falta pagar. */
export const saldoCobro = (p: Cobro) => Math.max(0, Number(p.monto) - Number(p.monto_pagado || 0));

/** Pagado completo, tenga o no factura. */
export const cobroPagado = (p: Cobro) => p.etapa !== 'sin_cobro' && Number(p.monto) > 0 && saldoCobro(p) === 0;

/** Falta el pago (todo o parte), tenga o no factura. Lo «sin cobro» (garantía, cortesía) no se cobra. */
export const cobroAbierto = (p: Cobro) => p.etapa !== 'sin_cobro' && saldoCobro(p) > 0;

/** Se pagó una parte. */
export const cobroAbonado = (p: Cobro) => cobroAbierto(p) && Number(p.monto_pagado || 0) > 0;
