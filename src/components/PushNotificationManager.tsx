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
 *
 * En iOS PWA standalone, el service worker puede tardar más en estar listo,
 * así que se reintenta la suscripción varias veces.
 */
export function PushNotificationManager() {
  const { session } = useSession();
  const user = session?.user;
  const { isSupported, permission, isSubscribed, subscription, requestPermission, subscribe, unsubscribe } = usePushNotifications();
  const [saved, setSaved] = useState(false);

  // Cuando el usuario inicia sesión, intentar suscribir automáticamente
  useEffect(() => {
    if (!user || !isSupported) return;
    if (permission === 'denied') return;
    if (isSubscribed) return;

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 5; // Reintentar 5 veces (iOS PWA puede tardar)

    const trySubscribe = async () => {
      if (cancelled || isSubscribed) return;
      attempt++;

      // Solo pedir permiso si no se ha decidido antes
      if (Notification.permission === 'default') {
        const result = await requestPermission();
        if (result !== 'granted') return;
      }
      if (Notification.permission === 'granted') {
        const sub = await subscribe();
        if (sub) return; // Éxito
        // Si falla y quedan intentos, reintentar (service worker puede no estar listo)
        if (attempt < maxAttempts && !cancelled) {
          setTimeout(trySubscribe, 2000 * attempt); // backoff: 2s, 4s, 6s, 8s
        }
      }
    };

    // Esperar 3s después del login para no interrumpir la carga inicial
    const timer = setTimeout(trySubscribe, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
