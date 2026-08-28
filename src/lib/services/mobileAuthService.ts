/**
 * Servicio de autenticación móvil para Go Admin Mobile (Capacitor).
 *
 * Maneja OAuth con deep links en la app móvil:
 * - Google/Microsoft OAuth via browser externo + custom URL scheme `goadmin://`
 * - Listener de `App.addListener('appUrlOpen')` para capturar deep links
 * - `supabase.auth.setSession()` con tokens extraídos del deep link
 *
 * En web/desktop estas funciones no se invocan (degradan con elegancia).
 * No importa paquetes @capacitor/* — usa detección runtime via getMobilePlugin().
 */

import { supabase } from '@/lib/supabase/config';
import {
  isMobile,
  getMobilePlugin,
} from '@/lib/utils/mobile';
import {
  MOBILE_DEEP_LINK_SCHEME,
  NATIVE_CALLBACK_URL,
} from '@/lib/constants/auth';

// Re-export para compatibilidad con código que importa de aquí
export { MOBILE_DEEP_LINK_SCHEME, NATIVE_CALLBACK_URL };

// ============================================================================
// Tipos
// ============================================================================

/** Resultado de procesar un deep link de OAuth. */
export interface MobileAuthResult {
  success: boolean;
  error?: string;
  next?: string;
}

/** Callback para recibir el resultado del deep link. */
export type MobileAuthCallback = (result: MobileAuthResult) => void;

// ============================================================================
// OAuth con deep links
// ============================================================================

/**
 * Inicia flujo OAuth en móvil abriendo el browser externo.
 *
 * Flujo:
 * 1. Llama `supabase.auth.signInWithOAuth()` con `skipBrowserRedirect: true`
 * 2. Obtiene la URL de OAuth de Supabase
 * 3. Abre el browser externo con `Browser.open()` (no el WebView)
 * 4. El usuario se autentica en Google/Microsoft
 * 5. Supabase redirige a `/api/auth/native-callback` que hace 302 a `goadmin://auth-callback`
 * 6. El SO abre la app via deep link
 * 7. El listener `appUrlOpen` captura la URL y procesa los tokens
 *
 * @param provider - 'google' | 'azure' (Microsoft)
 * @returns URL de OAuth si se generó, o null si no aplica móvil
 */
export async function startMobileOAuth(
  provider: 'google' | 'azure',
): Promise<string | null> {
  if (!isMobile()) return null;

  const browser = getMobilePlugin('Browser');
  if (!browser?.open) {
    console.warn('[mobileAuth] Plugin Browser no disponible');
    return null;
  }

  try {
    // Generar URL de OAuth sin abrir browser automáticamente
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_CALLBACK_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('[mobileAuth] Error signInWithOAuth:', error.message);
      return null;
    }

    if (!data?.url) {
      console.error('[mobileAuth] No se obtuvo URL de OAuth');
      return null;
    }

    // Abrir browser externo (Safari/Chrome) con la URL de OAuth
    await browser.open({ url: data.url, windowName: '_system' });

    return data.url;
  } catch (err) {
    console.error('[mobileAuth] Error startMobileOAuth:', err);
    return null;
  }
}

// ============================================================================
// Listener de deep links
// ============================================================================

/**
 * Registra un listener para capturar deep links de OAuth (`goadmin://auth-callback`).
 *
 * Debe llamarse en un useEffect del componente de login (o layout) cuando
 * `isMobile()` es true. El listener procesa la URL y llama `setSession()`.
 *
 * @param callback - Función a ejecutar cuando se procesa el deep link
 * @returns Función de cleanup para remover el listener (o null si no aplica)
 */
export async function registerMobileAuthListener(
  callback: MobileAuthCallback,
): Promise<(() => void) | null> {
  if (!isMobile()) return null;

  const app = getMobilePlugin('App');
  if (!app?.addListener) {
    console.warn('[mobileAuth] Plugin App no disponible');
    return null;
  }

  const handleUrlOpen = async (payload: unknown) => {
    const { url } = payload as { url: string };
    const result = await processMobileAuthUrl(url);
    callback(result);
  };

  try {
    await app.addListener('appUrlOpen', handleUrlOpen);

    // Cleanup: Capacitor no expone removeListener individual fácilmente,
    // pero removeAllListeners limpia todo al desmontar.
    return () => {
      const appWithCleanup = app as unknown as { removeAllListeners?: () => Promise<void> };
      appWithCleanup.removeAllListeners?.().catch(() => { /* silencioso */ });
    };
  } catch (err) {
    console.error('[mobileAuth] Error registerMobileAuthListener:', err);
    return null;
  }
}

// ============================================================================
// Procesamiento de URL de deep link
// ============================================================================

/**
 * Procesa una URL de deep link `goadmin://auth-callback?...` y establece la sesión.
 *
 * Acepta dos formatos:
 * - `?code=...&next=...` (PKCE flow — requiere exchangeCodeForSession)
 * - `?access_token=...&refresh_token=...` (token flow directo)
 * - `?error=...` (error de OAuth)
 */
export async function processMobileAuthUrl(url: string): Promise<MobileAuthResult> {
  try {
    // Validar formato y protocolo del deep link antes de procesar
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return { success: false, error: 'Formato de deep link inválido' };
    }
    if (urlObj.protocol !== 'goadmin:') {
      return { success: false, error: 'Protocolo de deep link no autorizado' };
    }
    const params = urlObj.searchParams;

    // Caso error
    const error = params.get('error');
    if (error) {
      return {
        success: false,
        error: params.get('error_description') || error,
      };
    }

    // Caso PKCE: code flow
    const code = params.get('code');
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return { success: false, error: exchangeError.message };
      }
      if (!data.session) {
        return { success: false, error: 'No se obtuvo sesión tras exchange' };
      }
      return {
        success: true,
        next: params.get('next') || '/app/inicio',
      };
    }

    // Caso token flow directo
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        return { success: false, error: sessionError.message };
      }
      if (!data.session) {
        return { success: false, error: 'No se estableció sesión' };
      }
      return { success: true, next: '/app/inicio' };
    }

    return { success: false, error: 'URL de deep link sin parámetros reconocidos' };
  } catch (err) {
    console.error('[mobileAuth] Error processMobileAuthUrl:', err);
    return { success: false, error: 'Error procesando URL de autenticación' };
  }
}

// ============================================================================
// Storage de sesión con Preferences (reemplazo de localStorage en móvil)
// ============================================================================

/**
 * Lee un valor del storage nativo (Preferences) en móvil.
 * En web/desktop retorna null (usar localStorage/cookies normales).
 */
export async function getMobileStorage(key: string): Promise<string | null> {
  if (!isMobile()) return null;
  const preferences = getMobilePlugin('Preferences');
  if (!preferences?.get) return null;
  try {
    const { value } = await preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}

/**
 * Escribe un valor en el storage nativo (Preferences) en móvil.
 * En web/desktop no hace nada (usar localStorage/cookies normales).
 */
export async function setMobileStorage(key: string, value: string): Promise<void> {
  if (!isMobile()) return;
  const preferences = getMobilePlugin('Preferences');
  if (!preferences?.set) return;
  try {
    await preferences.set({ key, value });
  } catch {
    /* silencioso */
  }
}

/**
 * Elimina un valor del storage nativo (Preferences) en móvil.
 */
export async function removeMobileStorage(key: string): Promise<void> {
  if (!isMobile()) return;
  const preferences = getMobilePlugin('Preferences');
  if (!preferences?.remove) return;
  try {
    await preferences.remove({ key });
  } catch {
    /* silencioso */
  }
}
