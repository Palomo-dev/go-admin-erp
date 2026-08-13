/**
 * Utilidades para detectar la plataforma de ejecución de Go Admin ERP.
 *
 * Unifica la detección de los tres entornos soportados:
 * - web (navegador, servido por Vercel)
 * - desktop (Electron, window.goAdminDesktop)
 * - mobile (Capacitor, window.Capacitor)
 *
 * Seguro en SSR: todas las funciones devuelven valores conservadores en el servidor.
 */

import { isDesktop, getDesktopBridge } from './desktop';
import { isMobile, isIOS, isAndroid, getMobileBridge } from './mobile';

// Re-exportar funciones de desktop y mobile para import centralizado.
export {
  isDesktop,
  getDesktopBridge,
  isMobile,
  isIOS,
  isAndroid,
  getMobileBridge,
};

/** Plataforma de ejecución detectada. */
export type Platform = 'web' | 'desktop' | 'mobile-ios' | 'mobile-android';

/**
 * Detecta la plataforma actual.
 * En SSR devuelve 'web' (valor conservador).
 */
export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';

  if (isDesktop()) return 'desktop';
  if (isIOS()) return 'mobile-ios';
  if (isAndroid()) return 'mobile-android';

  return 'web';
}

/** true si corre en navegador web (no desktop, no mobile). */
export function isWeb(): boolean {
  return getPlatform() === 'web';
}

/**
 * true si corre en cualquier app nativa (desktop o mobile).
 * Útil para mostrar UI condicional (offline indicator, panel impresión, etc.).
 */
export function isNativeApp(): boolean {
  const p = getPlatform();
  return p === 'desktop' || p === 'mobile-ios' || p === 'mobile-android';
}

/**
 * Etiqueta legible para mostrar en la UI (ej. "Desktop", "iOS", "Android", "Web").
 */
export function getPlatformLabel(): string {
  const p = getPlatform();
  switch (p) {
    case 'desktop':
      return 'Desktop';
    case 'mobile-ios':
      return 'iOS';
    case 'mobile-android':
      return 'Android';
    default:
      return 'Web';
  }
}
