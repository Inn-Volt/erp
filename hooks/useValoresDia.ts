'use client';

/**
 * La UF y el dólar del día (de /api/hh/indicadores: internet, lo guardado o el respaldo), para
 * pasar a pesos los cobros fijados en esas monedas. Se pide una vez y se comparte entre pantallas.
 */

import { useEffect, useState } from 'react';
import { hhService } from '@/services/hh';
import type { IndicadoresDia } from '@/lib/hh/indicadores';

let pedido: Promise<IndicadoresDia | null> | null = null;

/** `fresco`: vuelve a preguntar (p. ej. al apretar «Actualizar a la UF de hoy»). */
export function indicadoresDelDia(fresco = false): Promise<IndicadoresDia | null> {
  if (!pedido || fresco) {
    pedido = hhService.indicadores().catch(() => {
      pedido = null;
      return null;
    });
  }
  return pedido;
}

/** `{ uf, usd }` del día, o null mientras llega (o si no se pudo). Solo pregunta si `activo`. */
export function useValoresDia(activo = true): { uf: number; usd: number } | null {
  const [v, setV] = useState<{ uf: number; usd: number } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    indicadoresDelDia().then(d => { if (vivo && d) setV({ uf: d.uf.valor, usd: d.usd.valor }); });
    return () => { vivo = false; };
  }, [activo]);
  return v;
}
