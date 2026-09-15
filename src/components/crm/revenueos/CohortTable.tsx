'use client';

/**
 * F14 — tabla de retención por cohorte (`fn_cohort_retention` → `cohortModel.ts`).
 * Cada celda lleva SIEMPRE el número («80 %», «0 %» o «—» si el mes aún no ha
 * cerrado); el color es refuerzo (rampa secuencial azul de la skill dataviz,
 * pasos elegidos por contraste ≥ 4,5:1 con su tinta en cada tema).
 */

import { useId } from 'react';
import { buildCohortTable, type CohortCell } from '@/lib/services/crm/revenueOs/cohortModel';
import type { CohortRetentionRow } from '@/lib/services/crm/revenueOsService';
import { fmtMonth, fmtNumber } from './formatters';

/** Intensidad 0–4 → fondo + tinta, claro y oscuro (medido con la herramienta de contraste del arnés). */
const INTENSITY_CLASS: Record<CohortCell['intensity'], string> = {
  0: 'bg-transparent text-gray-500 dark:text-gray-400',
  1: 'bg-[#cde2fb] text-gray-900 dark:bg-[#0d366b] dark:text-gray-50',
  2: 'bg-[#9ec5f4] text-gray-900 dark:bg-[#184f95] dark:text-gray-50',
  3: 'bg-[#5598e7] text-gray-900 dark:bg-[#256abf] dark:text-white',
  4: 'bg-[#1c5cab] text-white dark:bg-[#3987e5] dark:text-gray-950',
};

interface Props {
  rows: CohortRetentionRow[];
  /** YYYY-MM-DD en la zona de la organización (decide qué celdas son observables). */
  today: string;
}

export function CohortTable({ rows, today }: Props) {
  const captionId = useId();
  const table = buildCohortTable(rows, today);

  if (table.rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
        Sin cohortes: ningún cliente con etapa «cliente» dado de alta en los últimos 24 meses. Las cohortes aparecen al
        convertir contactos en clientes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-describedby={captionId}>
          <caption id={captionId} className="pb-2 text-left text-xs text-gray-600 dark:text-gray-300">
            Clientes que volvieron a facturar 1, 3, 6 y 12 meses después de su alta, por mes de alta. «—» = el mes aún no ha
            cerrado. {fmtNumber(table.totalCustomers)} clientes en total.
          </caption>
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <th scope="col" className="py-1.5 pr-3 font-medium">Cohorte</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Clientes</th>
              {table.horizons.map((h) => (
                <th key={h} scope="col" className="py-1.5 px-2 text-center font-medium">
                  M{h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.cohort_month} className="border-b border-gray-100 dark:border-gray-700/60">
                <th scope="row" className="py-1 pr-3 text-left font-normal text-gray-800 dark:text-gray-200">
                  {fmtMonth(r.cohort_month)}
                </th>
                <td className="py-1 pr-3 text-right tabular-nums text-gray-800 dark:text-gray-200">{fmtNumber(r.cohort_size)}</td>
                {r.cells.map((cell) => (
                  <td key={cell.horizon} className="p-1 text-center">
                    <span
                      className={`inline-block w-full min-w-[3.25rem] rounded px-1.5 py-1 tabular-nums ${INTENSITY_CLASS[cell.intensity]}`}
                      title={cell.observed ? `${cell.retained ?? 0} de ${r.cohort_size} clientes` : 'Mes aún no cerrado'}
                    >
                      {cell.label}
                      {cell.observed ? (
                        <span className="sr-only">
                          {' '}
                          ({cell.retained ?? 0} de {r.cohort_size})
                        </span>
                      ) : (
                        <span className="sr-only"> sin observar</span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300" aria-label="Escala de color">
        {(
          [
            [1, '0–24 %'],
            [2, '25–49 %'],
            [3, '50–74 %'],
            [4, '75–100 %'],
          ] as const
        ).map(([k, label]) => (
          <li key={k} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-5 rounded ${INTENSITY_CLASS[k]}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
