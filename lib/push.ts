'use client';

/**
 * Avisos al celular (Web Push, como en TecApp): permiso del sistema, suscripción del
 * navegador y registro en la base (push_suscripciones). Llegan aunque la app esté cerrada.
 * Los manda el servidor (app/api/push) cada vez que la base crea un aviso de la campana.
 *
 * Lo que no depende de nosotros:
 *  · https (o localhost). Sin eso el navegador no permite service workers.
 *  · iPhone/iPad: iOS 16.4 o más y la app agregada a la pantalla de inicio.
 */

import { supabase } from '@/lib/supabase';
import { fetchConSesion } from '@/lib/fetchConSesion';

export const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export type EstadoPush =
  | 'no-soportado'   // el navegador no tiene Web Push
  | 'no-seguro'      // sin https
  | 'instalar-ios'   // iPhone/iPad fuera de la app instalada
  | 'sin-servidor'   // falta la clave pública en Netlify
  | 'bloqueado'      // la persona negó el permiso (se cambia en los ajustes)
  | 'inactivo'       // se puede activar
  | 'activo';

export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function esAppInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function claveServidor(base64url: string): ArrayBuffer {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function mismaClave(a: ArrayBuffer | null, b: ArrayBuffer): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.every((v, i) => v === y[i]);
}

function nombreDispositivo(): string {
  const ua = navigator.userAgent;
  const so = /android/i.test(ua) ? 'Android' : esIOS() ? 'iPhone/iPad' : /windows/i.test(ua) ? 'Windows'
    : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Dispositivo';
  return `${so} · ${esAppInstalada() ? 'app instalada' : 'navegador'}`;
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function guardar(sub: PushSubscription): Promise<void> {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('push_registrar', {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_dispositivo: nombreDispositivo(),
  });
  if (error) {
    if (error.code === 'PGRST202' || /push_registrar|schema cache/i.test(error.message)) throw new Error('Falta ejecutar supabase_fase6_ot_terreno.sql en Supabase.');
    throw error;
  }
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'no-soportado';
  if (!window.isSecureContext) return 'no-seguro';
  if (esIOS() && !esAppInstalada()) return 'instalar-ios';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no-soportado';
  if (!CLAVE_PUBLICA) return 'sin-servidor';
  if (Notification.permission === 'denied') return 'bloqueado';
  const sub = await suscripcionActual();
  return sub && Notification.permission === 'granted' && mismaClave(sub.options.applicationServerKey, claveServidor(CLAVE_PUBLICA)) ? 'activo' : 'inactivo';
}

/** Llamar directo desde un clic: el iPhone solo pide el permiso si lo pide un gesto de la persona. */
export async function activarPush(): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error(permiso === 'denied'
      ? 'Bloqueaste los avisos. Actívalos en los ajustes del navegador o del teléfono.'
      : 'No se concedió el permiso para mostrar avisos.');
  }
  if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const clave = claveServidor(CLAVE_PUBLICA);
  if (sub && !mismaClave(sub.options.applicationServerKey, clave)) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  await guardar(sub);
}

export async function desactivarPush(): Promise<void> {
  const sub = await suscripcionActual();
  if (!sub) return;
  await supabase.rpc('push_quitar', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Si el navegador ya está suscrito, reafirma el registro (por si se borró, o es otra persona). */
export async function resincronizarPush(): Promise<void> {
  try {
    if (!CLAVE_PUBLICA || !('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const sub = await suscripcionActual();
    if (sub && mismaClave(sub.options.applicationServerKey, claveServidor(CLAVE_PUBLICA))) await guardar(sub);
  } catch { /* sin conexión o sin la fase 6: queda como está */ }
}

export async function probarPush(): Promise<{ enviados: number; dispositivos: number; error?: string }> {
  const r = await fetchConSesion('/api/push/prueba', { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'No se pudo enviar la prueba.');
  return j;
}
