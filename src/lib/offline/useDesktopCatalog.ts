'use client';

/**
 * Estado del catálogo local del POS para la UI del Desktop (fase 4A).
 *
 * `useDesktopCatalog(organizationId)`:
 *  - Fuera del Desktop devuelve `isDesktop: false` y no hace nada (ni abre
 *    IndexedDB ni escucha eventos): la web no cambia.
 *  - En Desktop arranca la replicación al montar (POS e inicio) y cada 10
 *    minutos con red (`startCatalogReplication`), sigue el estado de
 *    conexión y expone `replicateNow()` para el botón «Actualizar catálogo».
 */

import { useCallback, useEffect, useState } from 'react';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { getCatalogStatus, type CatalogStatus } from './catalogStore';
import { CATALOG_REPLICATED_EVENT, isCatalogReplicating, replicateCatalog, startCatalogReplication } from './catalogReplicator';

export interface DesktopCatalogState {
  isDesktop: boolean;
  isOnline: boolean;
  status: CatalogStatus | null;
  replicating: boolean;
  error: string | null;
  replicateNow: () => Promise<void>;
}

export function useDesktopCatalog(organizationId: number | null | undefined): DesktopCatalogState {
  const [desktop, setDesktop] = useState(false);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [replicating, setReplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      setStatus(await getCatalogStatus(organizationId));
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
      const detail = (e as CustomEvent<CatalogStatus>).detail;
      if (detail?.organization_id === organizationId) setStatus(detail);
      else refresh();
      setReplicating(false);
      setError(null);
    };
    window.addEventListener('goadmin:online', onOnline);
    window.addEventListener('goadmin:offline', onOffline);
    window.addEventListener(CATALOG_REPLICATED_EVENT, onReplicated);

    setReplicating(isCatalogReplicating());
    const stop = startCatalogReplication(organizationId);

    return () => {
      window.removeEventListener('goadmin:online', onOnline);
      window.removeEventListener('goadmin:offline', onOffline);
      window.removeEventListener(CATALOG_REPLICATED_EVENT, onReplicated);
      stop();
    };
  }, [organizationId, refresh]);

  const replicateNow = useCallback(async () => {
    if (!organizationId || !isDesktop()) return;
    if (!isAppOnline()) {
      setError('Sin conexión: el catálogo se actualizará al volver la red');
      return;
    }
    setReplicating(true);
    setError(null);
    try {
      setStatus(await replicateCatalog({ organizationId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el catálogo');
    } finally {
      setReplicating(false);
    }
  }, [organizationId]);

  return { isDesktop: desktop, isOnline: online, status, replicating, error, replicateNow };
}
