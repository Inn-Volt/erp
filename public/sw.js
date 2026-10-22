/* InnVolt — Service Worker mínimo para PWA instalable.
   Estrategia network-first: siempre intenta la red (datos frescos) y solo
   usa caché como respaldo offline para navegaciones. No cachea agresivamente
   los chunks de Next (evita quedar con versiones viejas). */
const CACHE = 'innvolt-shell-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (req.mode === 'navigate') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || caches.match('/login'))
      )
  );
});


/* ── Avisos al celular y al computador (Web Push) ──────────────────────────────
   El servidor (app/api/push) manda {id, titulo, cuerpo, url, tipo, pendientes}. Se muestra
   aunque la app esté cerrada; el iPhone exige mostrar SIEMPRE un aviso por cada push.
   · tag = id del aviso: si llega repetido (un reintento), reemplaza al anterior.
   · badge: ícono de una sola tinta para la barra de Android.
   · Los importantes (visitas, asignaciones) quedan en pantalla del computador hasta cerrarlos.
   · El número sobre el ícono de la app = avisos sin leer. */
const IMPORTANTES = ['recordatorio_visita', 'visita_asignada', 'ot_asignada', 'tarea_asignada', 'cotizacion_aceptada', 'cotizacion_asignada', 'visita_sin_cerrar'];

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { cuerpo: event.data ? event.data.text() : '' }; }
  const opciones = {
    body: data.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { url: data.url || '/inicio', id: data.id || null },
    timestamp: Date.now(),
    vibrate: [180, 80, 180],
    requireInteraction: IMPORTANTES.includes(data.tipo),
  };
  if (data.id) { opciones.tag = data.id; opciones.renotify = true; }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.titulo || 'InnVolt', opciones),
    (async () => {
      if (typeof data.pendientes !== 'number' || !self.navigator || !self.navigator.setAppBadge) return;
      try { if (data.pendientes > 0) await self.navigator.setAppBadge(data.pendientes); else await self.navigator.clearAppBadge(); } catch (e) { /* no soportado */ }
    })(),
  ]));
});

/* Tocar el aviso: si la app ya está abierta se enfoca y va a la pantalla; si no, se abre ahí. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.url) || '/inicio';
  const destino = new URL(ruta, self.location.origin).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
        await v.focus();
        if ('navigate' in v) await v.navigate(destino).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});

/* El navegador cambió la suscripción de este equipo (pasa en Firefox y a veces en Chrome):
   se suscribe de nuevo con la misma clave y se le avisa al servidor, aunque la app esté cerrada.
   Si no se puede, la app la renueva sola la próxima vez que se abra. */
function claveDe(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const anterior = event.oldSubscription || null;
    let nueva = event.newSubscription || null;
    if (!nueva) {
      let clave = anterior && anterior.options ? anterior.options.applicationServerKey : null;
      if (!clave) {
        const r = await fetch('/api/push/clave', { cache: 'no-store' });
        if (!r.ok) return;
        clave = claveDe((await r.json()).clave);
      }
      nueva = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    }
    if (!anterior) return;
    const j = nueva.toJSON();
    await fetch('/api/push/renovar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anterior: anterior.endpoint, endpoint: j.endpoint, keys: j.keys }),
    });
  })().catch(() => {}));
});
