'use client';

import { useEffect, useState } from 'react';
import { DatabaseZap, RefreshCw } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';
import { cn } from '@/utils/Utils';

/**
 * Aviso discreto del catálogo local del POS (Go Admin Desktop, fase 4A).
 *
 * - Sin red y con catálogo: «Catálogo local del <fecha/hora>» en la zona
 *   horaria de la organización (`useFormatDate`).
 * - Sin red y sin catálogo: el aviso de que hay que conectar una vez.
 * - Con red: una línea mínima con el conteo y el botón «Actualizar ahora».
 *
 * Fuera del Desktop no renderiza nada: la web no cambia. Además de aquí
 * arranca la replicación al entrar al POS (el hook la programa).
 */
export function LocalCatalogNotice({ className }: { className?: string }) {
  const [orgId, setOrgId] = useState<number | null>(null);
  useEffect(() => {
    setOrgId(getOrganizationId() || null);
  }, []);
  const { isDesktop, isOnline, status, replicating, error, replicateNow } = useDesktopCatalog(orgId);
  const { formatTime, formatDateTime, getToday, toDate } = useFormatDate();

  if (!isDesktop || !orgId) return null;

  let replicatedLabel: string | null = null;
  if (status?.replicatedAt) {
    const at = new Date(status.replicatedAt);
    replicatedLabel = toDate(at) === getToday() ? formatTime(at) : formatDateTime(at);
  }

  const base = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs rounded-md px-2 py-1';

  if (!isOnline) {
    if (!status || status.isEmpty) {
      return (
        <div role="status" className={cn(base, 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300', className)}>
          <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Sin conexión y sin catálogo local: conecta a internet una vez para replicarlo.</span>
        </div>
      );
    }
    return (
      <div role="status" className={cn(base, 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200', className)}>
        <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Catálogo local del {replicatedLabel ?? '—'} · {status.productsCount} productos · {status.customersCount} clientes
        </span>
      </div>
    );
  }

  return (
    <div role="status" className={cn(base, 'text-gray-500 dark:text-gray-400', className)}>
      <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {status && !status.isEmpty
          ? `Catálogo local: ${status.productsCount} productos · actualizado ${replicatedLabel ?? '—'}`
          : 'Catálogo local sin replicar'}
      </span>
      <button
        type="button"
        onClick={() => replicateNow()}
        disabled={replicating}
        className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <RefreshCw className={cn('h-3 w-3', replicating && 'animate-spin')} aria-hidden="true" />
        {replicating ? 'Actualizando…' : 'Actualizar catálogo ahora'}
      </button>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
