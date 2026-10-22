// Envío de avisos al celular (Web Push) desde el servidor. SOLO para rutas de app/api.
// Las claves (VAPID) y la clave compartida con la base se guardan en push_config (fase 14) y
// se generan solas con «Configurar» (Configuración → Avisos al celular). Si están en Netlify
// (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET), mandan esas.
// La clave privada y la service role nunca llegan al navegador.

import webpush from 'web-push';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface AvisoPush {
  /** Id del aviso de la campana: el equipo reemplaza un aviso repetido en vez de mostrarlo dos veces. */
  id?: string | null;
  titulo: string;
  cuerpo?: string | null;
  url?: string | null;
  tipo?: string | null;
  /** Avisos sin leer: el número sobre el ícono de la app (iPhone, Android, computador). */
  pendientes?: number | null;
}

export interface ConfigPush {
  url: string | null;
  secretos: string[];
  publica: string | null;
  privada: string | null;
  origen: { claves: 'netlify' | 'base' | null; secreto: 'netlify' | 'base' | null };
  /** La base todavía no tiene la fase 14 (no se pueden guardar las claves ahí). */
  sinFase14: boolean;
}

const ASUNTO = () => process.env.VAPID_SUBJECT || 'mailto:innvolt.cl@gmail.com';

let cache: { valor: ConfigPush; hasta: number } | null = null;

export function serviceRoleLista(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function leerConfig(fresca = false): Promise<ConfigPush> {
  if (!fresca && cache && cache.hasta > Date.now()) return cache.valor;
  let fila: Record<string, string | null> | null = null;
  let sinFase14 = false;
  if (serviceRoleLista()) {
    const { data, error } = await getSupabaseAdmin().from('push_config').select('*').eq('id', true).maybeSingle();
    if (!error) fila = data as Record<string, string | null> | null;
    sinFase14 = !error && !!fila && !('vapid_publica' in fila);
  }
  const envPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '', envPriv = process.env.VAPID_PRIVATE_KEY || '';
  const enNetlify = !!(envPub && envPriv);
  const valor: ConfigPush = {
    url: fila?.url || null,
    secretos: [process.env.PUSH_SECRET, fila?.secreto].filter((s): s is string => !!s),
    publica: enNetlify ? envPub : fila?.vapid_publica || null,
    privada: enNetlify ? envPriv : fila?.vapid_privada || null,
    origen: {
      claves: enNetlify ? 'netlify' : fila?.vapid_publica ? 'base' : null,
      secreto: process.env.PUSH_SECRET ? 'netlify' : fila?.secreto ? 'base' : null,
    },
    sinFase14,
  };
  cache = { valor, hasta: Date.now() + 60_000 };
  return valor;
}

/** La clave que manda la base en cada llamada (x-push-secreto). */
export async function secretoValido(recibido: string | null): Promise<boolean> {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const igual = (s: string) => { const b = Buffer.from(s); return a.length === b.length && timingSafeEqual(a, b); };
  const { secretos } = await leerConfig();
  if (secretos.some(igual)) return true;
  // Recién configurado en otra instancia del servidor: se relee antes de rechazar.
  return (await leerConfig(true)).secretos.some(igual);
}

/** Lo que falta para poder mandar avisos (null = listo). */
export async function faltaParaEnviar(): Promise<string | null> {
  if (!serviceRoleLista()) return 'Falta SUPABASE_SERVICE_ROLE_KEY en Netlify.';
  const c = await leerConfig();
  if (!c.publica || !c.privada) return 'Los avisos no están configurados: Configuración → Avisos al celular → «Configurar».';
  return null;
}

/**
 * Deja todo listo: la dirección a la que llama la base, la clave compartida y las claves de
 * los avisos. Nunca cambia unas claves que ya existen (los equipos suscritos dejarían de recibir).
 */
export async function configurarPush(origen: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: fila, error } = await admin.from('push_config').select('*').eq('id', true).maybeSingle();
  if (error) throw new Error(/push_config/.test(error.message) ? 'Falta ejecutar supabase_fase6_ot_terreno.sql en Supabase.' : error.message);
  if (fila && !('vapid_publica' in fila)) throw new Error('Falta ejecutar supabase_fase14_push.sql en Supabase.');
  const cambios: Record<string, unknown> = { id: true, url: `${origen.replace(/\/$/, '')}/api/push`, actualizado_at: new Date().toISOString() };
  cambios.secreto = process.env.PUSH_SECRET || fila?.secreto || randomBytes(32).toString('base64url');
  const enNetlify = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  if (!enNetlify && !(fila?.vapid_publica && fila?.vapid_privada)) {
    const k = webpush.generateVAPIDKeys();
    cambios.vapid_publica = k.publicKey;
    cambios.vapid_privada = k.privateKey;
  }
  const { error: e2 } = await admin.from('push_config').upsert(cambios);
  if (e2) throw new Error(e2.message);
  cache = null;
}

interface Suscripcion { id: string; endpoint: string; p256dh: string; auth: string; fallos?: number | null; ultimo_ok_at?: string | null }

/** Manda el aviso a todos los equipos de la persona y anota cómo le fue a cada uno. */
export async function enviarPush(usuarioId: string, aviso: AvisoPush): Promise<{ dispositivos: number; enviados: number; caducados: number; errores: string[] }> {
  const c = await leerConfig();
  if (!c.publica || !c.privada) throw new Error('Los avisos no están configurados: Configuración → Avisos al celular → «Configurar».');
  const admin = getSupabaseAdmin();
  let r = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth, fallos, ultimo_ok_at').eq('usuario_id', usuarioId);
  if (r.error) r = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', usuarioId) as typeof r;
  if (r.error) throw r.error;
  const subs = (r.data || []) as Suscripcion[];
  const payload = JSON.stringify({
    id: aviso.id || null,
    titulo: String(aviso.titulo || 'InnVolt').slice(0, 120),
    cuerpo: String(aviso.cuerpo || '').slice(0, 300),
    url: typeof aviso.url === 'string' && aviso.url.startsWith('/') ? aviso.url : '/inicio',
    tipo: aviso.tipo || null,
    pendientes: typeof aviso.pendientes === 'number' ? aviso.pendientes : null,
  });
  const opciones: webpush.RequestOptions = {
    vapidDetails: { subject: ASUNTO(), publicKey: c.publica, privateKey: c.privada },
    TTL: 60 * 60 * 24,
    urgency: 'high',
    timeout: 10_000,
    // Si el equipo está apagado, el servicio guarda solo la última versión de este aviso.
    ...(aviso.id ? { topic: aviso.id.replace(/-/g, '').slice(0, 32) } : {}),
  };
  let enviados = 0;
  const ok: string[] = [], caducados: string[] = [], errores: string[] = [];
  const fallidos: { s: Suscripcion; error: string }[] = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opciones);
      enviados++;
      ok.push(s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: el equipo ya no existe o quitó el permiso. Se borra; si vuelve, se registra solo.
      if (status === 404 || status === 410) caducados.push(s.id);
      else {
        const msg = `${status || ''} ${(e as { body?: string }).body || (e as Error).message || ''}`.trim().slice(0, 200);
        errores.push(msg);
        fallidos.push({ s, error: msg });
      }
    }
  }));
  if (ok.length) await admin.from('push_suscripciones').update({ ultimo_ok_at: new Date().toISOString(), fallos: 0, ultimo_error: null }).in('id', ok);
  if (caducados.length) await admin.from('push_suscripciones').delete().in('id', caducados);
  for (const { s, error } of fallidos) {
    const fallos = (s.fallos || 0) + 1;
    // Un equipo que lleva mucho fallando y no recibe nada hace un mes, se da por perdido.
    const muerto = fallos >= 20 && (!s.ultimo_ok_at || Date.now() - new Date(s.ultimo_ok_at).getTime() > 30 * 864e5);
    if (muerto) await admin.from('push_suscripciones').delete().eq('id', s.id);
    else await admin.from('push_suscripciones').update({ fallos, ultimo_error: error }).eq('id', s.id);
  }
  return { dispositivos: subs.length, enviados, caducados: caducados.length, errores };
}

/** Manda un aviso de la campana (por su id) y anota en él si llegó. */
export async function enviarNotificacion(id: string): Promise<{ estado: string; enviados?: number; dispositivos?: number }> {
  const admin = getSupabaseAdmin();
  const { data: n, error } = await admin.from('notificaciones').select('id, usuario_id, tipo, titulo, cuerpo, url, leida_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!n) return { estado: 'no_existe' };
  const anotar = (push_estado: string, push_detalle: string | null = null) =>
    admin.from('notificaciones').update({ push_estado, push_detalle }).eq('id', id).then(() => undefined, () => undefined);
  // Ya lo vio en la app (pasa con los reintentos): no hace falta avisarle.
  if (n.leida_at) { await anotar('leida'); return { estado: 'leida' }; }
  const { count } = await admin.from('notificaciones').select('id', { count: 'exact', head: true }).eq('usuario_id', n.usuario_id).is('leida_at', null);
  try {
    const r = await enviarPush(n.usuario_id, { id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, url: n.url, tipo: n.tipo, pendientes: count ?? null });
    const estado = r.enviados > 0 ? 'enviado' : r.dispositivos === r.caducados ? 'sin_equipos' : 'error';
    await anotar(estado, r.errores.length ? r.errores.join(' | ').slice(0, 300) : null);
    return { estado, enviados: r.enviados, dispositivos: r.dispositivos };
  } catch (e) {
    await anotar('error', ((e as Error).message || 'Error').slice(0, 300));
    throw e;
  }
}
