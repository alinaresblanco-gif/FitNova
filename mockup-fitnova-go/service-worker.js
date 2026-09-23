const CACHE_NAME = 'fitnova-go-2026.09.23.15';
const APP_SHELL = [
  './',
  './index.html',
  './agenda.html',
  './videos.html',
  './perfil.html',
  './ajustes.html',
  './placeholder.html',
  './css/styles.css',
  './js/app.js',
  './manifest.webmanifest',
  '../imagenes/LOGO-FITNOVA%20USUARIO.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'APP_UPDATED' })))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith('/service-worker.js')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
