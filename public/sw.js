// ============================================================================
// GO Admin ERP — Service Worker
// Estrategia simple: NO interceptar navegaciones (el navegador lo hace mejor).
// Solo cachear estáticos para offline. Esto evita los bugs de Safari con
// respuestas redirigidas y los loops de navegacion a /.
// ============================================================================

const CACHE_NAME = 'goadmin-erp-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: SOLO interceptar estaticos (_next/static, iconos, manifest).
// NO interceptar navegaciones ni API — el navegador lo hace mejor y evita
// bugs de Safari con respuestas redirigidas.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (Supabase, Google, etc.)
  if (url.origin !== self.location.origin) return;

  // Static assets (_next/static, icons, manifest): cache-first
  if (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icon-') ||
      url.pathname === '/manifest.json' ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/apple-touch-icon.png') {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        });
      })
    );
  }

  // NO interceptar navegaciones ni API ni nada mas.
  // El navegador maneja navegacion, redirecciones del middleware, etc.
});

// Push notifications: mostrar notificación cuando llega un push
self.addEventListener('push', (event) => {
  if (!event) return;

  let data = { title: 'GoAdmin ERP', body: 'Nueva notificación' };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en notificación: abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
