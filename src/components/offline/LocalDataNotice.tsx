'use client';

import { useEffect, useState } from 'react';
import { DatabaseZap } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOfflineData } from '@/lib/offline/useOfflineData';
import { cn } from '@/utils/Utils';

/**
 * Aviso reutilizable «Estás viendo datos locales del hh:mm» (Go Admin
 * Desktop, fase 4C). Generaliza `LocalCatalogNotice` del POS (4A) para
 * cualquier módulo: inventario, finanzas, clientes, compras...
 *
 * - Solo se muestra en Desktop y SIN red. Con red o en navegador no renderiza
 *   nada: la web no cambia.
 * - Sin red y con réplica: la hora (en la zona de la organización) de la
 *   replicación más antigua entre las tablas, que es la garantía mínima.
 * - Sin red y sin réplica: pide conectar una vez.
 *
 * Uso: `<LocalDataNotice />` en la cabecera de la página; `label` permite
 * nombrar el módulo («inventario», «facturas de compra»).
 */
export function LocalDataNotice({ className, label }: { className?: string; label?: string }) {
  const [orgId, setOrgId] = useState<number | null>(null);
  useEffect(() => {
    setOrgId(getOrganizationId() || null);
  }, []);
  const { isDesktop, isOnline, status } = useOfflineData(orgId);
  const { formatTime, formatDateTime, getToday, toDate } = useFormatDate();

  if (!isDesktop || !orgId || isOnline) return null;

  const base = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs rounded-md px-2 py-1';
  const what = label ? `datos locales de ${label}` : 'datos locales';

  if (!status || status.isEmpty) {
    return (
      <div role="status" className={cn(base, 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300', className)}>
        <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Sin conexión y sin datos locales: conecta a internet una vez para replicarlos.</span>
      </div>
    );
  }

  const at = status.replicatedAt ? new Date(status.replicatedAt) : null;
  const when = at ? (toDate(at) === getToday() ? formatTime(at) : formatDateTime(at)) : '—';
  const failed = Object.values(status.tables).filter((t) => t.error && t.replicated_at === 0).length;

  return (
    <div role="status" className={cn(base, 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200', className)}>
      <DatabaseZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Estás viendo {what} del {when}
        {failed > 0 && ` · ${failed} ${failed === 1 ? 'tabla sin replicar' : 'tablas sin replicar'}`}
      </span>
    </div>
  );
}
