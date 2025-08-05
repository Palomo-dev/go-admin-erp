/**
 * Service Worker para Push Notifications
 * Go Admin ERP - Sistema de Notificaciones
 */

const CACHE_NAME = 'go-admin-erp-notifications-v1';
const NOTIFICATION_TAG = 'go-admin-erp-notification';

// Install event
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: Cache abierto');
      return cache.addAll([
        '/icons/notification-icon.png',
        '/icons/notification-badge.png',
        '/favicon.ico'
      ]);
    })
  );
  
  // Activar inmediatamente el nuevo service worker
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Controlar inmediatamente todas las páginas
  return self.clients.claim();
});

// Push event - Recibir notificación push
self.addEventListener('push', (event) => {
  console.log('📧 Service Worker: Push recibido:', event);

  let notificationData = {
    title: 'Go Admin ERP',
    body: 'Nueva notificación',
    icon: '/icons/notification-icon.png',
    badge: '/icons/notification-badge.png',
    tag: NOTIFICATION_TAG,
    requireInteraction: false,
    data: {}
  };

  // Parse push data if available
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
    } catch (error) {
      console.error('❌ Service Worker: Error parseando datos push:', error);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  console.log('📋 Service Worker: Mostrando notificación:', notificationData);

  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    data: notificationData.data,
    actions: notificationData.actions || [
      {
        action: 'open',
        title: 'Abrir',
        icon: '/icons/open-icon.png'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/icons/close-icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Service Worker: Notificación clickeada:', event);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  // Close the notification
  notification.close();
  
  if (action === 'close') {
    console.log('🔕 Service Worker: Notificación cerrada por acción');
    
    // Send message to client
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'NOTIFICATION_CLOSED',
            data: { notificationId: data.notificationId, action }
          });
        });
      })
    );
    
    return;
  }
  
  // Handle notification click
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Send message to all clients
      clients.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          data: { notificationId: data.notificationId, action, url: data.url }
        });
      });
      
      // Try to focus existing window
      const existingClient = clients.find((client) => {
        return client.url === data.url || client.url.includes(data.path || '');
      });
      
      if (existingClient) {
        console.log('🔍 Service Worker: Enfocando ventana existente');
        return existingClient.focus();
      }
      
      // Open new window
      if (data.url) {
        console.log('🔗 Service Worker: Abriendo nueva ventana:', data.url);
        return self.clients.openWindow(data.url);
      } else {
        // Open main app
        console.log('🏠 Service Worker: Abriendo aplicación principal');
        return self.clients.openWindow('/app/notificaciones');
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Service Worker: Notificación cerrada:', event);
  
  const notification = event.notification;
  const data = notification.data || {};
  
  // Send message to client
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLOSED',
          data: { notificationId: data.notificationId }
        });
      });
    })
  );
});

// Message event - Recibir mensajes del cliente
self.addEventListener('message', (event) => {
  console.log('📨 Service Worker: Mensaje recibido:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SHOW_NOTIFICATION':
      showNotification(data);
      break;
    case 'CLOSE_NOTIFICATIONS':
      closeNotifications(data.tag);
      break;
    default:
      console.log('📨 Service Worker: Tipo de mensaje desconocido:', type);
  }
});

/**
 * Mostrar notificación local
 */
async function showNotification(data) {
  console.log('📧 Service Worker: Mostrando notificación local:', data);
  
  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/icons/notification-icon.png',
    badge: data.badge || '/icons/notification-badge.png',
    tag: data.tag || NOTIFICATION_TAG,
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
    actions: data.actions || [
      {
        action: 'open',
        title: 'Abrir',
        icon: '/icons/open-icon.png'
      }
    ]
  };
  
  try {
    await self.registration.showNotification(data.title, notificationOptions);
    console.log('✅ Service Worker: Notificación mostrada exitosamente');
  } catch (error) {
    console.error('❌ Service Worker: Error mostrando notificación:', error);
  }
}

/**
 * Cerrar notificaciones por tag
 */
async function closeNotifications(tag) {
  console.log('🔕 Service Worker: Cerrando notificaciones con tag:', tag);
  
  try {
    const notifications = await self.registration.getNotifications({ tag });
    notifications.forEach(notification => notification.close());
    
    console.log(`✅ Service Worker: ${notifications.length} notificaciones cerradas`);
  } catch (error) {
    console.error('❌ Service Worker: Error cerrando notificaciones:', error);
  }
}

// Background sync (for future use)
self.addEventListener('sync', (event) => {
  console.log('🔄 Service Worker: Background sync:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

/**
 * Sincronizar notificaciones en background
 */
async function syncNotifications() {
  console.log('🔄 Service Worker: Sincronizando notificaciones...');
  
  try {
    // Here you would fetch pending notifications from your API
    // const response = await fetch('/api/notifications/pending');
    // const pendingNotifications = await response.json();
    
    // Process pending notifications
    console.log('✅ Service Worker: Notificaciones sincronizadas');
  } catch (error) {
    console.error('❌ Service Worker: Error sincronizando notificaciones:', error);
  }
}
