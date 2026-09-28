'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('posVenta.catalogoLocal');
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
        <div role="status" className={cn(base, 'bg-danger-subtle text-danger-text', className)}>
          <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t('sinRedSinCatalogo')}</span>
        </div>
      );
    }
    return (
      <div role="status" className={cn(base, 'bg-warning-subtle text-warning-text', className)}>
        <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t('sinRed', { fecha: replicatedLabel ?? '—', productos: status.productsCount, clientes: status.customersCount })}</span>
      </div>
    );
  }

  return (
    <div role="status" className={cn(base, 'text-fg-secondary', className)}>
      <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {status && !status.isEmpty
          ? t('conRed', { productos: status.productsCount, fecha: replicatedLabel ?? '—' })
          : t('sinReplicar')}
      </span>
      <button
        type="button"
        onClick={() => replicateNow()}
        disabled={replicating}
        className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-fg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <RefreshCw className={cn('h-3 w-3', replicating && 'animate-spin')} aria-hidden="true" />
        {replicating ? t('actualizando') : t('actualizar')}
      </button>
      {error && <span className="text-danger-text">{error}</span>}
    </div>
  );
}
