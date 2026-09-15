'use client';

/**
 * F14 — embudo por etapa (`fn_pipeline_funnel`) con conversión etapa→etapa
 * (`funnelConversion.ts`, puro). La RPC mezcla los pipelines de la
 * organización: se elige uno (selector) y se calcula el acumulado «llegó a
 * esta etapa o más allá». Barras con `motion` (anchura = share), y la misma
 * información en una tabla accesible (caption + scope).
 */

import { useId, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeFunnelConversion } from '@/lib/services/crm/revenueOs/funnelConversion';
import type { PipelineFunnelRow } from '@/lib/services/crm/revenueOsService';
import { fmtMoney, fmtNumber, fmtPct, plural } from './formatters';

interface Props {
  funnel: PipelineFunnelRow[];
  /** `pipelines.name` por id (del dashboard); si un id no está, se muestra abreviado. */
  pipelineNames?: Record<string, string>;
  /** Moneda base de la organización; null → cifras sin símbolo (la página lo avisa). */
  currency: string | null;
}

export function FunnelPanel({ funnel, pipelineNames = {}, currency }: Props) {
  const reduced = useReducedMotion();
  const selectId = useId();
  const pipelineIds = useMemo(() => Array.from(new Set(funnel.map((f) => f.pipeline_id ?? 'sin-pipeline'))), [funnel]);
  const [selected, setSelected] = useState<string>(() => pipelineIds[0] ?? '');
  const current = pipelineIds.includes(selected) ? selected : pipelineIds[0] ?? '';

  const conversion = useMemo(
    () => computeFunnelConversion(funnel.filter((f) => (f.pipeline_id ?? 'sin-pipeline') === current)),
    [funnel, current],
  );

  if (funnel.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        Sin etapas configuradas. Crea un pipeline con etapas en Configuración para ver el embudo.
      </p>
    );
  }

  const nameOf = (id: string) => pipelineNames[id] ?? (id === 'sin-pipeline' ? 'Sin pipeline' : `Pipeline ${id.slice(0, 8)}`);
  const { stages, lost, overallPct, overallBasis, totalReached, ignoredAfterWon } = conversion;

  return (
    <div className="space-y-4">
      {pipelineIds.length > 1 && (
        <div className="flex items-center gap-2">
          <Label htmlFor={selectId} className="text-xs text-gray-600 dark:text-gray-300">
            Pipeline
          </Label>
          <Select value={current} onValueChange={setSelected}>
            <SelectTrigger id={selectId} className="h-9 w-56 bg-white text-sm dark:bg-gray-800 dark:text-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800">
              {pipelineIds.map((id) => (
                <SelectItem key={id} value={id} className="text-sm text-gray-900 dark:text-gray-100">
                  {nameOf(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {ignoredAfterWon.length > 0 && (
        <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Fuera de la cadena: {ignoredAfterWon.map((s) => `«${s.stage_name}» (${plural(s.count, 'oportunidad', 'oportunidades')})`).join(', ')} va después de la
          etapa ganada. La conversión termina en la ganada; revisa el orden de las etapas en Configuración.
        </p>
      )}

      {totalReached === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
          Sin oportunidades en este pipeline todavía. Crea la primera desde Oportunidades y el embudo se llenará solo.
        </p>
      ) : (
        <>
          <ol className="space-y-2" aria-label="Embudo por etapa">
            {stages.map((s, i) => (
              <li key={s.stage_id} className="grid grid-cols-[minmax(7rem,1fr)_3fr] items-center gap-3 text-sm">
                <span className="truncate text-gray-800 dark:text-gray-200" title={s.stage_name}>
                  {s.stage_name}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-6 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-700" aria-hidden="true">
                    <motion.div
                      className={`h-full rounded-r ${s.is_won ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-blue-600 dark:bg-blue-500'}`}
                      initial={reduced ? false : { width: 0 }}
                      animate={{ width: `${Math.max(s.sharePct, s.reached > 0 ? 2 : 0)}%` }}
                      transition={{ duration: 0.25, delay: reduced ? 0 : i * 0.04 }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {fmtNumber(s.reached)} · {fmtPct(s.sharePct)}
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="pb-2 text-left text-xs text-gray-600 dark:text-gray-300">
                Conversión etapa a etapa (acumulado: en la etapa o más adelante; las perdidas se muestran aparte)
              </caption>
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Etapa</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">En la etapa</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Llegaron</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Monto en etapa</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Pasa a la siguiente</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.stage_id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-800 dark:text-gray-200">
                      {s.stage_name}
                      {s.is_won && <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-300">(ganada)</span>}
                    </th>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtNumber(s.count)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtNumber(s.reached)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtMoney(s.amount, currency)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">
                      {s.conversionToNextPct === null ? '—' : fmtPct(s.conversionToNextPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs text-gray-700 dark:text-gray-200">
                  <th scope="row" className="pt-2 pr-3 text-left font-medium">
                    Conversión global
                    {overallBasis === 'last' && <span className="ml-1 font-normal text-gray-600 dark:text-gray-300">(hasta la última etapa: no hay etapa ganada)</span>}
                  </th>
                  <td colSpan={4} className="pt-2 pr-3 text-right tabular-nums">
                    {overallPct === null ? 'Sin datos' : fmtPct(overallPct, 1)}
                    {lost.count > 0 && (
                      <span className="ml-3 text-gray-600 dark:text-gray-300">
                        Perdidas: {fmtNumber(lost.count)} ({fmtMoney(lost.amount, currency)})
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
