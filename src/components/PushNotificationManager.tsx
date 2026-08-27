'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/context/SessionContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { saveWebPushSubscription, removeWebPushSubscription } from '@/lib/services/webPushService';

/**
 * Gestiona la suscripción a notificaciones push web automáticamente.
 * - Pide permiso después del login (si no fue concedido/denegado antes)
 * - Suscribe al service worker
 * - Guarda la suscripción en Supabase
 * - No muestra UI; es silencioso
 */
export function PushNotificationManager() {
  const { user } = useSession();
  const { isSupported, permission, isSubscribed, subscription, requestPermission, subscribe, unsubscribe } = usePushNotifications();
  const [saved, setSaved] = useState(false);

  // Cuando el usuario inicia sesión, intentar suscribir automáticamente
  useEffect(() => {
    if (!user || !isSupported) return;
    if (permission === 'denied') return;
    if (isSubscribed) return;

    // Esperar 3s después del login para no interrumpir la carga inicial
    const timer = setTimeout(async () => {
      // Solo pedir permiso si no se ha decidido antes
      if (Notification.permission === 'default') {
        const result = await requestPermission();
        if (result !== 'granted') return;
      }
      if (Notification.permission === 'granted') {
        await subscribe();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [user, isSupported, permission, isSubscribed, requestPermission, subscribe]);

  // Guardar suscripción en Supabase cuando cambia
  useEffect(() => {
    if (!user || !subscription || saved) return;
    saveWebPushSubscription(user.id, subscription).then((ok) => {
      if (ok) setSaved(true);
    });
  }, [user, subscription, saved]);

  // Eliminar suscripción de Supabase al desuscribir
  useEffect(() => {
    if (subscription || !saved) return;
    // Si tenía suscripción y ya no, limpiar
  }, [subscription, saved]);

  return null;
}
