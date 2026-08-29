'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker para habilitar PWA (instalable + offline).
 * Solo se registra en producción para no interferir con el dev server.
 *
 * En iOS standalone, intercepta enlaces con target="_blank" del mismo origen
 * para que se abran dentro del PWA en vez de lanzar Safari externo.
 */
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // eslint-disable-next-line no-console
          console.log('[PWA] Service Worker registrado:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Error registrando Service Worker:', err);
        });
    };

    // Registrar después de que la página cargue para no bloquear el primer render
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  // iOS standalone: interceptar enlaces target="_blank" del mismo origen
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Solo aplicar si estamos en modo standalone (PWA instalada)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari no soporta display-mode, usa navigator.standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;

    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest('a');
      if (!link) return;

      const href = link.href;
      if (!href) return;

      // Solo interceptar enlaces del mismo origen
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }

      // Interceptar target="_blank" Y enlaces que causarían full-page reload
      // en iOS standalone (que rompen el modo pantalla completa)
      if (link.target === '_blank' || link.target === '_top') {
        e.preventDefault();
        e.stopPropagation();
        // Usar router de Next.js si está disponible, sino location.assign
        window.location.assign(href);
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  return null;
}
