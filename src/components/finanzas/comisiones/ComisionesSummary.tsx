'use client';

/**
 * Tarjetas devengado / pagado / pendiente (+ canceladas) del filtro activo,
 * SOLO en la moneda base; las demás monedas se listan aparte, nunca sumadas
 * (ronda 2: 18 COP + 1 USD no es un «devengado»). Estado siempre con icono y
 * texto, nunca solo color (brief §2). Si la carga falló, «—» en vez de $0.
 */

import { CheckCircle2, Clock, TrendingUp, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CurrencySummary } from '@/lib/services/crm/commissionTransitions';
import { formatCurrency } from '@/utils/Utils';
import { pluralComisiones } from './comisionesModel';

interface Props {
  summary: CurrencySummary;
  /** Otras monedas del mismo filtro, cada una con su resumen. */
  others?: CurrencySummary[];
  currency: string;
  loading: boolean;
  /** La última carga falló y no hay datos previos: no se muestran ceros que mientan. */
  unavailable?: boolean;
}

export function ComisionesSummary({ summary, others = [], currency, loading, unavailable = false }: Props) {
  const cards = [
    {
      key: 'accrued',
      label: 'Devengado',
      hint: `${summary.count_pending + summary.count_paid} comisiones vivas`,
      value: summary.accrued_total,
      icon: TrendingUp,
      iconClass: 'text-blue-700 dark:text-blue-300',
      bg: 'bg-blue-100 dark:bg-blue-900/40',
    },
    {
      key: 'paid',
      label: 'Pagado',
      hint: `${summary.count_paid} pagadas`,
      value: summary.paid_total,
      icon: CheckCircle2,
      iconClass: 'text-green-700 dark:text-green-300',
      bg: 'bg-green-100 dark:bg-green-900/40',
    },
    {
      key: 'pending',
      label: 'Pendiente de pago',
      hint: `${summary.count_pending} por pagar`,
      value: summary.pending_total,
      icon: Clock,
      iconClass: 'text-amber-700 dark:text-amber-300',
      bg: 'bg-amber-100 dark:bg-amber-900/40',
    },
    {
      key: 'cancelled',
      label: 'Canceladas',
      hint:
        summary.count_cancelled === 0
          ? 'ninguna'
          : `${formatCurrency(summary.rejected_total, currency)} rechazadas · ${formatCurrency(summary.clawback_total, currency)} clawback`,
      value: summary.cancelled_total,
      icon: XCircle,
      iconClass: 'text-red-700 dark:text-red-300',
      bg: 'bg-red-100 dark:bg-red-900/40',
    },
  ];

  return (
    <section aria-label="Resumen de comisiones del filtro" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {cards.map((c) => (
        <Card key={c.key} className="border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded-lg p-2 ${c.bg}`} aria-hidden="true">
                <c.icon className={`h-4 w-4 ${c.iconClass}`} />
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{c.label}</p>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : unavailable ? (
              <p className="text-2xl font-semibold text-gray-900 dark:text-white" aria-label="No disponible">—</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(c.value, currency)}</p>
            )}
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{loading ? ' ' : unavailable ? 'No se pudo cargar' : c.hint}</p>
          </CardContent>
        </Card>
      ))}
      {!loading && !unavailable && others.length > 0 && (
        <ul className="col-span-2 space-y-1 text-sm text-gray-700 md:col-span-4 dark:text-gray-300" aria-label="Comisiones en otras monedas">
          {others.map((o) => (
            <li key={o.currency}>
              + {pluralComisiones(o.count)} en {o.currency}: {formatCurrency(o.accrued_total, o.currency)} devengado · {formatCurrency(o.paid_total, o.currency)} pagado ·{' '}
              {formatCurrency(o.pending_total, o.currency)} pendiente
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
