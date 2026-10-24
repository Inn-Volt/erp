import { fechaLocal } from '@/utils';

/** «2026-10» (mes) de una fecha «2026-10-24». */
export const mesDe = (f: string) => f.slice(0, 7);
/** Último día del mes «2026-02» → «2026-02-28». */
export const finDeMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return fechaLocal(new Date(a, m, 0)); };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «2026-10» → «octubre 2026». */
export const nombreMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} ${a}`; };
/** El mes anterior o siguiente de «2026-01» (±n). */
export const moverMes = (mes: string, n: number) => { const [a, m] = mes.split('-').map(Number); return fechaLocal(new Date(a, m - 1 + n, 1)).slice(0, 7); };
