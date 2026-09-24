// GET /api/publico/cotizacion/[token]
// Datos PÚBLICOS de una cotización para el link del cliente. Sin sesión:
// el token (UUID no adivinable) es la llave. Solo precios de venta, nunca
// costos. Registra la primera vez que el cliente la abre (vista_at), salvo
// cuando la abre InnVolt como vista previa (?interno=1).

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cargarPorToken, aPublica, esTokenValido } from '@/lib/cotizacionPublica';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!esTokenValido(token)) return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'La consulta online no está habilitada todavía.' }, { status: 503 });
  }
  try {
    const cot = await cargarPorToken(token);
    if (!cot) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });

    const interno = new URL(req.url).searchParams.get('interno') === '1';
    if (!interno && !cot.vista_at) {
      await getSupabaseAdmin().from('cotizaciones')
        .update({ vista_at: new Date().toISOString() })
        .eq('id', cot.id).is('vista_at', null);
    }
    return NextResponse.json(await aPublica(cot), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la cotización' }, { status: 500 });
  }
}
