/**
 * Feriados legales nacionales de Chile (portado de TecApp).
 *
 * Sirven para avisar en la agenda cuando una visita cae en un día en que por ley no se trabaja.
 * Un feriado se distingue del fin de semana porque InnVolt a veces sí trabaja los sábados.
 *
 * OJO: hay feriados MOVIBLES (Semana Santa, Pueblos Indígenas, San Pedro y San Pablo,
 * Encuentro de Dos Mundos) que cambian cada año. San Pedro y San Pablo y Encuentro de Dos Mundos
 * se trasladan al lunes (Ley 19.668). Actualiza la tabla cada año con el calendario oficial
 * (feriados.cl / Dirección del Trabajo).
 */
const FERIADOS: Record<string, string> = {
  // 2026
  '2026-01-01': 'Año Nuevo',
  '2026-04-03': 'Viernes Santo',
  '2026-04-04': 'Sábado Santo',
  '2026-05-01': 'Día del Trabajo',
  '2026-05-21': 'Glorias Navales',
  '2026-06-21': 'Día de los Pueblos Indígenas',
  '2026-06-29': 'San Pedro y San Pablo',
  '2026-07-16': 'Virgen del Carmen',
  '2026-08-15': 'Asunción de la Virgen',
  '2026-09-18': 'Independencia Nacional',
  '2026-09-19': 'Glorias del Ejército',
  '2026-10-12': 'Encuentro de Dos Mundos',
  '2026-10-31': 'Día de las Iglesias Evangélicas',
  '2026-11-01': 'Día de Todos los Santos',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  // 2027
  '2027-01-01': 'Año Nuevo',
  '2027-03-26': 'Viernes Santo',
  '2027-03-27': 'Sábado Santo',
  '2027-05-01': 'Día del Trabajo',
  '2027-05-21': 'Glorias Navales',
  '2027-06-21': 'Día de los Pueblos Indígenas',
  '2027-06-28': 'San Pedro y San Pablo',      // 29/06 cae martes → lunes 28
  '2027-07-16': 'Virgen del Carmen',
  '2027-08-15': 'Asunción de la Virgen',
  '2027-09-18': 'Independencia Nacional',
  '2027-09-19': 'Glorias del Ejército',
  '2027-10-11': 'Encuentro de Dos Mundos',    // 12/10 cae martes → lunes 11
  '2027-10-31': 'Día de las Iglesias Evangélicas',
  '2027-11-01': 'Día de Todos los Santos',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
};

/** Nombre del feriado para una fecha 'YYYY-MM-DD' (o Date local); null si no es feriado. */
export function feriadoDe(fecha: string | Date): string | null {
  const clave = typeof fecha === 'string'
    ? fecha.slice(0, 10)
    : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  return FERIADOS[clave] ?? null;
}

export type TipoDia = 'feriado' | 'domingo' | 'sabado' | 'laboral';

/** Clasifica un día 'YYYY-MM-DD': el feriado tiene prioridad sobre el fin de semana. */
export function tipoDia(fecha: string): { tipo: TipoDia; nombre: string | null } {
  const nombre = feriadoDe(fecha);
  if (nombre) return { tipo: 'feriado', nombre };
  const dow = new Date(fecha.slice(0, 10) + 'T00:00:00').getDay();
  if (dow === 0) return { tipo: 'domingo', nombre: null };
  if (dow === 6) return { tipo: 'sabado', nombre: null };
  return { tipo: 'laboral', nombre: null };
}
