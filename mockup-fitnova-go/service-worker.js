const CACHE_NAME = 'fitnova-go-2026.12.01.4';
const APP_SHELL = [
  './',
  './index.html',
  './agenda.html',
  './videos.html',
  './comunicacion.html',
  './seguimiento.html',
  './perfil.html',
  './ajustes.html',
  './placeholder.html',
  './nutricion.html',
  './entrenamiento.html',
  './login.html',
  './recuperar.html',
  './invitacion.html',
  './css/styles.css',
  './js/app.js',
  './js/agenda.js',
  '../js/sesiones.js',
  '../js/recuperacion.js',
  '../js/comunicacion.js',
  '../js/comunicacion-header.js',
  '../js/chat.js',
  '../js/archivos-seguimiento.js',
  '../js/formularios-seguimiento.js',
  '../css/comunicacion.css',
  '../js/metricas.js',
  '../js/fotos-progreso.js',
  '../js/actividades.js',
  '../js/importar-actividad.js',
  '../js/nutricion.js',
  '../js/planes-nutricionales.js',
  '../js/entrenos.js',
  './js/nutricion-go.js',
  './js/planes-nutricionales-go.js',
  './js/entrenos-go.js',
  './js/videos-go.js',
  './js/supabase-client.js',
  './js/perfil.js',
  './js/foto-perfil.js',
  './js/evolucion.js',
  './js/ajustes.js',
  './js/invitacion.js',
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
  // Nunca interceptar peticiones a otros orígenes (API de Supabase, CDNs...):
  // deben ir siempre a la red para devolver datos frescos.
  if (requestUrl.origin !== self.location.origin) return;
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
