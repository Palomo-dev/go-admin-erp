'use client';

import type { HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import { bandForScore } from '@/lib/services/crm/healthBands';
import { formatCurrency } from '@/utils/Utils';
import { BAND_STYLES } from './healthBandStyles';

/**
 * Lista de dimensiones del health score (F11). Si la organización tiene
 * `health_score_configs.config.indicators`, cada fila trae valor, peso y
 * puntuación 0–100 con barra; si no, se listan los campos reales de la RPC.
 */
export interface HealthDimensionsProps {
  indicators: HealthScoreResult['indicators'];
  className?: string;
}

const MONEY_KEYS = new Set(['ltv', 'revenue_12m', 'avg_ticket', 'overdue_balance']);
const DAY_KEYS = new Set(['recency', 'activity', 'days_since_last_invoice', 'days_since_last_activity']);
const RATIO_KEYS = new Set(['receivables', 'overdue', 'overdue_ratio']);

export function formatDimensionValue(key: string, value: number): string {
  if (value < 0) return 'Sin datos';
  if (MONEY_KEYS.has(key)) return formatCurrency(value, 'COP');
  if (RATIO_KEYS.has(key)) return `${(value * 100).toFixed(1)} %`;
  if (DAY_KEYS.has(key)) return `${Math.round(value)} días`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HealthDimensions({ indicators, className = '' }: HealthDimensionsProps) {
  const weighted = indicators.some((i) => i.weight > 0);
  return (
    <ul className={`divide-y divide-gray-100 dark:divide-gray-700/60 ${className}`} aria-label="Dimensiones del health score">
      {indicators.map((ind) => {
        const st = BAND_STYLES[bandForScore(ind.score)];
        return (
          <li key={ind.key} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                {ind.label}
                {weighted && <span className="text-gray-500 dark:text-gray-400"> · peso {ind.weight}</span>}
              </span>
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 shrink-0 tabular-nums">{formatDimensionValue(ind.key, ind.value)}</span>
            </div>
            {weighted && (
              <div className="mt-1 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-label={`${ind.label}: ${ind.score} de 100`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={ind.score}
                  className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
                >
                  <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${ind.score}%` }} />
                </div>
                <span className={`text-[11px] font-semibold tabular-nums w-7 text-right ${st.text}`}>{ind.score}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default HealthDimensions;
