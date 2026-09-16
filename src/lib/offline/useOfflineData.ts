'use client';

/**
 * Estado de la réplica local genérica (fase 4C) para la UI del Desktop.
 *
 * `useOfflineData(organizationId)`:
 *  - Fuera del Desktop devuelve `isDesktop: false` y no hace nada (ni abre
 *    IndexedDB ni escucha eventos): la web no cambia.
 *  - En Desktop se suscribe al planificador único (`startOfflineReplication`),
 *    sigue el estado de conexión y de replicación, y expone `syncNow()`
 *    («Sincronizar ahora»: catálogo del POS + réplica genérica).
 */

import { useCallback, useEffect, useState } from 'react';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { getOfflineDbStatus, type OfflineDbStatus } from './offlineDb';
import { OFFLINE_REPLICATED_EVENT, isOfflineReplicating, replicateAllOffline, startOfflineReplication } from './offlineReplicator';
import { CATALOG_REPLICATED_EVENT } from './catalogReplicator';

export interface OfflineDataState {
  isDesktop: boolean;
  isOnline: boolean;
  status: OfflineDbStatus | null;
  replicating: boolean;
  error: string | null;
  syncNow: (opts?: { full?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOfflineData(organizationId: number | null | undefined): OfflineDataState {
  const [desktop, setDesktop] = useState(false);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<OfflineDbStatus | null>(null);
  const [replicating, setReplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      setStatus(await getOfflineDbStatus(organizationId));
    } catch {
      // Sin IndexedDB: el estado se queda en null.
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isDesktop() || !organizationId) return;
    setDesktop(true);
    setOnline(isAppOnline());
    refresh();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onReplicated = (e: Event) => {
      const detail = (e as CustomEvent<OfflineDbStatus>).detail;
      if (detail?.organization_id === organizationId && 'tables' in detail) setStatus(detail);
      else refresh();
      setReplicating(isOfflineReplicating());
    };
    // El catálogo del POS termina antes que la réplica genérica: mientras
    // tanto seguimos «replicando».
    const onCatalog = () => setReplicating(isOfflineReplicating());
    window.addEventListener('goadmin:online', onOnline);
    window.addEventListener('goadmin:offline', onOffline);
    window.addEventListener(OFFLINE_REPLICATED_EVENT, onReplicated);
    window.addEventListener(CATALOG_REPLICATED_EVENT, onCatalog);

    setReplicating(isOfflineReplicating());
    const stop = startOfflineReplication(organizationId);

    return () => {
      window.removeEventListener('goadmin:online', onOnline);
      window.removeEventListener('goadmin:offline', onOffline);
      window.removeEventListener(OFFLINE_REPLICATED_EVENT, onReplicated);
      window.removeEventListener(CATALOG_REPLICATED_EVENT, onCatalog);
      stop();
    };
  }, [organizationId, refresh]);

  const syncNow = useCallback(
    async (opts?: { full?: boolean }) => {
      if (!organizationId || !isDesktop()) return;
      if (!isAppOnline()) {
        setError('Sin conexión: los datos se actualizarán al volver la red');
        return;
      }
      setReplicating(true);
      setError(null);
      try {
        setStatus(await replicateAllOffline({ organizationId, full: opts?.full }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron sincronizar los datos');
      } finally {
        setReplicating(false);
      }
    },
    [organizationId],
  );

  return { isDesktop: desktop, isOnline: online, status, replicating, error, syncNow, refresh };
}
