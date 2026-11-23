// GET /api/hh/indicadores → la UF y el dólar del día para la Calculadora HH (fase 23).
// Consulta mindicador.cl desde el servidor (con un tiempo corto), descarta valores fuera de rango,
// guarda el valor del día en hh_indicadores y lo reutiliza ese día. Si mindicador falla, usa el
// último guardado y, si no hay ninguno, el respaldo de los parámetros. Siempre dice la fuente y la
// fecha de cada valor. Requiere sesión con hh.ver o hh.configurar.
// La caché la escribe el servidor con la service role: así nadie puede inventar «la UF de
// mindicador» desde el navegador (a mano la fija quien configura, en la pantalla de parámetros).

import { NextResponse } from 'next/server';
import { clienteComoUsuario, noAutorizado, sesionConPermisos, sinPermiso } from '@/lib/authServidor';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { PARAMETROS_INICIALES } from '@/lib/hh/calculo';
import { elegirIndicadores, hoyEnChile, valorMindicador, type FilaIndicador, type TipoIndicador } from '@/lib/hh/indicadores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERIE: Record<TipoIndicador, string> = { uf: 'uf', usd: 'dolar' };

async function consultar(tipo: TipoIndicador): Promise<number | null> {
  try {
    const r = await fetch(`https://mindicador.cl/api/${SERIE[tipo]}`, {
      signal: AbortSignal.timeout(5000), cache: 'no-store', headers: { Accept: 'application/json' },
    });
    return r.ok ? valorMindicador(tipo, await r.json()) : null;
  } catch {
    return null;
  }
}

const fila = (d: unknown): FilaIndicador | null => {
  const x = d as FilaIndicador | null;
  return x ? { fecha: String(x.fecha), uf: Number(x.uf), usd: Number(x.usd), fuente: x.fuente } : null;
};

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  const p = ses.permisos;
  if (p !== null && !p.includes('*') && !p.includes('hh.ver') && !p.includes('hh.configurar')) return sinPermiso();

  const sb = clienteComoUsuario(ses.token);
  const hoy = hoyEnChile();
  const [deHoy, ultimo, param] = await Promise.all([
    sb.from('hh_indicadores').select('fecha, uf, usd, fuente').eq('fecha', hoy).maybeSingle(),
    sb.from('hh_indicadores').select('fecha, uf, usd, fuente').lt('fecha', hoy).order('fecha', { ascending: false }).limit(1).maybeSingle(),
    sb.from('hh_parametros').select('uf_respaldo, usd_respaldo, updated_at').eq('id', 1).maybeSingle(),
  ]);
  const error = deHoy.error || ultimo.error || param.error;
  if (error) {
    const falta = error.code === '42P01' || error.code === 'PGRST205';
    return NextResponse.json({ error: falta ? 'Falta ejecutar supabase_fase23_calculo_hh.sql en Supabase.' : error.message, code: error.code }, { status: falta ? 503 : 500 });
  }

  const guardadoHoy = fila(deHoy.data);
  const consultado = guardadoHoy ? null : await Promise.all([consultar('uf'), consultar('usd')]).then(([uf, usd]) => ({ uf, usd }));
  const pr = param.data as { uf_respaldo?: number; usd_respaldo?: number; updated_at?: string } | null;
  const r = elegirIndicadores({
    hoy, deHoy: guardadoHoy, consultado, ultimo: fila(ultimo.data),
    respaldo: {
      uf: Number(pr?.uf_respaldo ?? PARAMETROS_INICIALES.uf_respaldo),
      usd: Number(pr?.usd_respaldo ?? PARAMETROS_INICIALES.usd_respaldo),
      fecha: pr?.updated_at ? hoyEnChile(new Date(pr.updated_at)) : hoy,
    },
  });

  if (r.guardar) {
    try {
      // Sin pisar un valor fijado a mano en el mismo momento.
      await getSupabaseAdmin().from('hh_indicadores')
        .upsert({ fecha: hoy, uf: r.uf.valor, usd: r.usd.valor, fuente: 'mindicador' }, { onConflict: 'fecha', ignoreDuplicates: true });
    } catch {
      // Sin la service role en el entorno no hay caché: se vuelve a consultar en la próxima visita.
    }
  }
  return NextResponse.json({ uf: r.uf, usd: r.usd });
}
