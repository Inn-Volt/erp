// Envío de avisos al celular (Web Push) desde el servidor. SOLO para rutas de app/api.
// Usa VAPID_PRIVATE_KEY y la service role (para leer las suscripciones de cualquiera):
// ninguna de las dos llega al navegador.

import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface AvisoPush { titulo: string; cuerpo?: string | null; url?: string | null; tipo?: string | null }

export function pushConfigurado(): string | null {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return 'Faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Netlify.';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'Falta SUPABASE_SERVICE_ROLE_KEY en Netlify.';
  return null;
}

let listo = false;
function preparar() {
  if (listo) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contacto@innvolt.cl',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  listo = true;
}

/** Manda el aviso a todos los equipos de la persona. Borra los que el servicio ya no reconoce. */
export async function enviarPush(usuarioId: string, aviso: AvisoPush): Promise<{ dispositivos: number; enviados: number; caducados: number; errores: string[] }> {
  preparar();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', usuarioId);
  if (error) throw error;
  const subs = (data || []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify({
    titulo: String(aviso.titulo || 'InnVolt').slice(0, 120),
    cuerpo: String(aviso.cuerpo || '').slice(0, 300),
    url: typeof aviso.url === 'string' && aviso.url.startsWith('/') ? aviso.url : '/',
    tipo: aviso.tipo || null,
  });
  let enviados = 0;
  const caducados: string[] = [];
  const errores: string[] = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) caducados.push(s.id);
      else errores.push(`${status || ''} ${(e as Error).message || ''}`.trim());
    }
  }));
  if (caducados.length) await admin.from('push_suscripciones').delete().in('id', caducados);
  return { dispositivos: subs.length, enviados, caducados: caducados.length, errores };
}
