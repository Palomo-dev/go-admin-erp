'use client';

/**
 * F14 — escenarios de forecast (mejor / esperado / peor) sobre las
 * oportunidades ABIERTAS del pipeline elegido × probabilidad de etapa
 * (`forecastScenarios.ts`, puro). Las ganadas y perdidas nunca entran.
 * Tres barras horizontales sobre la misma escala, cada una con su cifra y su
 * regla escrita (nunca solo color).
 */

import { motion, useReducedMotion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtMoney } from '@/components/crm/revenueos/formatters';
import { computeForecastScenarios } from '@/lib/services/crm/revenueOs/forecastScenarios';
import type { Opportunity, Stage } from '@/components/crm/oportunidades/types';
import { useTranslations } from 'next-intl';

interface Props {
  stages: Stage[];
  opportunities: Opportunity[];
  isLoading?: boolean;
  /** Moneda base de la organización (`dashboard.currency`); null → cifras sin símbolo. */
  currency: string | null;
}

export function ForecastScenarios({ stages, opportunities, isLoading, currency }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre');
  const reduced = useReducedMotion();
  const s = computeForecastScenarios(opportunities, stages);
  const max = Math.max(s.best, s.expected, s.worst, 1);

  const rows = [
    { key: 'best', label: t('forecastScenarios.escenarios.best'), value: s.best, rule: t('forecastScenarios.reglas.best', { n: s.bestMinProbability }), bar: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
    { key: 'expected', label: t('forecastScenarios.escenarios.expected'), value: s.expected, rule: t('forecastScenarios.reglas.expected'), bar: 'bg-[#eb6834] dark:bg-[#d95926]' },
    { key: 'worst', label: t('forecastScenarios.escenarios.worst'), value: s.worst, rule: t('forecastScenarios.reglas.worst', { n: s.worstMinProbability }), bar: 'bg-[#1baf7a] dark:bg-[#199e70]' },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-2">
        <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white">{t('forecastScenarios.escenariosForecast')}</CardTitle>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {s.openCount > 0
            ? t('forecastScenarios.abiertasPor', { n: s.openCount, monto: fmtMoney(s.openTotal, currency) })
            : t('forecastScenarios.sinOportunidadesAbiertasEste')}
        </p>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        ) : s.openCount === 0 ? (
          <p className="py-4 text-center text-sm text-gray-600 dark:text-gray-300">
            {t('forecastScenarios.creaOportunidadesAsignalesEtapa')}
          </p>
        ) : (
          <dl className="space-y-3">
            {rows.map((r, i) => (
              <div key={r.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">{fmtMoney(r.value, currency)}</dd>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded bg-gray-100 dark:bg-gray-700" aria-hidden="true">
                  <motion.div
                    className={`h-full rounded ${r.bar}`}
                    initial={reduced ? false : { width: 0 }}
                    animate={{ width: `${(r.value / max) * 100}%` }}
                    transition={{ duration: 0.25, delay: reduced ? 0 : i * 0.05 }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{r.rule}</p>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
