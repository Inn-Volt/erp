/* InnVolt — Service Worker mínimo para PWA instalable.
   Estrategia network-first: siempre intenta la red (datos frescos) y solo
   usa caché como respaldo offline para navegaciones. No cachea agresivamente
   los chunks de Next (evita quedar con versiones viejas). */
const CACHE = 'innvolt-shell-v2';

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

/* ── Avisos al celular (Web Push) ──────────────────────────────────────────────
   El servidor (app/api/push) manda {titulo, cuerpo, url}. Se muestra aunque la app
   esté cerrada; el iPhone exige mostrar SIEMPRE un aviso por cada push recibido. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { cuerpo: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(data.titulo || 'InnVolt', {
      body: data.cuerpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

/* Tocar el aviso: si la app ya está abierta se enfoca y va a la pantalla; si no, se abre ahí. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ruta = (event.notification.data && event.notification.data.url) || '/';
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
