'use client';

import { useEffect, useState } from 'react';
import { CloudOff, CloudCheck, Sync } from 'lucide-react';

/**
 * Indicador de estado offline/online para el app de escritorio.
 * Se renderiza solo cuando se detecta el bridge de Electron.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Solo activar en desktop app
    if (typeof window === 'undefined' || !('goAdminDesktop' in window)) return;

    const checkQueue = async () => {
      try {
        const { getQueueCount } = await import('@/lib/utils/offlineCache');
        const count = await getQueueCount();
        setQueueCount(count);
      } catch {
        // Silenciar
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(false);
      checkQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    const handleActionQueued = () => {
      checkQueue();
    };

    const handleSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsSyncing(false);
      if (detail?.synced > 0) {
        setQueueCount(0);
      }
      checkQueue();
    };

    // Estado inicial
    setIsOnline(navigator.onLine);
    if (!navigator.onLine) setShowBanner(true);
    checkQueue();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('goadmin:action-queued', handleActionQueued);
    window.addEventListener('goadmin:offline-synced', handleSynced);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('goadmin:action-queued', handleActionQueued);
      window.removeEventListener('goadmin:offline-synced', handleSynced);
    };
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { syncQueue } = await import('@/lib/utils/offlineCache');
      await syncQueue();
    } catch {
      // Silenciar
    }
    setIsSyncing(false);
  };

  if (!showBanner && queueCount === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-gray-900 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md">
      <CloudOff className="h-4 w-4 flex-shrink-0" />
      <span>
        Sin conexión a internet — Modo offline
        {queueCount > 0 && (
          <span className="ml-2 text-xs">
            ({queueCount} acción{queueCount !== 1 ? 'es' : ''} pendiente{queueCount !== 1 ? 's' : ''})
          </span>
        )}
      </span>
      {isOnline && queueCount > 0 && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="ml-3 inline-flex items-center gap-1 px-3 py-1 bg-gray-900 text-white rounded-md text-xs hover:bg-gray-800 disabled:opacity-50"
        >
          <Sync className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </div>
  );
}
