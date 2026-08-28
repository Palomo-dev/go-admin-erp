'use client';

import { useLiveVisitors } from './useLiveVisitors';
import { useTranslations } from 'next-intl';

interface LiveVisitorsBadgeProps {
  organizationId: number | null | undefined;
}

/**
 * Badge de visitantes en vivo estilo Shopify.
 *
 * Muestra un punto verde pulsante + el número de visitantes activos
 * (visitas en los últimos 5 minutos). Se actualiza en tiempo real
 * via Supabase Realtime.
 *
 * Si no hay visitantes activos, no renderiza nada.
 */
export function LiveVisitorsBadge({ organizationId }: LiveVisitorsBadgeProps) {
  const t = useTranslations('home.kpis');
  const { liveCount, isActive } = useLiveVisitors(organizationId);

  if (liveCount === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <span className="relative flex h-2.5 w-2.5">
        {isActive && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        )}
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
      <span className="text-sm font-semibold text-green-700 dark:text-green-300">
        {liveCount}
      </span>
      <span className="text-xs text-green-600 dark:text-green-400">
        {liveCount === 1 ? t('liveVisitor') : t('liveVisitors')}
      </span>
    </div>
  );
}
