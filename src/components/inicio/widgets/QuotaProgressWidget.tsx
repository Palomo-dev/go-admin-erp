'use client';

/**
 * Progreso de la cuota vigente del usuario de la sesión (F13). Estado vacío
 * honesto cuando no hay cuota; nunca inventa cifras.
 */

import { AlertTriangle, CheckCircle2, Clock, Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { QuotaProgressBar } from '@/components/shared/QuotaProgressBar';
import type { QuotaStatus } from '@/lib/services/crm/quotaProgress';
import type { SellerDashboard } from '@/lib/services/crm/sellerDashboardService';
import { WidgetCard } from './WidgetCard';
import { quotaWidgetModel } from './widgetModels';

interface Props {
  quota: SellerDashboard['quota'] | undefined;
  currency: string;
  loading: boolean;
  error?: string | null;
  index?: number;
}

const STATUS_ICON: Record<QuotaStatus, { icon: typeof Clock; className: string }> = {
  en_ritmo: { icon: TrendingUp, className: 'text-blue-700 dark:text-blue-300' },
  cumplida: { icon: CheckCircle2, className: 'text-green-700 dark:text-green-300' },
  atrasado: { icon: AlertTriangle, className: 'text-amber-700 dark:text-amber-300' },
  vencida: { icon: Clock, className: 'text-red-700 dark:text-red-300' },
};

export function QuotaProgressWidget({ quota, currency, loading, error, index = 0 }: Props) {
  const m = loading ? null : quotaWidgetModel(quota ?? null, currency);
  return (
    <WidgetCard title="Mi cuota" icon={Target} index={index} error={error}>
      {!m ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : m.kind === 'empty' ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">{m.message}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {m.title} · {m.typeLabel}
            </p>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${STATUS_ICON[m.status].className}`}>
              {(() => {
                const I = STATUS_ICON[m.status].icon;
                return <I className="h-3.5 w-3.5" aria-hidden="true" />;
              })()}
              {m.statusLabel}
            </span>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
            {m.achievedLabel} <span className="text-sm font-normal text-gray-600 dark:text-gray-400">de {m.targetLabel}</span>
          </p>
          <QuotaProgressBar pct={m.pct} status={m.status} label={m.ariaLabel} />
          <p className="text-xs text-gray-700 dark:text-gray-300">
            <span className="font-semibold">{m.pct} %</span> · {m.detail}
          </p>
        </div>
      )}
    </WidgetCard>
  );
}
