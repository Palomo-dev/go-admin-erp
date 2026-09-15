'use client';

/**
 * Comisiones del mes del usuario de la sesión: devengadas vs pagadas (F13),
 * en la moneda base; las de otras monedas van como líneas aparte, sin sumar.
 */

import Link from 'next/link';
import { Percent } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MonthCommissionSummary, MonthCurrencySummary } from '@/lib/services/crm/sellerDashboardModel';
import { pluralComisiones } from '@/components/finanzas/comisiones/comisionesModel';
import { WidgetCard } from './WidgetCard';
import { commissionsWidgetModel } from './widgetModels';

interface Props {
  commissions: MonthCommissionSummary | undefined;
  others?: MonthCurrencySummary[];
  currency: string;
  loading: boolean;
  error?: string | null;
  index?: number;
}

export function CommissionsWidget({ commissions, others, currency, loading, error, index = 1 }: Props) {
  const m = loading || !commissions ? null : commissionsWidgetModel(commissions, currency, others);
  return (
    <WidgetCard
      title="Mis comisiones del mes"
      icon={Percent}
      index={index}
      error={error}
      action={
        <Link href="/app/finanzas/comisiones" className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
          Ver todas
        </Link>
      }
    >
      {!m ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      ) : m.kind === 'empty' ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">{m.message}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-gray-600 dark:text-gray-400">Devengado</dt>
            <dd className="text-xl font-semibold tabular-nums text-gray-900 dark:text-white">{m.totalLabel}</dd>
            <dd className="text-xs text-gray-600 dark:text-gray-400">{pluralComisiones(m.count)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-600 dark:text-gray-400">Pagado</dt>
            <dd className="text-xl font-semibold tabular-nums text-green-700 dark:text-green-300">{m.paidLabel}</dd>
            <dd className="text-xs text-gray-600 dark:text-gray-400">
              {m.paidPct} % · pendiente {m.pendingLabel}
            </dd>
          </div>
          {m.otherLines.map((line) => (
            <dd key={line} className="col-span-2 text-xs text-gray-700 dark:text-gray-300">
              {line}
            </dd>
          ))}
        </dl>
      )}
    </WidgetCard>
  );
}
