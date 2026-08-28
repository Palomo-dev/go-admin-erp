/**
 * Wrapper para almacenamiento persistente en móvil.
 *
 * En móvil: usa @capacitor/preferences vía el bridge de Capacitor
 *   (UserDefaults en iOS / SharedPreferences en Android)
 * En web/desktop: usa localStorage como fallback
 *
 * IMPORTANTE: Solo para preferencias que pueden cargarse async.
 * NO usar para auth tokens (Supabase necesita síncrono).
 */

import { isMobile, getMobileBridge, MobilePreferencesPlugin } from '@/lib/utils/mobile';

/**
 * Devuelve el plugin de Preferences si está disponible en móvil, o null.
 */
function getPreferencesPlugin(): MobilePreferencesPlugin | null {
  if (!isMobile()) return null;
  const bridge = getMobileBridge();
  return bridge?.Plugins?.Preferences ?? null;
}

export async function getMobileStorage(key: string): Promise<string | null> {
  const prefs = getPreferencesPlugin();
  if (prefs) {
    const { value } = await prefs.get({ key });
    return value;
  }
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
}

export async function setMobileStorage(key: string, value: string): Promise<void> {
  const prefs = getPreferencesPlugin();
  if (prefs) {
    await prefs.set({ key, value });
    return;
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

export async function removeMobileStorage(key: string): Promise<void> {
  const prefs = getPreferencesPlugin();
  if (prefs) {
    await prefs.remove({ key });
    return;
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
}
