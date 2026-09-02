import { useEffect, useState } from 'react';

/**
 * Hook para detectar la plataforma de ejecución (FASE 15 - Cross-platform).
 *
 * Detecta: web, pwa, electron, capacitor, mobile-web.
 * Usa detección en cliente (useEffect) para evitar errores de SSR.
 */

export type Platform = 'web' | 'pwa' | 'electron' | 'capacitor' | 'mobile-web';

export function usePlatform() {
  const [platform, setPlatform] = useState<Platform>('web');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isElectron =
      !!(window as unknown as { electronAPI?: unknown }).electronAPI ||
      navigator.userAgent.includes('Electron');
    const isCapacitor = !!(window as unknown as { Capacitor?: unknown }).Capacitor;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isCapacitor) setPlatform('capacitor');
    else if (isElectron) setPlatform('electron');
    else if (isStandalone) setPlatform('pwa');
    else if (isMobile) setPlatform('mobile-web');
    else setPlatform('web');
  }, []);

  return platform;
}

/**
 * Hook de conveniencia: retorna true si la plataforma es móvil
 * (capacitor o mobile-web).
 */
export function useIsMobile() {
  const platform = usePlatform();
  return platform === 'capacitor' || platform === 'mobile-web';
}
