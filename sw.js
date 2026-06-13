/* AquaGestión Service Worker — offline-first cache */
const CACHE_VERSION = 'aquagestion-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/export.js',
  './js/services.js',
  './js/views/dashboard.js',
  './js/views/clientes.js',
  './js/views/pedidos.js',
  './js/views/cobranza.js',
  './js/views/rutas.js',
  './js/views/reportes.js',
  './js/views/configuracion.js',
  './vendor/xlsx.full.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navegación: intenta la red, pero si falla O responde con error (404/500),
  // sirve la copia cacheada de index.html. Así la app instalada sigue abriendo
  // aunque el servidor no esté disponible o el repo quede privado.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) return res;
          return caches.match('./index.html').then((cached) => cached || res);
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first para el resto (recursos estáticos)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cachea respuestas válidas del mismo origen sobre la marcha
        if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
