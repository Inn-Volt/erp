'use client';

/**
 * Avisos al celular y al computador (Web Push): permiso del sistema, suscripción del
 * navegador y registro en la base (push_suscripciones). Llegan aunque la app esté cerrada.
 * Los manda el servidor (app/api/push) cada vez que la base crea un aviso de la campana.
 *
 * Funciona en Android (Chrome, Edge, Samsung, Firefox), en computadores (Chrome, Edge,
 * Firefox, Safari en Mac) y en iPhone/iPad con iOS 16.4 o más, con la app agregada a la
 * pantalla de inicio (Apple no permite avisos a una página abierta en Safari).
 * Se necesita https (o localhost).
 *
 * Para que no se corten: cada vez que se abre la app se revisa la suscripción; si el
 * navegador la perdió o cambiaron las claves, se renueva sola (sin volver a pedir permiso).
 */

import { supabase } from '@/lib/supabase';
import { fetchConSesion } from '@/lib/fetchConSesion';

export type EstadoPush =
  | 'no-soportado'   // el navegador no tiene Web Push
  | 'no-seguro'      // sin https
  | 'instalar-ios'   // iPhone/iPad fuera de la app instalada
  | 'sin-servidor'   // el administrador todavía no configura los avisos
  | 'bloqueado'      // la persona negó el permiso (se cambia en los ajustes)
  | 'inactivo'       // se puede activar
  | 'activo';

/** Este equipo tenía los avisos activos (para renovarlos solos si el navegador los pierde). */
const MARCA = 'innvolt-push-activo';

export function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function esAppInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let claveCache: string | null = null;
/** La clave pública de los avisos (la da el servidor; en Netlify puede venir fija). */
export async function clavePublica(): Promise<string | null> {
  if (claveCache) return claveCache;
  const fija = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  if (fija) return (claveCache = fija);
  try {
    const r = await fetch('/api/push/clave', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return (claveCache = typeof j.clave === 'string' && j.clave ? j.clave : null);
  } catch { return null; }
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
    : /mac os/i.test(ua) ? 'Mac' : /cros/i.test(ua) ? 'Chromebook' : /linux/i.test(ua) ? 'Linux' : 'Dispositivo';
  const nav = /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? 'Samsung' : /firefox|fxios/i.test(ua) ? 'Firefox'
    : /opr\//i.test(ua) ? 'Opera' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return `${so}${nav ? ` · ${nav}` : ''} · ${esAppInstalada() ? 'app instalada' : 'navegador'}`;
}

async function registro(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
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

/** Suscribe este equipo con la clave actual (cambia la suscripción si era de otra clave). */
async function suscribir(clave: string): Promise<PushSubscription> {
  const reg = await registro();
  const k = claveServidor(clave);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !mismaClave(sub.options.applicationServerKey, k)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
  return sub;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (typeof window === 'undefined') return 'no-soportado';
  if (!window.isSecureContext) return 'no-seguro';
  if (esIOS() && !esAppInstalada()) return 'instalar-ios';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no-soportado';
  const clave = await clavePublica();
  if (!clave) return 'sin-servidor';
  if (Notification.permission === 'denied') return 'bloqueado';
  const sub = await suscripcionActual();
  return sub && Notification.permission === 'granted' && mismaClave(sub.options.applicationServerKey, claveServidor(clave)) ? 'activo' : 'inactivo';
}

/** Llamar directo desde un clic: el iPhone solo pide el permiso si lo pide un gesto de la persona. */
export async function activarPush(): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error(permiso === 'denied'
      ? 'Bloqueaste los avisos. Actívalos en los ajustes del navegador o del teléfono.'
      : 'No se concedió el permiso para mostrar avisos.');
  }
  const clave = await clavePublica();
  if (!clave) throw new Error('El administrador todavía no configura los avisos.');
  await guardar(await suscribir(clave));
  try { localStorage.setItem(MARCA, '1'); } catch { /* opcional */ }
}

export async function desactivarPush(): Promise<void> {
  try { localStorage.removeItem(MARCA); } catch { /* opcional */ }
  const sub = await suscripcionActual();
  if (!sub) return;
  await supabase.rpc('push_quitar', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/**
 * Al abrir la app: si este equipo tiene los avisos, reafirma su registro (por si se borró o
 * es otra persona); si el navegador perdió la suscripción o cambió la clave, la renueva sola.
 */
export async function resincronizarPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const clave = await clavePublica();
    if (!clave) return;
    const sub = await suscripcionActual();
    let marcado = false;
    try { marcado = localStorage.getItem(MARCA) === '1'; } catch { /* opcional */ }
    if (sub && mismaClave(sub.options.applicationServerKey, claveServidor(clave))) { await guardar(sub); return; }
    // Tenía avisos (o una suscripción de otra clave): se renueva sin volver a pedir permiso.
    if (sub || marcado) await guardar(await suscribir(clave));
  } catch { /* sin conexión o sin la fase 6: queda como está */ }
}

export async function probarPush(): Promise<{ enviados: number; dispositivos: number; error?: string }> {
  const r = await fetchConSesion('/api/push/prueba', { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'No se pudo enviar la prueba.');
  return j;
}

/** El número sobre el ícono de la app instalada (avisos sin leer). */
export function marcarInsignia(n: number): void {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch { /* no soportado */ }
}
