/// <reference types="jest" />
/**
 * F14 — ronda 2. Filas REALES de `fn_revenue_metrics` reescrita (espina de
 * meses, `revenue_collected` sin exigir oportunidad, `revenue_collected_linked`
 * e `invoices_paid`), leídas por MCP el 2026-09-15 (solo ids de organización).
 *
 * Cifras verificadas con SQL a mano por el orquestador:
 *   org 135  cobrado 16 970 600 = ago-26 3 031 500 + sep-26 13 939 100
 *   org 2    ARPA ponderado por facturas = 90 737,50 (antes 104 892,83 por
 *            media de medias de solo dos meses)
 */

import { fetchRevenueMetrics, type RevenueMetricRow } from '../rpc';
import { computeArpa, computeRevenueMath } from '../revenueMath';
import { computeFunnelConversion } from '../funnelConversion';
import { summarizeRevenueMetrics } from '../../revenueOsService';

const spine = (month: string, extra: Partial<RevenueMetricRow> = {}): RevenueMetricRow => ({
  month,
  deals_won: 0,
  deals_lost: 0,
  deals_open: 0,
  revenue_won_pipeline: 0,
  revenue_lost: 0,
  revenue_pipeline: 0,
  arpa: null,
  avg_sales_cycle_days: null,
  win_rate: null,
  revenue_collected: 0,
  commissions_paid: 0,
  revenue_collected_linked: 0,
  invoices_paid: 0,
  ...extra,
});

/** fn_revenue_metrics(2, '2025-07-01', '2026-10-01'): 15 meses, todos presentes. */
export const ORG2_R2: RevenueMetricRow[] = [
  spine('2025-07-01', { deals_won: 1, deals_lost: 2, deals_open: 5, revenue_won_pipeline: 60000, revenue_lost: 51000, revenue_pipeline: 820705, arpa: 99285.666666666667, avg_sales_cycle_days: 18.8617082708796296, win_rate: 0.33333333333333333333, invoices_paid: 9 }),
  spine('2025-08-01', { arpa: 59500, invoices_paid: 4 }),
  spine('2025-09-01'),
  spine('2025-10-01'),
  spine('2025-11-01', { arpa: 416.5, invoices_paid: 1 }),
  spine('2025-12-01'),
  spine('2026-01-01', { deals_open: 1, revenue_pipeline: 40900, arpa: 110500.002857142857, invoices_paid: 7 }),
  spine('2026-02-01'),
  spine('2026-03-01'),
  spine('2026-04-01'),
  spine('2026-05-01'),
  spine('2026-06-01'),
  spine('2026-07-01', { revenue_collected: 3537885 }),
  spine('2026-08-01'),
  spine('2026-09-01'),
];

/** fn_revenue_metrics(135, '2025-10-01', '2026-10-01'): 12 meses; solo ago/sep-26 con actividad. */
export const ORG135_R2: RevenueMetricRow[] = [
  ...['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'].map((m) => spine(m)),
  spine('2026-08-01', { arpa: 65902.173913043478, revenue_collected: 3031500, invoices_paid: 46 }),
  spine('2026-09-01', { deals_open: 19, arpa: 61136.40350877193, revenue_collected: 13939100, invoices_paid: 228 }),
];

describe('F14 r2 — mapeo de las dos columnas nuevas de fn_revenue_metrics', () => {
  it('revenue_collected_linked e invoices_paid llegan tal cual; si faltaran (RPC vieja) valen 0', async () => {
    const row = { month: '2026-08-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: '0', revenue_lost: '0', revenue_pipeline: '0', arpa: '65902.17', avg_sales_cycle_days: null, win_rate: null, revenue_collected: '3031500', commissions_paid: '0', revenue_collected_linked: '0', invoices_paid: 46 };
    const supabase = { rpc: async () => ({ data: [row, { ...row, month: '2026-09-01', revenue_collected_linked: undefined, invoices_paid: undefined }], error: null }) } as never;
    const rows = await fetchRevenueMetrics(135, '2025-10-01', '2026-10-01', supabase);
    expect(rows[0]).toMatchObject({ revenue_collected: 3031500, revenue_collected_linked: 0, invoices_paid: 46 });
    expect(rows[1]).toMatchObject({ revenue_collected_linked: 0, invoices_paid: 0 });
  });
});

describe('F14 r2 — ARPA ponderado por facturas pagadas (nunca media de medias)', () => {
  it('org 2: Σ arpa×facturas / Σ facturas = 90 737,50 con 21 facturas', () => {
    const arpa = computeArpa(ORG2_R2);
    expect(arpa).toBeCloseTo(90737.5, 2);
    expect(arpa).not.toBeCloseTo(104892.83, 0);
  });
  it('un mes con ARPA pero 0 facturas es incoherente y no pesa; sin facturas en ningún mes → null', () => {
    expect(computeArpa([{ arpa: 100, invoices_paid: 0 }, { arpa: 300, invoices_paid: 1 }])).toBe(300);
    expect(computeArpa([{ arpa: 100, invoices_paid: 0 }])).toBeNull();
    expect(computeArpa([])).toBeNull();
  });
  it('el resumen y la matemática comercial usan el MISMO ARPA ponderado', () => {
    const summary = summarizeRevenueMetrics(ORG2_R2);
    const math = computeRevenueMath({ months: ORG2_R2, cohorts: [], today: '2026-09-15', inputs: { acquisitionSpend: null, grossMarginPct: null } });
    expect(summary.arpa).toBeCloseTo(90737.5, 2);
    expect(math.arpa).toBeCloseTo(90737.5, 2);
    expect(summary.invoices_paid).toBe(21);
  });
});

describe('F14 r2 — revenue cobrado con la espina de meses', () => {
  it('org 135: 16 970 600 cobrados (ago + sep), 0 enlazados a oportunidad, 274 facturas', () => {
    const s = summarizeRevenueMetrics(ORG135_R2);
    expect(s.revenue_collected).toBe(16970600);
    expect(s.revenue_collected_linked).toBe(0);
    expect(s.invoices_paid).toBe(274);
    expect(s.arpa).toBeCloseTo((65902.173913043478 * 46 + 61136.40350877193 * 228) / 274, 2);
  });
  it('org 2: 3 537 885 cobrados en jul-26 aunque ese mes no tenga oportunidades', () => {
    expect(summarizeRevenueMetrics(ORG2_R2).revenue_collected).toBe(3537885);
  });
  it('los meses vacíos de la espina no convierten win rate ni ciclo en 0: siguen null («Sin datos»)', () => {
    const s = summarizeRevenueMetrics(ORG135_R2);
    expect(s.win_rate_pct).toBeNull();
    expect(s.avg_sales_cycle_days).toBeNull();
    expect(s.deals_open).toBe(19);
    expect(s.months_with_data).toBe(2);
    expect(summarizeRevenueMetrics(ORG2_R2).win_rate_pct).toBeCloseTo(33.333, 2);
  });
  it('pipeline abierto del resumen = último mes CON oportunidades abiertas (40 900), no el último mes de la espina (0)', () => {
    expect(summarizeRevenueMetrics(ORG2_R2).revenue_pipeline).toBe(40900);
    expect(summarizeRevenueMetrics(ORG135_R2).revenue_pipeline).toBe(0);
  });
});

/** fn_pipeline_funnel(2) enriquecido con `stages` — pipeline por defecto. */
const ORG2_FUNNEL = [
  { stage_id: 's0', stage_name: 'Contacto Inicial', position: 0, opportunity_count: 1, total_amount: 450000, is_won: false, is_lost: false },
  { stage_id: 's1', stage_name: 'Reunión Agendada', position: 1, opportunity_count: 1, total_amount: 300000, is_won: false, is_lost: false },
  { stage_id: 's2', stage_name: 'Propuesta Enviada', position: 2, opportunity_count: 1, total_amount: 70000, is_won: false, is_lost: false },
  { stage_id: 's4', stage_name: 'Ganado', position: 4, opportunity_count: 1, total_amount: 60000, is_won: true, is_lost: false },
  { stage_id: 's5', stage_name: 'Perdido', position: 5, opportunity_count: 2, total_amount: 51000, is_won: false, is_lost: true },
  { stage_id: 's6', stage_name: 'Primera llamada', position: 6, opportunity_count: 0, total_amount: 0, is_won: false, is_lost: false },
];

describe('F14 r2 — conversión global por la etapa GANADA, no por la última posición', () => {
  const conv = computeFunnelConversion(ORG2_FUNNEL);
  it('org 2 pipeline por defecto: 1 de 4 llegó a Ganado → 25 %', () => {
    expect(conv.overallPct).toBe(25);
    expect(conv.overallBasis).toBe('won');
  });
  it('la etapa ganada cierra la cadena: «pasa a la siguiente» es null («—») y las etapas normales posteriores se apartan con aviso', () => {
    expect(conv.stages.map((s) => s.stage_id)).toEqual(['s0', 's1', 's2', 's4']);
    expect(conv.stages[3].is_won).toBe(true);
    expect(conv.stages[3].conversionToNextPct).toBeNull();
    expect(conv.stages.map((s) => s.reached)).toEqual([4, 3, 2, 1]);
    expect(conv.ignoredAfterWon).toEqual([{ stage_id: 's6', stage_name: 'Primera llamada', count: 0 }]);
  });
  it('una etapa posterior a la ganada CON oportunidades tampoco entra en el acumulado (se avisa con su conteo)', () => {
    const c = computeFunnelConversion(ORG2_FUNNEL.map((s) => (s.stage_id === 's6' ? { ...s, opportunity_count: 3, total_amount: 900 } : s)));
    expect(c.stages.map((s) => s.reached)).toEqual([4, 3, 2, 1]);
    expect(c.overallPct).toBe(25);
    expect(c.ignoredAfterWon).toEqual([{ stage_id: 's6', stage_name: 'Primera llamada', count: 3 }]);
  });
  it('sin etapa ganada: la base es la última etapa y se declara (overallBasis = "last"); sin etapas → null', () => {
    const noWon = computeFunnelConversion(ORG2_FUNNEL.filter((s) => !s.is_won && !s.is_lost));
    expect(noWon.overallBasis).toBe('last');
    expect(noWon.ignoredAfterWon).toEqual([]);
    expect(computeFunnelConversion([]).overallBasis).toBeNull();
  });
});

describe('F14 r2 — supervivientes de la campaña de mutaciones (B18, T09, N15)', () => {
  it('B18: fin igual a inicio es un rango válido (vacío), como promete el mensaje «posterior o igual»', async () => {
    const { resolveDateRange } = await import('../dateRange');
    expect(resolveDateRange('2026-03-01', '2026-03-01', '2026-09-15')).toEqual({ start: '2026-03-01', end: '2026-03-01' });
  });
  it('T09: el peor caso exige probabilidad ≥ 90 exactamente: una etapa al 89,5 % no entra', async () => {
    const { computeForecastScenarios } = await import('../forecastScenarios');
    const stages = [{ id: 'a', probability: 89.5 }, { id: 'b', probability: 90 }];
    const opps = [{ stage_id: 'a', status: 'open', amount: 1000 }, { stage_id: 'b', status: 'open', amount: 10 }];
    expect(computeForecastScenarios(opps, stages).worst).toBe(10);
  });
  it('N15: una fila corrupta con invoices_paid negativo no pesa ni resta (ARPA = el del mes sano)', () => {
    expect(computeArpa([{ arpa: 100, invoices_paid: 2 }, { arpa: 50, invoices_paid: -1 }])).toBe(100);
    expect(computeArpa([{ arpa: 100, invoices_paid: Number.NaN }, { arpa: 300, invoices_paid: 1 }])).toBe(300);
  });
});
