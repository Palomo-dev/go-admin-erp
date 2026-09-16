/**
 * F14 — modelo de la tabla de cohortes (puro).
 *
 * `fn_cohort_retention` devuelve, por mes de alta de clientes
 * (`customers.lifecycle_stage = 'customer'`), cuántos volvieron a facturar en
 * M1, M2, M3, M6 y M12. Para los meses que todavía no han ocurrido devuelve 0:
 * aquí se distingue «0 % observado» (nadie volvió) de «sin observar» (aún no
 * ha pasado el tiempo), que se pinta «—» y no colorea.
 *
 * Una celda M_n de la cohorte C es observable cuando el mes C + n ya cerró,
 * es decir, cuando el primer día de C + n + 1 ≤ hoy.
 *
 * El color de la celda es solo refuerzo (`intensity` 0–4): el número va
 * siempre en el texto de la celda (brief §2 y a11y: nunca solo color).
 */

import { addMonthsPlain } from './dateRange';

export { addMonthsPlain };

export const COHORT_HORIZONS = [1, 3, 6, 12] as const;
export type CohortHorizon = (typeof COHORT_HORIZONS)[number];

export interface CohortRow {
  cohort_month: string;
  cohort_size: number;
  retained_m1: number;
  retained_m2: number;
  retained_m3: number;
  retained_m6: number;
  retained_m12: number;
  retention_m1_pct: number | null;
  retention_m2_pct: number | null;
  retention_m3_pct: number | null;
  retention_m6_pct: number | null;
  retention_m12_pct: number | null;
}

export interface CohortCell {
  horizon: CohortHorizon;
  retained: number | null;
  pct: number | null;
  observed: boolean;
  /** Texto visible: «80 %», «0 %» o «—». */
  label: string;
  /** 0 = sin dato, 1..4 = intensidad creciente. */
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface CohortTableRow {
  cohort_month: string;
  cohort_size: number;
  cells: CohortCell[];
}

export interface CohortTable {
  rows: CohortTableRow[];
  totalCustomers: number;
  horizons: readonly CohortHorizon[];
}

export function intensityBucket(pct: number | null): 0 | 1 | 2 | 3 | 4 {
  if (pct === null || !Number.isFinite(pct)) return 0;
  if (pct >= 75) return 4;
  if (pct >= 50) return 3;
  if (pct >= 25) return 2;
  return 1;
}

function retainedFor(row: CohortRow, h: CohortHorizon): number {
  switch (h) {
    case 1:
      return row.retained_m1 || 0;
    case 3:
      return row.retained_m3 || 0;
    case 6:
      return row.retained_m6 || 0;
    default:
      return row.retained_m12 || 0;
  }
}

export function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  return `${Math.round(pct)} %`;
}

export function buildCohortTable(rows: CohortRow[], today: string): CohortTable {
  const sorted = [...rows].sort((a, b) => a.cohort_month.localeCompare(b.cohort_month));
  const tableRows: CohortTableRow[] = sorted.map((row) => {
    const size = row.cohort_size || 0;
    const cells: CohortCell[] = COHORT_HORIZONS.map((h) => {
      const observed = addMonthsPlain(row.cohort_month, h + 1) <= today;
      if (!observed || size <= 0) {
        return { horizon: h, retained: null, pct: null, observed, label: '—', intensity: 0 };
      }
      const retained = retainedFor(row, h);
      const pct = (retained / size) * 100;
      return { horizon: h, retained, pct, observed: true, label: formatPct(pct), intensity: intensityBucket(pct) };
    });
    return { cohort_month: row.cohort_month, cohort_size: size, cells };
  });
  return {
    rows: tableRows,
    totalCustomers: tableRows.reduce((s, r) => s + r.cohort_size, 0),
    horizons: COHORT_HORIZONS,
  };
}
