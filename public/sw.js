/* InnVolt — Service Worker mínimo para PWA instalable.
   Estrategia network-first: siempre intenta la red (datos frescos) y solo
   usa caché como respaldo offline para navegaciones. No cachea agresivamente
   los chunks de Next (evita quedar con versiones viejas). */
const CACHE = 'innvolt-shell-v1';

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
