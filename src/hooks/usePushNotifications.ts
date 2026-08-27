'use client';

import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/**
 * Hook para gestionar suscripción a notificaciones push web (PWA).
 * Usa la Push API del navegador + service worker.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    setIsSupported(true);
    setPermission(Notification.permission);

    // Verificar si ya hay suscripción activa
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscription(sub);
      });
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return null;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<PushSubscription | null> => {
    if (!isSupported || !VAPID_PUBLIC_KEY) return null;

    // Pedir permiso si no se ha concedido
    if (Notification.permission === 'default') {
      const result = await requestPermission();
      if (result !== 'granted') return null;
    }
    if (Notification.permission !== 'granted') return null;

    const reg = await navigator.serviceWorker.ready;

    // Verificar si ya está suscrito
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      setSubscription(existing);
      return existing;
    }

    // Crear nueva suscripción
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    setSubscription(sub);
    return sub;
  }, [isSupported, requestPermission]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    await subscription.unsubscribe();
    setSubscription(null);
  }, [subscription]);

  return {
    isSupported,
    permission,
    isSubscribed: !!subscription,
    subscription,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}

/**
 * Convierte una clave VAPID base64 a Uint8Array (requerido por PushManager.subscribe).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
