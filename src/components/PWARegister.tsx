'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker para habilitar PWA (instalable + offline).
 * Solo se registra en producción para no interferir con el dev server.
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

  return null;
}
