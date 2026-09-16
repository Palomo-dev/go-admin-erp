/// <reference types="jest" />
/**
 * F14 — modelo de la tabla de cohortes (`cohortModel.ts`).
 * La RPC devuelve 0 para meses que aún no han ocurrido; el modelo los marca
 * como «sin observar» (null) para no pintar un 0 % falso.
 */
import { buildCohortTable, intensityBucket, addMonthsPlain, COHORT_HORIZONS } from '../cohortModel';

const row = (cohort_month: string, size: number, m1: number, m3 = 0, m6 = 0, m12 = 0) => ({
  cohort_month,
  cohort_size: size,
  retained_m1: m1,
  retained_m2: 0,
  retained_m3: m3,
  retained_m6: m6,
  retained_m12: m12,
  retention_m1_pct: size ? (m1 / size) * 100 : null,
  retention_m2_pct: 0,
  retention_m3_pct: size ? (m3 / size) * 100 : null,
  retention_m6_pct: size ? (m6 / size) * 100 : null,
  retention_m12_pct: size ? (m12 / size) * 100 : null,
});

describe('addMonthsPlain', () => {
  it('suma meses sobre YYYY-MM-DD sin tocar Date/zonas', () => {
    expect(addMonthsPlain('2026-01-01', 1)).toBe('2026-02-01');
    expect(addMonthsPlain('2026-11-01', 3)).toBe('2027-02-01');
    expect(addMonthsPlain('2026-03-01', -12)).toBe('2025-03-01');
  });
});

describe('intensityBucket (0–4) para el color; el número siempre se muestra aparte', () => {
  it('null → 0; 0 % → 1; 25 % → 2; 50 % → 3; 75 %+ → 4', () => {
    expect(intensityBucket(null)).toBe(0);
    expect(intensityBucket(0)).toBe(1);
    expect(intensityBucket(25)).toBe(2);
    expect(intensityBucket(50)).toBe(3);
    expect(intensityBucket(75)).toBe(4);
    expect(intensityBucket(100)).toBe(4);
  });
});

describe('buildCohortTable', () => {
  it('horizontes M1, M3, M6, M12', () => {
    expect(COHORT_HORIZONS).toEqual([1, 3, 6, 12]);
  });
  it('celda observable si cohorte + horizonte + 1 mes ≤ hoy; si no, null y etiqueta «—»', () => {
    const t = buildCohortTable([row('2026-06-01', 10, 8, 4)], '2026-09-15');
    const cells = t.rows[0].cells;
    // M1 = julio (cerrado en agosto) → observable; M3 = septiembre (aún en curso) → null
    expect(cells[0]).toMatchObject({ horizon: 1, pct: 80, retained: 8, observed: true, label: '80 %' });
    expect(cells[1]).toMatchObject({ horizon: 3, pct: null, observed: false, label: '—' });
    expect(cells[2].observed).toBe(false);
    expect(cells[3].observed).toBe(false);
  });
  it('0 % observado se muestra como «0 %», no como «—»', () => {
    const t = buildCohortTable([row('2025-01-01', 10, 0, 0, 0, 0)], '2026-09-15');
    expect(t.rows[0].cells.map((c) => c.label)).toEqual(['0 %', '0 %', '0 %', '0 %']);
  });
  it('cohorte de tamaño 0 → todas las celdas null', () => {
    const t = buildCohortTable([row('2025-01-01', 0, 0)], '2026-09-15');
    expect(t.rows[0].cells.every((c) => c.pct === null)).toBe(true);
  });
  it('ordena por mes de cohorte y conserva el tamaño', () => {
    const t = buildCohortTable([row('2026-03-01', 3, 1), row('2026-01-01', 7, 7)], '2026-09-15');
    expect(t.rows.map((r) => [r.cohort_month, r.cohort_size])).toEqual([
      ['2026-01-01', 7],
      ['2026-03-01', 3],
    ]);
  });
  it('sin filas → rows vacío y totalCustomers 0', () => {
    expect(buildCohortTable([], '2026-09-15')).toMatchObject({ rows: [], totalCustomers: 0 });
  });
});
