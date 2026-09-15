'use client';

/**
 * F14 — tarjetas KPI del resumen (stat tiles, skill dataviz: el número es el
 * protagonista; texto en tinta de texto, nunca en color de serie). Un valor
 * `null` se muestra como «Sin datos» con el motivo: nada de ceros inventados.
 */

import type { ReactNode } from 'react';
import { Banknote, Clock, Percent, Receipt, Trophy, Wallet } from 'lucide-react';
import { StaggerItem, StaggerList } from '@/components/shared/motion/staggerList';
import type { PipelineFunnelRow, RevenueSummary } from '@/lib/services/crm/revenueOsService';
import { fmtDays, fmtMoney, fmtPct, SIN_DATOS } from './formatters';
import { arpaHint, collectedHint, winRateHint, wonHint } from './kpiHints';

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}

export function buildTiles(summary: RevenueSummary, funnel: PipelineFunnelRow[], currency: string | null): Tile[] {
  const openPipeline = funnel.filter((f) => !f.is_won && !f.is_lost).reduce((s, f) => s + f.total_amount, 0);
  const i = 'h-4 w-4 text-gray-500 dark:text-gray-400';
  return [
    {
      key: 'collected',
      label: 'Revenue cobrado',
      value: fmtMoney(summary.revenue_collected, currency),
      hint: collectedHint(summary, currency),
      icon: <Banknote className={i} aria-hidden="true" />,
    },
    {
      key: 'won',
      label: 'Ganado en pipeline',
      value: fmtMoney(summary.revenue_won_pipeline, currency),
      hint: wonHint(summary),
      icon: <Trophy className={i} aria-hidden="true" />,
    },
    {
      key: 'open',
      label: 'Pipeline abierto',
      value: fmtMoney(openPipeline, currency),
      hint: 'Monto en etapas abiertas hoy',
      icon: <Wallet className={i} aria-hidden="true" />,
    },
    {
      key: 'winrate',
      label: 'Win rate',
      value: fmtPct(summary.win_rate_pct),
      hint: winRateHint(summary),
      icon: <Percent className={i} aria-hidden="true" />,
    },
    {
      key: 'cycle',
      label: 'Ciclo medio de venta',
      value: fmtDays(summary.avg_sales_cycle_days),
      hint: summary.avg_sales_cycle_days === null ? 'Sin oportunidades ganadas con fecha de cierre' : 'De creación a cierre, media mensual',
      icon: <Clock className={i} aria-hidden="true" />,
    },
    {
      key: 'arpa',
      label: 'ARPA',
      value: fmtMoney(summary.arpa, currency),
      hint: arpaHint(summary),
      icon: <Receipt className={i} aria-hidden="true" />,
    },
    {
      key: 'commissions',
      label: 'Comisiones pagadas',
      value: fmtMoney(summary.commissions_paid, currency),
      hint: summary.commissions_paid > 0 ? 'Comisiones en estado pagado' : 'Ninguna comisión pagada en el periodo',
      icon: <Banknote className={i} aria-hidden="true" />,
    },
  ];
}

interface Props {
  summary: RevenueSummary;
  funnel: PipelineFunnelRow[];
  /** Moneda base de la organización; null → cifras sin símbolo (la página lo avisa). */
  currency: string | null;
}

export function KpiTiles({ summary, funnel, currency }: Props) {
  const tiles = buildTiles(summary, funnel, currency);
  return (
    <StaggerList as="ul" className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores del periodo">
      {tiles.map((t) => (
        <StaggerItem
          as="li"
          key={t.key}
          className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t.label}</span>
            {t.icon}
          </div>
          <p
            className={`mt-1 truncate text-lg font-semibold sm:text-xl ${
              t.value === SIN_DATOS ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-50'
            }`}
            title={t.value}
          >
            {t.value}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{t.hint}</p>
        </StaggerItem>
      ))}
    </StaggerList>
  );
}
