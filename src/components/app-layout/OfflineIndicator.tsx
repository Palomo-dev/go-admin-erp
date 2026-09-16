'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { isMobile, getMobilePlugin, safeAddListener } from '@/lib/utils/mobile';
import { desktopReportsConnectivity, isDesktop, isDesktopOnline, onDesktopConnectivity } from '@/lib/utils/desktop';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

/**
 * Indicador de estado offline/online. Es la ÚNICA fuente del banner offline
 * (el antiguo banner inyectado desde Electron, `offlineManager.ts`, se retiró
 * en la fase 0 del Desktop).
 *
 * Fuente de verdad de la conexión:
 *  - Go Admin Desktop: `window.goAdminDesktop.isOnline()` para el estado
 *    inicial y `onConnectivity()` (canal `connectivity:state`, health-check
 *    con histéresis contra Supabase). NO usa `navigator.onLine`, que devuelve
 *    true con WiFi enlazado y router sin internet. La suscripción pasa por
 *    `onDesktopConnectivity` porque el preload admite un único listener y
 *    `offlineCache.ts` también escucha.
 *  - Móvil (Capacitor): plugin Network.
 *  - Desktop antiguo sin bridge de conectividad: eventos `online`/`offline`.
 *
 * Muestra además la hora de la última sincronización correcta (última
 * respuesta fresca del servidor o último envío de la cola offline), en la
 * zona horaria de la organización.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const { formatTime, formatDateTime, getToday, toDate } = useFormatDate();

  const refreshLastSync = useCallback(async () => {
    try {
      const { getLastSyncAt } = await import('@/lib/utils/offlineCache');
      setLastSyncAt(getLastSyncAt());
    } catch {
      // Silenciar
    }
  }, []);

  useEffect(() => {
    // Solo activar en desktop app o móvil nativo
    if (typeof window === 'undefined') return;
    const isDesktopApp = isDesktop();
    const isMobileApp = isMobile();
    if (!isDesktopApp && !isMobileApp) return;

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
      refreshLastSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      refreshLastSync();
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
      refreshLastSync();
    };

    const handleLastSync = (e: Event) => {
      const at = (e as CustomEvent).detail?.at;
      if (typeof at === 'number') setLastSyncAt(at);
    };

    checkQueue();
    refreshLastSync();

    const cleanups: Array<() => void> = [];

    if (isDesktopApp && desktopReportsConnectivity()) {
      // Desktop con conectividad real: estado inicial por isOnline() y
      // cambios por connectivity:state. Nada de navigator.onLine.
      isDesktopOnline()
        .then((online) => (online ? handleOnline() : handleOffline()))
        .catch(() => { /* se conserva "en línea" hasta el primer evento */ });
      cleanups.push(onDesktopConnectivity((online) => (online ? handleOnline() : handleOffline())));
    } else if (isMobileApp) {
      // En móvil, usar Network plugin de Capacitor para detección precisa
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) setShowBanner(true);
      const network = getMobilePlugin('Network');
      if (network?.getStatus) {
        network.getStatus().then((status) => {
          setIsOnline(status.connected);
          if (!status.connected) setShowBanner(true);
        }).catch(() => { /* silencioso */ });
        safeAddListener(network, 'networkStatusChange', (status: unknown) => {
          const { connected } = status as { connected: boolean };
          if (connected) {
            handleOnline();
          } else {
            handleOffline();
          }
        });
      }
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      cleanups.push(() => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      });
    } else {
      // Desktop antiguo sin bridge de conectividad: respaldo con navigator.
      setIsOnline(navigator.onLine);
      if (!navigator.onLine) setShowBanner(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      cleanups.push(() => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      });
    }

    window.addEventListener('goadmin:action-queued', handleActionQueued);
    window.addEventListener('goadmin:offline-synced', handleSynced);
    window.addEventListener('goadmin:last-sync', handleLastSync);

    return () => {
      window.removeEventListener('goadmin:action-queued', handleActionQueued);
      window.removeEventListener('goadmin:offline-synced', handleSynced);
      window.removeEventListener('goadmin:last-sync', handleLastSync);
      for (const cleanup of cleanups) cleanup();
    };
  }, [refreshLastSync]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { syncQueue } = await import('@/lib/utils/offlineCache');
      await syncQueue();
    } catch {
      // Silenciar
    }
    setIsSyncing(false);
    refreshLastSync();
  };

  if (!showBanner && queueCount === 0) return null;

  // Solo la hora si la última sincronización fue hoy (en la zona de la
  // organización); fecha y hora si fue otro día.
  let lastSyncLabel: string | null = null;
  if (lastSyncAt) {
    const syncDate = new Date(lastSyncAt);
    lastSyncLabel = toDate(syncDate) === getToday() ? formatTime(syncDate) : formatDateTime(syncDate);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-gray-900 px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium shadow-md"
    >
      <CloudOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        {isOnline ? 'Conexión restablecida' : 'Sin conexión con el servidor — Modo offline'}
        {queueCount > 0 && (
          <span className="ml-2 text-xs">
            ({queueCount} acción{queueCount !== 1 ? 'es' : ''} pendiente{queueCount !== 1 ? 's' : ''})
          </span>
        )}
      </span>
      <span className="text-xs text-gray-800/90">
        {lastSyncLabel
          ? `Última sincronización correcta: ${lastSyncLabel}`
          : 'Sin sincronización registrada en este equipo'}
      </span>
      {isOnline && queueCount > 0 && (
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="ml-1 inline-flex items-center gap-1 px-3 py-1 bg-gray-900 text-white rounded-md text-xs hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </div>
  );
}
