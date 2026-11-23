/**
 * Calculadora HH (fase 23): la UF y el dólar del día.
 * La ruta /api/hh/indicadores los consulta en mindicador.cl desde el servidor, guarda el valor del
 * día en hh_indicadores y lo reutiliza ese día. Si mindicador no responde (o da un valor fuera de
 * rango), usa el último guardado y, si no hay ninguno, el respaldo de los parámetros. Aquí está la
 * parte pura de esa decisión (con pruebas en tests/unit/hh.test.ts).
 */

export type TipoIndicador = 'uf' | 'usd';
export type FuenteIndicador = 'mindicador' | 'respaldo' | 'manual';

/** Rangos sanos: fuera de esto se descarta el valor (una API caída a veces responde 0 o basura). */
export const RANGOS: Record<TipoIndicador, [number, number]> = { uf: [20000, 80000], usd: [500, 2000] };

export const valorSano = (tipo: TipoIndicador, v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x >= RANGOS[tipo][0] && x <= RANGOS[tipo][1] ? x : null;
};

/** El valor de una respuesta de mindicador.cl (`serie[0].valor`), si es sano. */
export function valorMindicador(tipo: TipoIndicador, json: unknown): number | null {
  const serie = (json as { serie?: { valor?: unknown }[] } | null)?.serie;
  return Array.isArray(serie) && serie.length ? valorSano(tipo, serie[0]?.valor) : null;
}

/** La fecha de hoy en Chile (AAAA-MM-DD), aunque el servidor esté en otra zona horaria. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export interface FilaIndicador { fecha: string; uf: number; usd: number; fuente: FuenteIndicador }

export interface ValorIndicador {
  valor: number;
  /** De qué día es el valor. */
  fecha: string;
  fuente: FuenteIndicador;
  /** true = no es de hoy (mindicador no respondió y se usó uno guardado antes o el respaldo). */
  anterior: boolean;
}

export interface IndicadoresDia { uf: ValorIndicador; usd: ValorIndicador }

interface EntradaIndicadores {
  hoy: string;
  /** Lo guardado para hoy (de mindicador o fijado a mano): manda. */
  deHoy: FilaIndicador | null;
  /** Lo que respondió mindicador (null = no respondió o vino fuera de rango). */
  consultado: { uf: number | null; usd: number | null } | null;
  /** El último valor guardado antes de hoy. */
  ultimo: FilaIndicador | null;
  respaldo: { uf: number; usd: number; fecha: string };
}

/**
 * Qué UF y qué dólar usar hoy, y si hay que guardar lo consultado (solo cuando mindicador dio los
 * dos valores sanos: si uno falla, se vuelve a consultar en la próxima visita).
 */
export function elegirIndicadores(e: EntradaIndicadores): IndicadoresDia & { guardar: boolean } {
  if (e.deHoy) {
    const de = (t: TipoIndicador): ValorIndicador => ({ valor: Number(e.deHoy![t]), fecha: e.hoy, fuente: e.deHoy!.fuente, anterior: false });
    return { uf: de('uf'), usd: de('usd'), guardar: false };
  }
  const elegir = (t: TipoIndicador): ValorIndicador => {
    const c = e.consultado ? valorSano(t, e.consultado[t]) : null;
    if (c !== null) return { valor: c, fecha: e.hoy, fuente: 'mindicador', anterior: false };
    const u = e.ultimo ? valorSano(t, e.ultimo[t]) : null;
    if (u !== null && e.ultimo) return { valor: u, fecha: e.ultimo.fecha, fuente: e.ultimo.fuente, anterior: true };
    return { valor: Number(e.respaldo[t]), fecha: e.respaldo.fecha, fuente: 'respaldo', anterior: true };
  };
  const uf = elegir('uf'), usd = elegir('usd');
  return { uf, usd, guardar: uf.fuente === 'mindicador' && !uf.anterior && usd.fuente === 'mindicador' && !usd.anterior };
}

export const NOMBRE_FUENTE: Record<FuenteIndicador, string> = {
  mindicador: 'mindicador.cl',
  respaldo: 'valor de respaldo',
  manual: 'fijado a mano',
};
