// ============================================================================
// GO Admin ERP — Service Worker
// Estrategia: network-first con timeout para navegación, cache-first para
// estáticos. El timeout evita que la PWA se quede en blanco esperando la red.
// ============================================================================

const CACHE_NAME = 'goadmin-erp-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

// Timeout para navegación: si la red no responde en 3s, usar cache.
// En producción con buena red, la respuesta llega en <500ms.
// 3s es suficiente para no servir contenido stale innecesariamente.
const NAV_TIMEOUT_MS = 3000;

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

// Fetch: network-first with timeout for navigation, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin requests (Supabase, Google, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip API routes and Next.js internals
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/_next/data/') ||
      url.pathname.includes('/_next/webpack-hmr')) {
    return;
  }

  // Navigation requests: network-first with timeout + offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Race: network vs timeout
          const networkResponse = await Promise.race([
            fetch(request),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error('NAV_TIMEOUT')), NAV_TIMEOUT_MS)
            ),
          ]);

          // Cache successful navigation responses
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        } catch (err) {
          // Timeout or network error: try cache, then fallback to cached root
          const cached = await caches.match(request);
          if (cached) return cached;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          // No cache available: re-throw to let the browser handle the error
          throw err;
        }
      })()
    );
    return;
  }

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
