'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { isMobile, getMobilePlugin, safeAddListener } from '@/lib/utils/mobile';
import { desktopReportsConnectivity, isDesktop, isDesktopOnline, onDesktopConnectivity } from '@/lib/utils/desktop';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';

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
  // Fase 4B: ventas del POS guardadas en el outbox (Desktop) que aún no
  // llegaron a Supabase, y las que fallaron 5 veces y esperan revisión.
  const [pendingSales, setPendingSales] = useState(0);
  const [salesNeedingReview, setSalesNeedingReview] = useState(0);
  const { formatTime, formatDateTime, getToday, toDate } = useFormatDate();
  // Fase 4A: catálogo local del POS (solo Desktop; fuera devuelve isDesktop=false).
  const [catalogOrgId, setCatalogOrgId] = useState<number | null>(null);
  useEffect(() => {
    if (isDesktop()) setCatalogOrgId(getOrganizationId() || null);
  }, []);
  const catalog = useDesktopCatalog(catalogOrgId);

  const refreshSalesOutbox = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const { countPendingSales, countSalesNeedingReview } = await import('@/lib/offline/salesOutbox');
      setPendingSales(await countPendingSales());
      setSalesNeedingReview(await countSalesNeedingReview());
    } catch {
      // Silenciar
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDesktop()) return;
    refreshSalesOutbox();
    const onOutboxChanged = () => refreshSalesOutbox();
    window.addEventListener('goadmin:sales-outbox-changed', onOutboxChanged);
    return () => window.removeEventListener('goadmin:sales-outbox-changed', onOutboxChanged);
  }, [refreshSalesOutbox]);

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

  if (!showBanner && queueCount === 0 && pendingSales === 0 && salesNeedingReview === 0) return null;

  // Solo la hora si la última sincronización fue hoy (en la zona de la
  // organización); fecha y hora si fue otro día.
  let lastSyncLabel: string | null = null;
  if (lastSyncAt) {
    const syncDate = new Date(lastSyncAt);
    lastSyncLabel = toDate(syncDate) === getToday() ? formatTime(syncDate) : formatDateTime(syncDate);
  }
  let catalogLabel: string | null = null;
  if (catalog.isDesktop && catalog.status && !catalog.status.isEmpty) {
    const at = catalog.status.replicatedAt ? new Date(catalog.status.replicatedAt) : null;
    const when = at ? (toDate(at) === getToday() ? formatTime(at) : formatDateTime(at)) : '—';
    catalogLabel = `catálogo local: ${catalog.status.productsCount} productos · actualizado ${when}`;
  } else if (catalog.isDesktop) {
    catalogLabel = 'catálogo local: sin replicar';
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
        {pendingSales > 0 && (
          <span className="ml-2 text-xs font-semibold">
            — {pendingSales} venta{pendingSales !== 1 ? 's' : ''} pendiente{pendingSales !== 1 ? 's' : ''} de sincronizar
          </span>
        )}
        {salesNeedingReview > 0 && (
          <span className="ml-2 text-xs font-semibold text-red-900">
            — {salesNeedingReview} venta{salesNeedingReview !== 1 ? 's' : ''} requiere{salesNeedingReview !== 1 ? 'n' : ''} revisión (detalle en el POS)
          </span>
        )}
      </span>
      <span className="text-xs text-gray-800/90">
        {lastSyncLabel
          ? `Última sincronización correcta: ${lastSyncLabel}`
          : 'Sin sincronización registrada en este equipo'}
      </span>
      {catalogLabel && <span className="text-xs text-gray-800/90">· {catalogLabel}</span>}
      {catalog.isDesktop && isOnline && (
        <button
          type="button"
          onClick={() => catalog.replicateNow()}
          disabled={catalog.replicating}
          className="ml-1 inline-flex items-center gap-1 px-3 py-1 bg-gray-900 text-white rounded-md text-xs hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <RefreshCw className={`h-3 w-3 ${catalog.replicating ? 'animate-spin' : ''}`} aria-hidden="true" />
          {catalog.replicating ? 'Actualizando catálogo...' : 'Actualizar catálogo ahora'}
        </button>
      )}
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
