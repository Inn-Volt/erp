// GET /api/hh/indicadores → la UF y el dólar del día (Calculadora HH y botón «UF de hoy» del cotizador).
// Consulta desde el servidor mindicador.cl y boostr.cl a la vez (con un tiempo corto) y se queda con
// la primera que dé los dos valores sanos y recientes; guarda el valor del día en hh_indicadores y lo
// reutiliza ese día. Si ninguna responde, usa el último guardado y, si no hay ninguno, el respaldo de
// los parámetros. Siempre dice la fuente y la fecha de cada valor.
// Requiere sesión con algún permiso de la calculadora HH, del cotizador o de facturación (cobros en UF o dólares).
// La caché la escribe el servidor con la service role: así nadie puede inventar «la UF de internet»
// desde el navegador (a mano la fija quien configura, en la pantalla de parámetros).

import { NextResponse } from 'next/server';
import { clienteComoUsuario, noAutorizado, sesionConPermisos, sinPermiso } from '@/lib/authServidor';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { PARAMETROS_INICIALES } from '@/lib/hh/calculo';
import {
  elegirIndicadores, hoyEnChile, valorBoostr, valorMindicador, type ConsultaEnLinea, type FilaIndicador,
} from '@/lib/hh/indicadores';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function leerJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store', headers: { Accept: 'application/json' } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function deMindicador(hoy: string): Promise<ConsultaEnLinea> {
  const [uf, usd] = await Promise.all([leerJson('https://mindicador.cl/api/uf'), leerJson('https://mindicador.cl/api/dolar')]);
  return { fuente: 'mindicador', uf: valorMindicador('uf', uf, hoy), usd: valorMindicador('usd', usd, hoy) };
}

async function deBoostr(hoy: string): Promise<ConsultaEnLinea> {
  const j = await leerJson('https://api.boostr.cl/economy/indicators.json');
  return { fuente: 'boostr', uf: valorBoostr('uf', j, hoy), usd: valorBoostr('usd', j, hoy) };
}

/** La primera fuente que dé la UF y el dólar; si ninguna da los dos, lo que alcanzó a dar cada una. */
async function consultarEnLinea(hoy: string): Promise<ConsultaEnLinea[]> {
  const intentos = [deMindicador(hoy), deBoostr(hoy)];
  const completa = await Promise.any(intentos.map(p => p.then(c => (c.uf !== null && c.usd !== null ? c : Promise.reject(new Error('incompleta'))))))
    .catch(() => null);
  return completa ? [completa] : Promise.all(intentos);
}

const fila = (d: unknown): FilaIndicador | null => {
  const x = d as FilaIndicador | null;
  return x ? { fecha: String(x.fecha), uf: Number(x.uf), usd: Number(x.usd), fuente: x.fuente } : null;
};

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  const p = ses.permisos;
  if (p !== null && !p.some(x => x === '*' || x.startsWith('hh.') || x.startsWith('cotizaciones.') || x.startsWith('facturacion.'))) return sinPermiso();

  // Quien solo cotiza no lee las tablas hh_ (RLS): para él no hay guardado ni respaldo propio,
  // y el cotizador solo usa un valor de hoy.
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
  const pr = param.data as { uf_respaldo?: number; usd_respaldo?: number; updated_at?: string } | null;
  const r = elegirIndicadores({
    hoy, deHoy: guardadoHoy, consultado: guardadoHoy ? [] : await consultarEnLinea(hoy), ultimo: fila(ultimo.data),
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
        .upsert({ fecha: hoy, uf: r.uf.valor, usd: r.usd.valor, fuente: r.uf.fuente }, { onConflict: 'fecha', ignoreDuplicates: true });
    } catch {
      // Sin la service role en el entorno no hay caché: se vuelve a consultar en la próxima visita.
    }
  }
  return NextResponse.json({ uf: r.uf, usd: r.usd });
}
