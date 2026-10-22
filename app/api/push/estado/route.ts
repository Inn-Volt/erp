// GET /api/push/estado — revisión de los avisos al celular para Configuración: qué está listo,
// qué falta, los equipos registrados y cómo les fue a los últimos avisos. Nunca devuelve claves.

import { NextResponse } from 'next/server';
import { sesionConPermisos, tienePermiso, noAutorizado, sinPermiso } from '@/lib/authServidor';
import { leerConfig, serviceRoleLista } from '@/lib/pushServidor';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ses = await sesionConPermisos(req);
  if (!ses) return noAutorizado();
  if (!tienePermiso(ses.permisos, 'configuracion.gestionar')) return sinPermiso();
  if (!serviceRoleLista()) return NextResponse.json({ serviceRole: false });

  const admin = getSupabaseAdmin();
  const c = await leerConfig(true);
  const origen = process.env.URL || new URL(req.url).origin;
  const urlEsperada = `${origen}/api/push`;

  const [diag, equipos, avisos, nombres] = await Promise.all([
    admin.rpc('push_diagnostico'),
    admin.from('push_suscripciones').select('usuario_id, dispositivo, created_at, ultimo_ok_at, fallos, ultimo_error').order('created_at', { ascending: false }),
    admin.from('notificaciones').select('titulo, tipo, usuario_id, created_at, push_estado, push_intentos, push_detalle')
      .not('push_estado', 'is', null).order('created_at', { ascending: false }).limit(25),
    admin.from('profiles').select('id, nombre, email'),
  ]);
  const nombre = new Map(((nombres.data || []) as { id: string; nombre: string | null; email: string | null }[]).map(p => [p.id, p.nombre || p.email || '—']));
  const d = (diag.data || {}) as { fase14?: boolean; pg_net?: boolean; pg_cron?: boolean; reintentos?: boolean; disparador?: boolean };

  // Resumen de las últimas 24 horas.
  const desde = new Date(Date.now() - 864e5).toISOString();
  const { data: dia } = await admin.from('notificaciones').select('push_estado').gte('created_at', desde).not('push_estado', 'is', null);
  const resumen: Record<string, number> = {};
  for (const x of (dia || []) as { push_estado: string }[]) resumen[x.push_estado] = (resumen[x.push_estado] || 0) + 1;

  return NextResponse.json({
    serviceRole: true,
    fase14: !diag.error && !!d.fase14,
    pgNet: !!d.pg_net,
    pgCron: !!d.pg_cron,
    reintentos: !!d.reintentos,
    disparador: !!d.disparador,
    claves: c.origen.claves,
    secreto: c.origen.secreto,
    url: c.url,
    urlEsperada,
    urlOk: c.url === urlEsperada,
    equipos: ((equipos.data || []) as { usuario_id: string; dispositivo: string | null; created_at: string; ultimo_ok_at?: string | null; fallos?: number; ultimo_error?: string | null }[])
      .map(e => ({ ...e, usuario: nombre.get(e.usuario_id) || '—' })),
    avisos: ((avisos.data || []) as { usuario_id: string }[]).map(a => ({ ...a, usuario: nombre.get(a.usuario_id) || '—' })),
    resumen,
  });
}
