'use client';

import { useTranslations } from 'next-intl';
import type { HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import { bandForScore } from '@/lib/services/crm/healthBands';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
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

export function formatDimensionValue(
  key: string,
  value: number,
  /** Formateador en la moneda base de la organización (nunca 'COP' cableado). */
  formatearImporte: (valor: number) => string,
  text: { noData: string; days: (days: number) => string } = { noData: 'Sin datos', days: days => `${days} días` },
): string {
  if (value < 0) return text.noData;
  if (MONEY_KEYS.has(key)) return formatearImporte(value);
  if (RATIO_KEYS.has(key)) return `${(value * 100).toFixed(1)} %`;
  if (DAY_KEYS.has(key)) return text.days(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function HealthDimensions({ indicators, className = '' }: HealthDimensionsProps) {
  const t = useTranslations('crm.salud');
  const weighted = indicators.some((i) => i.weight > 0);
  const { formatear } = useMonedaOrganizacion();
  return (
    <ul className={`divide-y divide-line ${className}`} aria-label={t('indicators')}>
      {indicators.map((ind) => {
        const label = t.has(`indicatorLabels.${ind.key}`) ? t(`indicatorLabels.${ind.key}`) : ind.label;
        const st = BAND_STYLES[bandForScore(ind.score)];
        return (
          <li key={ind.key} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-fg-secondary truncate">
                {label}
                {weighted && <span className="text-fg-muted"> · {t('weight', { weight: ind.weight })}</span>}
              </span>
              <span className="text-xs font-medium text-fg shrink-0 tabular-nums">{formatDimensionValue(ind.key, ind.value, formatear, { noData: t('noData'), days: days => t('days', { days }) })}</span>
            </div>
            {weighted && (
              <div className="mt-1 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-label={`${label}: ${ind.score} de 100`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={ind.score}
                  className="h-1.5 flex-1 rounded-full bg-subtle overflow-hidden"
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
