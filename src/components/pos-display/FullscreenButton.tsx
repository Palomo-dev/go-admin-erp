'use client';

/**
 * Botón discreto de pantalla completa (PLAN §10). Se oculta en Electron
 * (`window.electronAPI`, donde la ventana kiosco ya lo resuelve), cuando el
 * documento ya está a pantalla completa y cuando el navegador no lo soporta.
 */

import { useCallback, useEffect, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;
}

export function FullscreenButton() {
  const t = useTranslations('posDisplay');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isElectron() || typeof document === 'undefined' || !document.documentElement.requestFullscreen) return;
    const sync = () => setVisible(!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const enter = useCallback(() => {
    document.documentElement.requestFullscreen().catch((error: unknown) => {
      console.warn('[pos-display] no se pudo entrar en pantalla completa', error);
    });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={enter}
      aria-label={t('fullscreen')}
      title={t('fullscreen')}
      className="fixed bottom-4 right-4 z-20 rounded-full border border-neutral-200 bg-white/80 p-3 text-neutral-500 opacity-40 shadow-sm backdrop-blur transition-opacity duration-200 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
    >
      <Maximize2 className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
