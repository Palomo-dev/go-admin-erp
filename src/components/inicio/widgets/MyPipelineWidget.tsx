'use client';

/**
 * Mis oportunidades abiertas (top por monto) y tareas de hoy (F13). Fechas
 * por la zona horaria de la organización (`useFormatDate`).
 */

import Link from 'next/link';
import { CalendarCheck, KanbanSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { SellerOpportunity, SellerTask } from '@/lib/services/crm/sellerDashboardService';
import { WidgetCard } from './WidgetCard';
import { pipelineWidgetModel } from './widgetModels';

interface Props {
  opportunities: SellerOpportunity[] | undefined;
  tasks: SellerTask[] | undefined;
  currency: string;
  loading: boolean;
  error?: string | null;
  index?: number;
}

const PRIORITY: Record<string, string> = { critical: 'Crítica', high: 'Alta', med: 'Media', low: 'Baja' };

export function MyPipelineWidget({ opportunities, tasks, currency, loading, error, index = 3 }: Props) {
  const { formatTime } = useFormatDate();
  const m = loading ? null : pipelineWidgetModel(opportunities ?? [], tasks ?? [], currency);

  return (
    <WidgetCard
      title="Mi pipeline y tareas de hoy"
      icon={KanbanSquare}
      index={index}
      error={error}
      action={
        <Link href="/app/crm/pipeline" className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
          Abrir pipeline
        </Link>
      }
    >
      {!m ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section aria-labelledby="mp-opps">
            <h4 id="mp-opps" className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Oportunidades abiertas
            </h4>
            {m.opportunities.length === 0 ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">{m.opportunitiesEmpty}</p>
            ) : (
              <ul className="space-y-1.5">
                {m.opportunities.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={o.href} className="min-w-0 flex-1 truncate text-gray-900 hover:underline dark:text-white">
                      {o.name}
                      {o.stage_name && <span className="ml-1 text-xs text-gray-600 dark:text-gray-400">· {o.stage_name}</span>}
                    </Link>
                    <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-white">{o.amountLabel}</span>
                    {o.expected_close_date && (
                      <span className="hidden shrink-0 text-xs text-gray-600 sm:inline dark:text-gray-400">{formatPlainDate(o.expected_close_date)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="mp-tasks">
            <h4 id="mp-tasks" className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Tareas de hoy
            </h4>
            {m.tasks.length === 0 ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">{m.tasksEmpty}</p>
            ) : (
              <ul className="space-y-1.5">
                {m.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={t.href} className="min-w-0 flex-1 truncate text-gray-900 hover:underline dark:text-white">
                      {t.title}
                    </Link>
                    {t.priority && <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">{PRIORITY[t.priority] ?? t.priority}</span>}
                    {t.due_date && <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-400">{formatTime(t.due_date)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </WidgetCard>
  );
}
