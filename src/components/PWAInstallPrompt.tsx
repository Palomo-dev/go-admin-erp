'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * Detecta si el dispositivo es iOS (iPhone/iPad) y NO está en modo standalone.
 * iOS no dispara beforeinstallprompt; el usuario debe usar "Agregar a pantalla
 * de inicio" manualmente desde Safari.
 */
function useIOSInstallNeeded() {
  const [needsIOSInstall, setNeedsIOSInstall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setNeedsIOSInstall(isIOS && !isStandalone);
  }, []);

  return needsIOSInstall;
}

/**
 * Banner de instalación PWA personalizado.
 * - En Android/Chrome: usa beforeinstallprompt para instalación nativa.
 * - En iOS/Safari: muestra instrucciones manuales ("Agregar a pantalla de inicio").
 * Se puede cerrar y no vuelve a aparecer por 7 días.
 */
export function PWAInstallPrompt() {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const needsIOSInstall = useIOSInstallNeeded();
  const [dismissed, setDismissed] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION) {
        setDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result === 'accepted') {
      setDismissed(true);
    }
  };

  // No mostrar si ya está instalada o fue cerrada
  if (isInstalled || dismissed) return null;

  // Caso iOS: mostrar instrucciones manuales
  if (needsIOSInstall && !canInstall) {
    return (
      <>
        {/* Banner inicial */}
        {!showIOSSteps && (
          <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Instalar GoAdmin ERP
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Toca para ver cómo instalar en iOS
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowIOSSteps(true)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  Ver pasos
                </button>
                <button
                  onClick={handleDismiss}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label="Cerrar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal con instrucciones detalladas */}
        {showIOSSteps && (
          <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowIOSSteps(false)}>
            <div className="max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                Instalar en iPhone/iPad
              </h3>
              <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">1</span>
                  <span>Abre <strong>Safari</strong> (no Chrome) y ve a <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">app.goadmin.io</code> (página principal, no una sección interna).</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">2</span>
                  <span>Toca el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba, abajo a la derecha).</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">3</span>
                  <span>Desplázate y selecciona <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">4</span>
                  <span>Toca <strong>Agregar</strong>. Abre la app desde el icono de la pantalla de inicio (no desde Safari).</span>
                </li>
              </ol>
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <strong>Importante:</strong> Instala desde la página principal (<code>/</code>), no desde una sección interna como <code>/app/inicio</code>. iOS usa la URL donde instalas como &ldquo;raíz&rdquo; de la app; si instalas desde una sección interna, iOS puede mostrar barras de Safari al navegar a otras secciones.
              </div>
              <button
                onClick={() => setShowIOSSteps(false)}
                className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Caso Android/Chrome: instalación nativa con beforeinstallprompt
  if (!canInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {/* Icono */}
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Instalar GoAdmin ERP
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Acceso rápido desde tu pantalla de inicio
          </p>
        </div>

        {/* Botones */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Cerrar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
