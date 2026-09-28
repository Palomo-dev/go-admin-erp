'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isMobile, getMobilePlugin, safeAddListener } from '@/lib/utils/mobile';
import { desktopReportsConnectivity, isDesktop, isDesktopOnline, onDesktopConnectivity } from '@/lib/utils/desktop';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';
import { useOfflineData } from '@/lib/offline/useOfflineData';
import { OUTBOX_CHANGED_EVENTS, totalOf, type OutboxCounts } from '@/lib/offline/outboxCounts';
import { toast } from 'sonner';

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
  const t = useTranslations('header.offline');
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Fases 4B/4D/4F: ventas, clientes y operaciones de caja del outbox
  // (Desktop) que aún no llegaron a Supabase, y las que fallaron 5 veces y
  // esperan revisión.
  const NO_COUNTS: OutboxCounts = { sales: 0, customers: 0, cash: 0 };
  const [pendingCounts, setPendingCounts] = useState<OutboxCounts>(NO_COUNTS);
  const [reviewCounts, setReviewCounts] = useState<OutboxCounts>(NO_COUNTS);
  const { formatTime, formatDateTime, getToday, toDate } = useFormatDate();
  // Fase 4A: catálogo local del POS (solo Desktop; fuera devuelve isDesktop=false).
  const [catalogOrgId, setCatalogOrgId] = useState<number | null>(null);
  useEffect(() => {
    if (isDesktop()) setCatalogOrgId(getOrganizationId() || null);
  }, []);
  const catalog = useDesktopCatalog(catalogOrgId);
  // Fase 4C: réplica local genérica (todos los módulos); misma cadencia que el catálogo.
  const replica = useOfflineData(catalogOrgId);

  const refreshSalesOutbox = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      const { getOutboxCounts } = await import('@/lib/offline/outboxCounts');
      const snapshot = await getOutboxCounts();
      setPendingCounts(snapshot.pending);
      setReviewCounts(snapshot.needsReview);
    } catch {
      // Silenciar
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDesktop()) return;
    refreshSalesOutbox();
    const onOutboxChanged = () => refreshSalesOutbox();
    for (const ev of OUTBOX_CHANGED_EVENTS) window.addEventListener(ev, onOutboxChanged);
    return () => {
      for (const ev of OUTBOX_CHANGED_EVENTS) window.removeEventListener(ev, onOutboxChanged);
    };
  }, [refreshSalesOutbox]);

  // Fase 4F: una escritura sin red que no tiene outbox propio recibe un 503
  // honesto; aquí se muestra como toast (una vez por tabla cada pocos segundos).
  useEffect(() => {
    if (typeof window === 'undefined' || !isDesktop()) return;
    const lastShown = new Map<string, number>();
    const onRejected = (e: Event) => {
      const detail = (e as CustomEvent).detail as { table?: string | null; code?: string; message?: string } | undefined;
      const key = detail?.table ?? '*';
      const now = Date.now();
      if ((lastShown.get(key) ?? 0) > now - 5_000) return;
      lastShown.set(key, now);
      // El mensaje del evento viene en español (offlineCache.ts); se muestra el
      // traducido según el código del rechazo.
      const titulo =
        detail?.code === 'OFFLINE_OUTBOX_TABLE' && detail.table
          ? t('writeRejectedOutboxTable', { table: detail.table })
          : t('writeRejected');
      toast.error(titulo, { description: t('writeRejectedDetail') });
    };
    window.addEventListener('goadmin:offline-write-rejected', onRejected);
    return () => window.removeEventListener('goadmin:offline-write-rejected', onRejected);
  }, [t]);

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

  // «2 ventas · 1 cliente · 3 movimientos de caja», con el plural de cada idioma.
  const describirConteos = (c: OutboxCounts): string =>
    [
      c.sales > 0 ? t('sales', { n: c.sales }) : null,
      c.customers > 0 ? t('customers', { n: c.customers }) : null,
      c.cash > 0 ? t('cashMovements', { n: c.cash }) : null,
    ]
      .filter((p): p is string => p !== null)
      .join(' · ');
  const totalPendiente = totalOf(pendingCounts);
  const totalRevision = totalOf(reviewCounts);
  const pendingText = totalPendiente > 0 ? t('pendingSync', { total: totalPendiente, items: describirConteos(pendingCounts) }) : null;
  const reviewText = totalRevision > 0 ? t('needsReview', { total: totalRevision, items: describirConteos(reviewCounts) }) : null;
  if (!showBanner && queueCount === 0 && totalPendiente === 0 && totalRevision === 0) return null;

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
    catalogLabel = t('catalogReplicated', { n: catalog.status.productsCount, when });
  } else if (catalog.isDesktop) {
    catalogLabel = t('catalogEmpty');
  }
  let replicaLabel: string | null = null;
  if (replica.isDesktop && replica.status && !replica.status.isEmpty) {
    const at = replica.status.replicatedAt ? new Date(replica.status.replicatedAt) : null;
    const when = at ? (toDate(at) === getToday() ? formatTime(at) : formatDateTime(at)) : '—';
    replicaLabel = t('replicaUpdated', { when });
  } else if (replica.isDesktop) {
    replicaLabel = t('replicaEmpty');
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-gray-900 px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium shadow-md"
    >
      <CloudOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        {isOnline ? t('connectionRestored') : t('offlineMode')}
        {queueCount > 0 && <span className="ml-2 text-xs">({t('queuedActions', { n: queueCount })})</span>}
        {pendingText && (
          <span className="ml-2 text-xs font-semibold" data-testid="offline-pending-counts">
            — {pendingText}
          </span>
        )}
        {reviewText && (
          <span className="ml-2 text-xs font-semibold text-red-900" data-testid="offline-review-counts">
            — {reviewText}
          </span>
        )}
      </span>
      <span className="text-xs text-gray-800/90">
        {lastSyncLabel ? t('lastSync', { when: lastSyncLabel }) : t('noSync')}
      </span>
      {catalogLabel && <span className="text-xs text-gray-800/90">· {catalogLabel}</span>}
      {replicaLabel && <span className="text-xs text-gray-800/90">· {replicaLabel}</span>}
      {catalog.isDesktop && isOnline && (
        <button
          type="button"
          onClick={() => catalog.replicateNow()}
          disabled={catalog.replicating || replica.replicating}
          className="ml-1 inline-flex items-center gap-1 px-3 py-1 bg-gray-900 text-white rounded-md text-xs hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <RefreshCw className={`h-3 w-3 ${catalog.replicating || replica.replicating ? 'animate-spin' : ''}`} aria-hidden="true" />
          {catalog.replicating || replica.replicating ? t('syncingData') : t('syncDataNow')}
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
          {isSyncing ? t('syncing') : t('sync')}
        </button>
      )}
    </div>
  );
}
