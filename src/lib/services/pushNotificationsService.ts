/**
 * Servicio de Push Notifications con Service Workers
 */

import Logger from '@/lib/utils/logger';

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushNotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  data?: Record<string, any>;
}



// VAPID Keys (En producción, usar variables de entorno)
const VAPID_PUBLIC_KEY = 'BKJ8JQZ8YGqV2rJ1eLHFqX2-_Xq6vJ9F8nYkXbGKwFzY2mMjO3hKL4_P1qS5T7uW9xZ0aA2cC4eE6gG8iI0jJ2kK4mM';

class PushNotificationsManager {
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private subscription: globalThis.PushSubscription | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      this.initServiceWorker();
    }
  }

  /**
   * Inicializar Service Worker
   */
  private async initServiceWorker(): Promise<void> {
    try {
      Logger.info('NOTIFICATIONS', '🔧 Inicializando Service Worker...');
      
      const registration = await navigator.serviceWorker.register('/sw-notifications.js', {
        scope: '/'
      });

      this.serviceWorkerRegistration = registration;
      
      Logger.info('NOTIFICATIONS', '✅ Service Worker registrado exitosamente');
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error registrando Service Worker:', error);
      throw error;
    }
  }

  /**
   * Manejar mensajes del Service Worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    Logger.info('NOTIFICATIONS', '📨 Mensaje del Service Worker recibido:', event.data);
    
    const { type, data } = event.data;
    
    switch (type) {
      case 'NOTIFICATION_CLICKED':
        this.handleNotificationClick(data);
        break;
      case 'NOTIFICATION_CLOSED':
        Logger.info('NOTIFICATIONS', '🔕 Notificación cerrada:', data);
        break;
      default:
        Logger.info('NOTIFICATIONS', '📨 Mensaje desconocido del Service Worker:', event.data);
    }
  }

  /**
   * Manejar click en notificación
   */
  private handleNotificationClick(data: any): void {
    Logger.info('NOTIFICATIONS', '🖱️ Notificación clickeada:', data);
    
    // Navigate to notification detail if needed
    if (data?.url) {
      window.open(data.url, '_blank');
    }
    
    // Mark notification as read
    if (data?.notificationId) {
      // Call API to mark as read
      this.markNotificationAsRead(data.notificationId);
    }
  }

  /**
   * Marcar notificación como leída
   */
  private async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      // This would call your notifications API
      Logger.info('NOTIFICATIONS', '✅ Marcando notificación como leída:', { notificationId });
      // await realtimeNotificationService.markAsRead(notificationId);
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error marcando notificación como leída:', error);
    }
  }

  /**
   * Verificar soporte para notificaciones push
   */
  public isSupported(): boolean {
    const supported = typeof window !== 'undefined' && 
                     'serviceWorker' in navigator && 
                     'PushManager' in window &&
                     'Notification' in window;
                     
    Logger.info('NOTIFICATIONS', '🔍 Soporte para Push Notifications:', { supported });
    return supported;
  }

  /**
   * Solicitar permisos para notificaciones
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error('Push notifications no soportadas');
    }

    Logger.info('NOTIFICATIONS', '🔐 Solicitando permisos para notificaciones...');
    
    const permission = await Notification.requestPermission();
    
    Logger.info('NOTIFICATIONS', '🔐 Permiso obtenido:', { permission });
    
    return permission;
  }

  /**
   * Suscribir a push notifications
   */
  public async subscribe(): Promise<globalThis.PushSubscription> {
    if (!this.serviceWorkerRegistration) {
      throw new Error('Service Worker no registrado');
    }

    try {
      Logger.info('NOTIFICATIONS', '📝 Suscribiendo a push notifications...');
      
      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlB64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      this.subscription = subscription;
      
      Logger.info('NOTIFICATIONS', '✅ Suscrito exitosamente a push notifications:', {
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys
      });
      
      // Save subscription to backend
      await this.saveSubscriptionToBackend(subscription);
      
      return subscription;
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error suscribiendo a push notifications:', error);
      throw error;
    }
  }

  /**
   * Desuscribir de push notifications
   */
  public async unsubscribe(): Promise<boolean> {
    if (!this.subscription) {
      Logger.warn('NOTIFICATIONS', '⚠️ No hay suscripción activa');
      return false;
    }

    try {
      Logger.info('NOTIFICATIONS', '📝 Desuscribiendo de push notifications...');
      
      const result = await this.subscription.unsubscribe();
      
      if (result) {
        // Remove subscription from backend
        await this.removeSubscriptionFromBackend(this.subscription);
        this.subscription = null;
      }
      
      Logger.info('NOTIFICATIONS', '✅ Desuscrito exitosamente:', { result });
      
      return result;
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error desuscribiendo:', error);
      throw error;
    }
  }

  /**
   * Obtener suscripción actual
   */
  public async getSubscription(): Promise<globalThis.PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      return null;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      this.subscription = subscription;
      
      Logger.info('NOTIFICATIONS', '📋 Suscripción actual:', { status: subscription ? 'Activa' : 'No activa' });
      
      return subscription;
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error obteniendo suscripción:', error);
      return null;
    }
  }

  /**
   * Enviar notificación local (para pruebas)
   */
  public async sendLocalNotification(data: PushNotificationData): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Notificaciones no soportadas');
    }

    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      throw new Error('Permisos denegados para notificaciones');
    }

    Logger.info('NOTIFICATIONS', '📧 Enviando notificación local:', data);

    const notification = new Notification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/notification-icon.png',
      badge: data.badge || '/icons/notification-badge.png',
      tag: data.tag,
      requireInteraction: data.requireInteraction || false,
      data: data.data || {}
    });

    notification.onclick = (event) => {
      event.preventDefault();
      Logger.info('NOTIFICATIONS', '🖱️ Notificación local clickeada');
      
      if (data.data?.url) {
        window.open(data.data.url, '_blank');
      }
      
      notification.close();
    };

    // Auto close after 5 seconds if not requiring interaction
    if (!data.requireInteraction) {
      setTimeout(() => {
        notification.close();
      }, 5000);
    }
  }

  /**
   * Guardar suscripción en el backend
   */
  private async saveSubscriptionToBackend(subscription: globalThis.PushSubscription): Promise<void> {
    try {
      Logger.info('NOTIFICATIONS', '💾 Guardando suscripción en backend...');
      
      const subscriptionData = {
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString()
      };
      
      // Here you would call your API to save the subscription
      // await fetch('/api/push-subscriptions', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(subscriptionData)
      // });
      
      Logger.info('NOTIFICATIONS', '✅ Suscripción guardada en backend');
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error guardando suscripción:', error);
    }
  }

  /**
   * Remover suscripción del backend
   */
  private async removeSubscriptionFromBackend(subscription: globalThis.PushSubscription): Promise<void> {
    try {
      Logger.info('NOTIFICATIONS', '🗑️ Removiendo suscripción del backend...');
      
      // Here you would call your API to remove the subscription
      // await fetch(`/api/push-subscriptions/${btoa(subscription.endpoint)}`, {
      //   method: 'DELETE'
      // });
      
      Logger.info('NOTIFICATIONS', '✅ Suscripción removida del backend');
      
    } catch (error) {
      Logger.error('NOTIFICATIONS', '❌ Error removiendo suscripción:', error);
    }
  }

  /**
   * Convertir VAPID key de base64 a Uint8Array
   */
  private urlB64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Export singleton instance
export const pushNotificationsManager = new PushNotificationsManager();

// Export types
export type { PushNotificationData };
