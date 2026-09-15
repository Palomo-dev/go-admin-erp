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
import { fmtMoney, plural } from '@/components/crm/revenueos/formatters';
import { computeForecastScenarios } from '@/lib/services/crm/revenueOs/forecastScenarios';
import type { Opportunity, Stage } from '@/components/crm/oportunidades/types';

interface Props {
  stages: Stage[];
  opportunities: Opportunity[];
  isLoading?: boolean;
  /** Moneda base de la organización (`dashboard.currency`); null → cifras sin símbolo. */
  currency: string | null;
}

export function ForecastScenarios({ stages, opportunities, isLoading, currency }: Props) {
  const reduced = useReducedMotion();
  const s = computeForecastScenarios(opportunities, stages);
  const max = Math.max(s.best, s.expected, s.worst, 1);

  const rows = [
    { key: 'best', label: 'Mejor caso', value: s.best, rule: `Abiertas en etapas con probabilidad ≥ ${s.bestMinProbability} %`, bar: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
    { key: 'expected', label: 'Esperado', value: s.expected, rule: 'Suma de abiertas × probabilidad de su etapa', bar: 'bg-[#eb6834] dark:bg-[#d95926]' },
    { key: 'worst', label: 'Peor caso', value: s.worst, rule: `Solo abiertas en etapas con probabilidad ≥ ${s.worstMinProbability} %`, bar: 'bg-[#1baf7a] dark:bg-[#199e70]' },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-2">
        <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white">Escenarios de forecast</CardTitle>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {s.openCount > 0
            ? `${plural(s.openCount, 'oportunidad abierta', 'oportunidades abiertas')} por ${fmtMoney(s.openTotal, currency)}`
            : 'Sin oportunidades abiertas en este pipeline'}
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
            Crea oportunidades y asígnales etapa para proyectar los tres escenarios.
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
