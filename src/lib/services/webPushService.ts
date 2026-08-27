/**
 * Servicio para guardar/eliminar suscripciones de Web Push (PWA) en Supabase.
 *
 * A diferencia de pushTokenService.ts (que maneja tokens FCM/APNs de la app nativa),
 * este servicio maneja suscripciones Web Push de la PWA instalada desde el navegador.
 */

import { supabase } from '@/lib/supabase/config';

interface WebPushSubscription {
  id?: string;
  user_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: 'web';
  user_agent?: string;
  created_at?: string;
}

/**
 * Guarda una suscripción Web Push en la base de datos.
 * Usa upsert para evitar duplicados por endpoint.
 */
export async function saveWebPushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<boolean> {
  if (!userId || !subscription) return false;

  const subData: WebPushSubscription = {
    user_id: userId,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.getKey('p256dh')
        ? arrayBufferToBase64(subscription.getKey('p256dh')!)
        : '',
      auth: subscription.getKey('auth')
        ? arrayBufferToBase64(subscription.getKey('auth')!)
        : '',
    },
    platform: 'web',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  const { error } = await supabase
    .from('web_push_subscriptions')
    .upsert(subData, { onConflict: 'endpoint' });

  if (error) {
    console.error('[WebPush] Error guardando suscripción:', error.message);
    return false;
  }

  return true;
}

/**
 * Elimina una suscripción Web Push de la base de datos.
 */
export async function removeWebPushSubscription(
  endpoint: string,
): Promise<boolean> {
  if (!endpoint) return false;

  const { error } = await supabase
    .from('web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    console.error('[WebPush] Error eliminando suscripción:', error.message);
    return false;
  }

  return true;
}

/**
 * Convierte un ArrayBuffer a string base64.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
