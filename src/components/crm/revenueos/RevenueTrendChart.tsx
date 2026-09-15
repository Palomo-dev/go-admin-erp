'use client';

/**
 * F14 — tendencia mensual: revenue cobrado (pagos) frente a ganado en pipeline
 * (`opportunities.amount` de las ganadas). Recharts (ya en package.json).
 *
 * Paleta de la skill dataviz (slots 1 y 2, claro/oscuro) como variables CSS
 * en el contenedor; barras ≤ 24 px con extremo redondeado; leyenda y tooltip
 * con texto en tinta de texto (nunca en el color de la serie); vista de tabla
 * como alternativa accesible.
 */

import { useId, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import type { RevenueMetricRow } from '@/lib/services/crm/revenueOsService';
import { fmtMoney, fmtMoneyCompact, fmtMonth } from './formatters';

const SERIES = [
  { key: 'revenue_collected', label: 'Cobrado', color: 'var(--rv-s1)' },
  { key: 'revenue_won_pipeline', label: 'Ganado en pipeline', color: 'var(--rv-s2)' },
] as const;

const PALETTE =
  '[--rv-s1:#2a78d6] [--rv-s2:#eb6834] [--rv-grid:#e5e7eb] [--rv-text:#52514e] ' +
  'dark:[--rv-s1:#3987e5] dark:[--rv-s2:#d95926] dark:[--rv-grid:#374151] dark:[--rv-text:#c3c2b7]';

interface Props {
  rows: RevenueMetricRow[];
  /** Moneda base de la organización; null → cifras sin símbolo (la página lo avisa). */
  currency: string | null;
}

interface TooltipPayload {
  dataKey?: string;
  value?: number;
  name?: string;
}

function TrendTooltip({ active, payload, label, currency }: { active?: boolean; payload?: TooltipPayload[]; label?: string; currency: string | null }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div role="status" className="rounded-md border border-gray-200 bg-white p-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800">
      <p className="font-medium text-gray-900 dark:text-gray-100">{fmtMonth(String(label ?? ''))}</p>
      {payload.map((p) => {
        const s = SERIES.find((x) => x.key === p.dataKey);
        return (
          <p key={String(p.dataKey)} className="mt-0.5 flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s?.color }} aria-hidden="true" />
            {s?.label ?? p.name}: {fmtMoney(Number(p.value), currency)}
          </p>
        );
      })}
    </div>
  );
}

export function RevenueTrendChart({ rows, currency }: Props) {
  const [showTable, setShowTable] = useState(false);
  const captionId = useId();
  const data = rows.map((r) => ({ month: r.month, revenue_collected: r.revenue_collected, revenue_won_pipeline: r.revenue_won_pipeline }));
  const empty = rows.length === 0 || rows.every((r) => r.revenue_collected === 0 && r.revenue_won_pipeline === 0);

  return (
    <section
      aria-labelledby={captionId}
      className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 ${PALETTE}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={captionId} className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Tendencia mensual: cobrado frente a ganado
        </h3>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Ver gráfico' : 'Ver tabla'}
        </Button>
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-300">
          Sin cobros ni oportunidades ganadas en el periodo. Cambia el rango o registra ventas para ver la tendencia.
        </p>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Revenue cobrado y ganado en pipeline por mes</caption>
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <th scope="col" className="py-1.5 pr-3 font-medium">Mes</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="py-1.5 pr-3 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-b border-gray-100 dark:border-gray-700/60">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-800 dark:text-gray-200">{fmtMonth(d.month)}</th>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(d.revenue_collected, currency)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(d.revenue_won_pipeline, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full" role="img" aria-label="Gráfico de barras mensual: cobrado frente a ganado en pipeline. La vista de tabla tiene los valores exactos.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--rv-grid)" strokeWidth={1} />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill: 'var(--rv-text)', fontSize: 11 }} axisLine={{ stroke: 'var(--rv-grid)' }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => fmtMoneyCompact(v)} tick={{ fill: 'var(--rv-text)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<TrendTooltip currency={currency} />} cursor={{ fill: 'var(--rv-grid)', opacity: 0.5 }} />
              <Legend
                iconType="square"
                iconSize={10}
                formatter={(value: string) => <span className="text-xs text-gray-700 dark:text-gray-200">{value}</span>}
              />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
