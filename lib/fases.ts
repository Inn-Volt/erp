'use client';

/**
 * ¿La base ya tiene una fase? Lo nuevo de cada fase se muestra solo cuando su SQL ya se
 * ejecutó: así la app sigue funcionando igual mientras tanto (nada se rompe ni pide columnas
 * que todavía no existen). Se revisa una vez por sesión.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const MARCAS: Record<number, () => Promise<boolean>> = {
  // Fase 15 (supabase_fase15_revision.sql): compras, horas, aprobación, ficha tributaria…
  15: async () => !(await supabase.from('compras').select('id', { head: true, count: 'exact' }).limit(1)).error,
};

const cache = new Map<number, Promise<boolean>>();

export function faseAplicada(n: number): Promise<boolean> {
  if (!cache.has(n)) {
    const p = (MARCAS[n]?.() ?? Promise.resolve(false)).catch(() => false);
    cache.set(n, p);
    // Si dio que no (SQL recién ejecutado), se vuelve a preguntar la próxima vez.
    p.then(ok => { if (!ok) setTimeout(() => cache.delete(n), 60_000); });
  }
  return cache.get(n)!;
}

/** `true` cuando la fase está aplicada; `false` mientras no (o mientras se revisa). */
export function useFase(n: number): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { let vivo = true; faseAplicada(n).then(v => { if (vivo) setOk(v); }); return () => { vivo = false; }; }, [n]);
  return ok;
}
