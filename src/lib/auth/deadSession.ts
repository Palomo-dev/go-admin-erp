/**
 * Sesiones muertas: cuando Supabase Auth responde que el refresh token ya no
 * existe, la sesión no se puede recuperar. No es un fallo de red ni algo que
 * un reintento vaya a arreglar.
 *
 * Por qué importa distinguirlo: `AuthGuard` trata cualquier error de inicio
 * como "no sabemos si hay sesión" y muestra una pantalla de error con
 * reintento, para no expulsar a un usuario autenticado si la base está caída.
 * Pero con un token muerto ese trato era un bucle sin salida:
 *
 *   1. El token muerto seguía guardado en localStorage y en las cookies.
 *   2. "Inicia sesión de nuevo" mandaba a /auth/login SIN borrarlo.
 *   3. El middleware decide `isAuthenticated` por la PRESENCIA de la cookie,
 *      así que veía sesión y devolvía al usuario a /app/inicio.
 *   4. Vuelta al paso 1, con el error crudo de Supabase en pantalla.
 *
 * La salida es borrar la sesión local (localStorage + cookies) en cuanto se
 * detecta el token muerto: sin cookie, el middleware deja pasar al login.
 */

import { supabase } from '@/lib/supabase/config';
import { clearSessionCache } from '@/lib/supabase/auth-manager';

/** Códigos de GoTrue que significan que la sesión no se puede recuperar. */
const CODIGOS_SESION_MUERTA = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'user_not_found',
  'invalid_grant',
]);

/** Respaldo por texto para clientes/versiones que no traen `code`. */
const TEXTOS_SESION_MUERTA = [
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'Session not found',
  'User from sub claim in JWT does not exist',
];

/** `true` si el error indica una sesión irrecuperable. */
export function esSesionMuerta(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && CODIGOS_SESION_MUERTA.has(e.code)) return true;
  const msg = typeof e.message === 'string' ? e.message : typeof error === 'string' ? error : '';
  return TEXTOS_SESION_MUERTA.some((t) => msg.includes(t));
}

/**
 * Borra la sesión del navegador (localStorage + cookies, vía el storage
 * personalizado de `config.ts`) y la caché en memoria. `scope: 'local'` no
 * llama al servidor: revocar un token que ya no existe fallaría igual.
 */
export async function limpiarSesionMuerta(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Si signOut falla, el storage puede haber quedado a medias; la caché se
    // limpia igual y el siguiente paso es el login, que reescribe todo.
  }
  await clearSessionCache();
}

/** Texto para el usuario: nunca el mensaje crudo de Supabase. */
export const MENSAJE_SESION_EXPIRADA =
  'Tu sesión expiró o se cerró desde otro dispositivo. Inicia sesión de nuevo para continuar.';
