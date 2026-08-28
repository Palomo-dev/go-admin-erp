/**
 * Constantes compartidas de autenticación móvil.
 *
 * Usadas por:
 * - src/app/api/auth/native-callback/route.ts (bridge OAuth)
 * - src/lib/services/mobileAuthService.ts (procesamiento deep links)
 *
 * Centralizar evita que un cambio en un archivo rompa el otro.
 */

/** Custom URL scheme para deep links de la app móvil */
export const MOBILE_DEEP_LINK_SCHEME = 'goadmin://auth-callback';

/** URL del callback bridge en el servidor (recibe redirect de Supabase OAuth) */
export const NATIVE_CALLBACK_URL = 'https://app.goadmin.io/api/auth/native-callback';
