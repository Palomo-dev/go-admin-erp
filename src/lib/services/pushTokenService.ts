/**
 * Servicio para registro de tokens de push notifications en Go Admin Mobile.
 *
 * Flujo:
 * 1. Al montar AppLayout (si isMobile()), se llama registerPushToken()
 * 2. Se solicita permiso con PushNotifications.requestPermissions()
 * 3. Se registra con PushNotifications.register() para obtener token FCM/APNs
 * 4. Se inserta/actualiza el token en la tabla `device_push_tokens`
 * 5. Al logout, se llama unregisterPushToken() para limpiar
 *
 * En web/desktop, todas las funciones son no-ops.
 */

import { supabase } from '@/lib/supabase/config';
import {
  isMobile,
  isIOS,
  isAndroid,
  getMobilePlugin,
} from '@/lib/utils/mobile';

// ============================================================================
// Tipos
// ============================================================================

interface PushTokenRow {
  id: string;
  user_id: string;
  platform: 'ios' | 'android';
  token: string;
  app_version?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Registro de push token
// ============================================================================

/**
 * Registra el token de push notifications del dispositivo en la base de datos.
 *
 * @param userId - ID del usuario autenticado
 * @param appVersion - Versión de la app (opcional)
 * @returns true si se registró correctamente, false si no aplica o falló
 */
export async function registerPushToken(
  userId: string,
  appVersion?: string,
): Promise<boolean> {
  if (!isMobile() || !userId) return false;

  const push = getMobilePlugin('PushNotifications');
  if (!push?.requestPermissions || !push?.register || !push?.getToken) {
    console.warn('[pushToken] Plugin PushNotifications no disponible');
    return false;
  }

  try {
    // 1. Solicitar permiso
    const permResult = await push.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[pushToken] Permiso de notificaciones denegado');
      return false;
    }

    // 2. Registrar para obtener token
    await push.register();

    // 3. Obtener token (puede tardar un momento tras register())
    let token: string | null = null;
    for (let i = 0; i < 5; i++) {
      try {
        const result = await push.getToken();
        if (result?.token) {
          token = result.token;
          break;
        }
      } catch {
        // Token puede no estar listo inmediatamente
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!token) {
      console.warn('[pushToken] No se pudo obtener token tras 5 intentos');
      return false;
    }

    // 4. Determinar plataforma
    const platform: 'ios' | 'android' = isIOS() ? 'ios' : 'android';

    // 5. Insertar o actualizar en device_push_tokens (upsert)
    const { error } = await supabase
      .from('device_push_tokens')
      .upsert(
        {
          user_id: userId,
          platform,
          token,
          app_version: appVersion || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );

    if (error) {
      console.error('[pushToken] Error guardando token en BD:', error.message);
      return false;
    }

    console.log(`[pushToken] Token registrado para usuario ${userId} (${platform})`);
    return true;
  } catch (err) {
    console.error('[pushToken] Error registerPushToken:', err);
    return false;
  }
}

// ============================================================================
// Desregistro de push token (al logout)
// ============================================================================

/**
 * Elimina el token del dispositivo de la base de datos.
 * Debe llamarse al cerrar sesión.
 *
 * @param userId - ID del usuario
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (!isMobile() || !userId) return;

  const push = getMobilePlugin('PushNotifications');
  if (!push?.getToken) return;

  try {
    const { token } = await push.getToken();
    if (!token) return;

    await supabase
      .from('device_push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    console.log(`[pushToken] Token eliminado para usuario ${userId}`);
  } catch (err) {
    console.error('[pushToken] Error unregisterPushToken:', err);
  }
}

// ============================================================================
// Limpieza de tokens huérfanos
// ============================================================================

/**
 * Elimina todos los tokens de un usuario (útil al cambiar de dispositivo).
 * Solo debe usarse desde contexto administrativo o cleanup.
 */
export async function removeAllUserTokens(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await supabase.from('device_push_tokens').delete().eq('user_id', userId);
  } catch (err) {
    console.error('[pushToken] Error removeAllUserTokens:', err);
  }
}
