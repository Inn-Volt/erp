/**
 * La UF y el dólar del día (Calculadora HH y botón «UF de hoy» del cotizador).
 * La ruta /api/hh/indicadores los consulta desde el servidor en dos fuentes a la vez
 * (mindicador.cl y boostr.cl: se queda con la primera que dé los dos valores), guarda el valor del
 * día en hh_indicadores y lo reutiliza ese día. Si ninguna responde (o dan valores fuera de rango
 * o viejos), usa el último guardado y, si no hay ninguno, el respaldo de los parámetros. Aquí está
 * la parte pura de esa decisión (con pruebas en tests/unit/hh.test.ts).
 */

export type TipoIndicador = 'uf' | 'usd';
export type FuenteEnLinea = 'mindicador' | 'boostr';
export type FuenteIndicador = FuenteEnLinea | 'respaldo' | 'manual';

/** Rangos sanos: fuera de esto se descarta el valor (una API caída a veces responde 0 o basura). */
export const RANGOS: Record<TipoIndicador, [number, number]> = { uf: [20000, 80000], usd: [500, 2000] };

/** Un valor de una API con más días que esto se descarta: una fuente que dejó de actualizarse no congela la UF. */
const DIAS_MAXIMOS = 7;

export const valorSano = (tipo: TipoIndicador, v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x >= RANGOS[tipo][0] && x <= RANGOS[tipo][1] ? x : null;
};

/** ¿La fecha de un valor (ISO) es de los últimos días? Sin fecha (o sin «hoy» para comparar) se acepta. */
export function fechaReciente(fecha: unknown, hoy?: string): boolean {
  if (!hoy || fecha === undefined || fecha === null || fecha === '') return true;
  const f = Date.parse(String(fecha).slice(0, 10));
  return Number.isFinite(f) && (Date.parse(hoy) - f) / 86_400_000 <= DIAS_MAXIMOS;
}

const valorReciente = (tipo: TipoIndicador, x: { valor?: unknown; fecha?: unknown } | undefined, hoy?: string) =>
  x && fechaReciente(x.fecha, hoy) ? valorSano(tipo, x.valor) : null;

/** El valor de una respuesta de mindicador.cl (`/api/uf` o `/api/dolar`: `serie[0]`), si es sano y reciente. */
export function valorMindicador(tipo: TipoIndicador, json: unknown, hoy?: string): number | null {
  const serie = (json as { serie?: { valor?: unknown; fecha?: unknown }[] } | null)?.serie;
  return Array.isArray(serie) ? valorReciente(tipo, serie[0], hoy) : null;
}

/** El valor de una respuesta de boostr.cl (`/economy/indicators.json`: `data.uf` y `data.dolar`), si es sano y reciente. */
export function valorBoostr(tipo: TipoIndicador, json: unknown, hoy?: string): number | null {
  const d = (json as { data?: Record<string, { value?: unknown; date?: unknown }> } | null)?.data;
  const x = d?.[tipo === 'uf' ? 'uf' : 'dolar'];
  return valorReciente(tipo, x ? { valor: x.value, fecha: x.date } : undefined, hoy);
}

/** La fecha de hoy en Chile (AAAA-MM-DD), aunque el servidor esté en otra zona horaria. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export interface FilaIndicador { fecha: string; uf: number; usd: number; fuente: FuenteIndicador }

/** Lo que respondió una fuente en línea (null = no respondió o vino fuera de rango). */
export interface ConsultaEnLinea { fuente: FuenteEnLinea; uf: number | null; usd: number | null }

export interface ValorIndicador {
  valor: number;
  /** De qué día es el valor. */
  fecha: string;
  fuente: FuenteIndicador;
  /** true = no es de hoy (no respondió ninguna fuente y se usó uno guardado antes o el respaldo). */
  anterior: boolean;
}

export interface IndicadoresDia { uf: ValorIndicador; usd: ValorIndicador }

interface EntradaIndicadores {
  hoy: string;
  /** Lo guardado para hoy (de internet o fijado a mano): manda. */
  deHoy: FilaIndicador | null;
  /** Lo que respondieron las fuentes en línea, en orden de preferencia ([] = no se consultó). */
  consultado: ConsultaEnLinea[];
  /** El último valor guardado antes de hoy. */
  ultimo: FilaIndicador | null;
  respaldo: { uf: number; usd: number; fecha: string };
}

/**
 * Qué UF y qué dólar usar hoy, y si hay que guardar lo consultado: solo cuando una misma fuente
 * dio los dos valores sanos (si no, se vuelve a consultar en la próxima visita).
 */
export function elegirIndicadores(e: EntradaIndicadores): IndicadoresDia & { guardar: boolean } {
  if (e.deHoy) {
    const de = (t: TipoIndicador): ValorIndicador => ({ valor: Number(e.deHoy![t]), fecha: e.hoy, fuente: e.deHoy!.fuente, anterior: false });
    return { uf: de('uf'), usd: de('usd'), guardar: false };
  }
  const elegir = (t: TipoIndicador): ValorIndicador => {
    for (const c of e.consultado) {
      const v = valorSano(t, c[t]);
      if (v !== null) return { valor: v, fecha: e.hoy, fuente: c.fuente, anterior: false };
    }
    const u = e.ultimo ? valorSano(t, e.ultimo[t]) : null;
    if (u !== null && e.ultimo) return { valor: u, fecha: e.ultimo.fecha, fuente: e.ultimo.fuente, anterior: true };
    return { valor: Number(e.respaldo[t]), fecha: e.respaldo.fecha, fuente: 'respaldo', anterior: true };
  };
  const uf = elegir('uf'), usd = elegir('usd');
  return { uf, usd, guardar: !uf.anterior && !usd.anterior && uf.fuente === usd.fuente };
}

export const NOMBRE_FUENTE: Record<FuenteIndicador, string> = {
  mindicador: 'mindicador.cl',
  boostr: 'boostr.cl',
  respaldo: 'valor de respaldo',
  manual: 'fijado a mano',
};
