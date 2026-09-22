/// <reference types="jest" />
/**
 * F14 — filas REALES de la base (2026-09-15, solo lectura por MCP; solo ids de
 * organización) convertidas por los módulos puros en lo que la UI pinta.
 * Cada fixture es la salida literal de la RPC y, al lado, la cifra recalculada
 * a mano con SQL directo.
 *
 * Origen: tester de F14 ronda 1 (`f14Round1Tester`), actualizado en ronda 2
 * cuando `fn_revenue_metrics` fue reescrita (espina de meses, cobrado sin exigir
 * oportunidad, `revenue_collected_linked`, `invoices_paid`): org 135 cobrado
 * 16 970 600 (no 0), org 2 ARPA 90 737,50 (no 104 892,83), conversión global
 * 25 % (no 0 %). Consolidado el 2026-09-21; se conservan las 21 pruebas.
 * La espina completa de meses vive en `f14.rpcEspina.stable.test.ts`.
 */
import { computeRevenueMath, computeChurnFromCohorts, computeLtv, computePaybackMonths } from '../revenueMath';
import { computeForecastScenarios } from '../forecastScenarios';
import { computeFunnelConversion } from '../funnelConversion';
import { buildCohortTable } from '../cohortModel';
import { defaultRange, resolveDateRange } from '../dateRange';
import { summarizeRevenueMetrics } from '../../revenueOsService';
import type { RevenueMetricRow } from '../rpc';

const TODAY = '2026-09-15';

/**
 * fn_revenue_metrics(2, '2025-07-01', '2026-10-01') tras la reescritura (r2):
 * los meses con dato de la espina de 15 (los vacíos se omiten aquí; la espina
 * completa está en `f14.rpcEspina.stable.test.ts`). Los meses sin oportunidades ahora
 * llegan: ago-25 (4 facturas), nov-25 (1) y jul-26 (cobrado 3 537 885).
 */
const ORG2_METRICS: RevenueMetricRow[] = [
  { month: '2025-07-01', deals_won: 1, deals_lost: 2, deals_open: 5, revenue_won_pipeline: 60000, revenue_lost: 51000, revenue_pipeline: 820705, arpa: 99285.666666666667, avg_sales_cycle_days: 18.8617082708796296, win_rate: 0.333333333333333, revenue_collected: 0, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 9 },
  { month: '2025-08-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: 59500, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 0, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 4 },
  { month: '2025-11-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: 416.5, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 0, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 1 },
  { month: '2026-01-01', deals_won: 0, deals_lost: 0, deals_open: 1, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 40900, arpa: 110500.002857142857, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 0, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 7 },
  { month: '2026-07-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: null, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 3537885, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 0 },
  { month: '2026-09-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: null, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 0, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 0 },
];

/** fn_revenue_metrics(135, '2025-10-01', '2026-10-01') (rango por defecto de la UI hoy), meses con dato de la espina. */
const ORG135_METRICS: RevenueMetricRow[] = [
  { month: '2026-08-01', deals_won: 0, deals_lost: 0, deals_open: 0, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: 65902.173913043478, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 3031500, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 46 },
  { month: '2026-09-01', deals_won: 0, deals_lost: 0, deals_open: 19, revenue_won_pipeline: 0, revenue_lost: 0, revenue_pipeline: 0, arpa: 61136.40350877193, avg_sales_cycle_days: null, win_rate: null, revenue_collected: 13939100, commissions_paid: 0, revenue_collected_linked: 0, invoices_paid: 228 },
];

/** fn_pipeline_funnel(2) enriquecido con `stages` — pipeline por defecto («4462350e…»). */
const ORG2_FUNNEL_DEFAULT = [
  { stage_id: 's0', stage_name: 'Contacto Inicial', position: 0, opportunity_count: 1, total_amount: 450000, is_won: false, is_lost: false, pipeline_id: 'p1' },
  { stage_id: 's1', stage_name: 'Reunión Agendada', position: 1, opportunity_count: 1, total_amount: 300000, is_won: false, is_lost: false, pipeline_id: 'p1' },
  { stage_id: 's2', stage_name: 'Propuesta Enviada', position: 2, opportunity_count: 1, total_amount: 70000, is_won: false, is_lost: false, pipeline_id: 'p1' },
  { stage_id: 's4', stage_name: 'Ganado', position: 4, opportunity_count: 1, total_amount: 60000, is_won: true, is_lost: false, pipeline_id: 'p1' },
  { stage_id: 's5', stage_name: 'Perdido', position: 5, opportunity_count: 2, total_amount: 51000, is_won: false, is_lost: true, pipeline_id: 'p1' },
  // Etapa normal creada DESPUÉS de la ganada (posición 6, probabilidad 90, 0 oportunidades). Caso real.
  { stage_id: 's6', stage_name: 'Primera llamada', position: 6, opportunity_count: 0, total_amount: 0, is_won: false, is_lost: false, pipeline_id: 'p1' },
];

/** fn_cohort_retention(135, '2024-10-01', '2026-10-01'): coincide fila a fila con el SQL a mano. */
const ORG135_COHORTS = [
  { cohort_month: '2026-08-01', cohort_size: 45, retained_m1: 0, retained_m2: 0, retained_m3: 0, retained_m6: 0, retained_m12: 0, retention_m1_pct: 0, retention_m2_pct: 0, retention_m3_pct: 0, retention_m6_pct: 0, retention_m12_pct: 0 },
  { cohort_month: '2026-09-01', cohort_size: 5, retained_m1: 0, retained_m2: 0, retained_m3: 0, retained_m6: 0, retained_m12: 0, retention_m1_pct: 0, retention_m2_pct: 0, retention_m3_pct: 0, retention_m6_pct: 0, retention_m12_pct: 0 },
];

describe('F14 · filas reales (de tester r1) — rango por defecto', () => {
  it('hoy 2026-09-15 en Bogotá → [2025-10-01, 2026-10-01) (12 cerrados + el mes en curso, fin exclusivo)', () => {
    expect(defaultRange(TODAY)).toEqual({ start: '2025-10-01', end: '2026-10-01' });
    expect(resolveDateRange(null, null, TODAY)).toEqual({ start: '2025-10-01', end: '2026-10-01' });
  });
  it('rango de 36 meses exactos pasa; 36 meses y un día → 400', () => {
    expect(() => resolveDateRange('2023-10-01', '2026-10-01', TODAY)).not.toThrow();
    expect(() => resolveDateRange('2023-09-30', '2026-10-01', TODAY)).toThrow(/36 meses/);
  });
});

describe('F14 · filas reales (de tester r1) — org 2 (1 ganada, 2 perdidas): RPC vs SQL a mano vs UI', () => {
  const summary = summarizeRevenueMetrics(ORG2_METRICS);

  it('win rate 33,3 % = 1 / (1 + 2), igual que el SQL a mano', () => {
    expect(summary.win_rate_pct).toBeCloseTo(33.333, 2);
    expect(summary.deals_won).toBe(1);
    expect(summary.deals_lost).toBe(2);
  });
  it('ciclo medio 18,86 días = closed_at − created_at de la única ganada', () => {
    expect(summary.avg_sales_cycle_days).toBeCloseTo(18.8617, 3);
  });
  it('ganado en pipeline 60 000 y perdido 51 000 (48 000 + 3 000)', () => {
    expect(summary.revenue_won_pipeline).toBe(60000);
    expect(summary.revenue_lost).toBe(51000);
  });
  it('r2 (antes LIMITACIÓN RPC): revenue cobrado 3 537 885 de jul-2026 aunque ninguna factura tenga opportunity_id; 0 enlazado a oportunidad', () => {
    expect(summary.revenue_collected).toBe(3537885);
    expect(summary.revenue_collected_linked).toBe(0);
  });
  it('r2 (antes LIMITACIÓN RPC): ARPA = 90 737,50, el de las 21 facturas pagadas reales (9 + 4 + 1 + 7), no la media de medias 104 892,83', () => {
    expect(summary.invoices_paid).toBe(21);
    expect(summary.arpa).toBeCloseTo(90737.5, 2);
    expect(summary.arpa).not.toBeCloseTo(104892.83, 0);
  });
  it('comisiones pagadas 0: no hay ninguna comisión en estado paid en toda la plataforma', () => {
    expect(summary.commissions_paid).toBe(0);
  });
});

describe('F14 · filas reales (de tester r1) — embudo org 2, pipeline por defecto', () => {
  const conv = computeFunnelConversion(ORG2_FUNNEL_DEFAULT);

  it('acumulado «llegó o más allá» sin perdidas: 4, 3, 2, 1 (la cadena termina en la ganada); perdidas 2 por 51 000 aparte', () => {
    expect(conv.stages.map((s) => s.reached)).toEqual([4, 3, 2, 1]);
    expect(conv.lost).toEqual({ count: 2, amount: 51000 });
    expect(conv.stages[3].is_won).toBe(true);
  });
  it('r2 (antes HALLAZGO): la conversión global es la de la etapa GANADA: 1 de 4 → 25 %; «Primera llamada» (posición 6) queda fuera con aviso', () => {
    expect(conv.overallPct).toBe(25);
    expect(conv.overallBasis).toBe('won');
    expect(conv.ignoredAfterWon.map((s) => s.stage_name)).toEqual(['Primera llamada']);
  });
});

describe('F14 · filas reales (de tester r1) — forecast org 2, pipeline por defecto (probabilidades reales 0/0/50/0/0/90)', () => {
  const stages = [
    { id: 's0', probability: 0 },
    { id: 's1', probability: 0 },
    { id: 's2', probability: 50 },
    { id: 's4', probability: 0 },
    { id: 's5', probability: 0 },
    { id: 's6', probability: 90 },
  ];
  const opps = [
    { stage_id: 's0', status: 'open', amount: 450000 },
    { stage_id: 's1', status: 'open', amount: 300000 },
    { stage_id: 's2', status: 'open', amount: 70000 },
    { stage_id: 's4', status: 'won', amount: 60000 },
    { stage_id: 's5', status: 'lost', amount: 48000 },
    { stage_id: 's5', status: 'lost', amount: 3000 },
  ];
  it('esperado 35 000 (= 70 000 × 50 / 100), mejor 70 000, peor 0, abiertas 3 por 820 000 — igual que el SQL', () => {
    const s = computeForecastScenarios(opps, stages);
    expect(s).toMatchObject({ expected: 35000, best: 70000, worst: 0, openTotal: 820000, openCount: 3 });
  });
  it('el código anterior de ForecastDashboard habría dado 3 500 000 (×100)', () => {
    const old = opps.filter((o) => o.status === 'open').reduce((sum, o) => sum + o.amount * (stages.find((s) => s.id === o.stage_id)?.probability || 0), 0);
    expect(old).toBe(3500000);
    expect(computeForecastScenarios(opps, stages).expected * 100).toBe(old);
  });
});

describe('F14 · filas reales (de tester r1) — cohortes org 135 (45 + 5 clientes) el 2026-09-15', () => {
  it('ago-2026: M1 aún no cerró (necesita 2026-10-01) → «—», sin color; sep-2026 igual', () => {
    const t = buildCohortTable(ORG135_COHORTS, TODAY);
    expect(t.totalCustomers).toBe(50);
    for (const row of t.rows) {
      expect(row.cells.map((c) => c.label)).toEqual(['—', '—', '—', '—']);
      expect(row.cells.every((c) => c.intensity === 0 && !c.observed)).toBe(true);
    }
  });
  it('churn null (ninguna cohorte observable) y el 2026-10-01 la de agosto pasa a 100 % (0 de 45 volvieron en sep)', () => {
    expect(computeChurnFromCohorts(ORG135_COHORTS, TODAY)).toBeNull();
    expect(computeChurnFromCohorts(ORG135_COHORTS, '2026-10-01')).toBe(100);
  });
});

describe('F14 · filas reales (de tester r1) — matemática comercial con las filas reales de org 135 y org 2', () => {
  it('org 135 sin insumos: ARPA 61 936,50 (274 facturas ponderadas: 46 a 65 902,17 y 228 a 61 136,40); CAC/LTV/payback/churn/NRR «Sin datos» con motivo, nunca 0', () => {
    const m = computeRevenueMath({ months: ORG135_METRICS, cohorts: ORG135_COHORTS, today: TODAY, inputs: { acquisitionSpend: null, grossMarginPct: null } });
    expect(m.arpa).toBeCloseTo((65902.173913043478 * 46 + 61136.40350877193 * 228) / 274, 3);
    expect(m.revenueCollected).toBe(16970600);
    expect(m.newCustomers).toBe(0);
    expect(m.cac).toBeNull();
    expect(m.ltv).toBeNull();
    expect(m.paybackMonths).toBeNull();
    expect(m.churnRatePct).toBeNull();
    expect(m.netRevenueRetentionPct).toBeNull();
    expect(m.missing.cac).toMatch(/gasto de adquisición/i);
    expect(m.missing.ltv).toMatch(/margen bruto/i);
    expect(m.missing.churnRatePct).toMatch(/cohorte/i);
    expect(m.missing.netRevenueRetentionPct).toMatch(/RPC/);
  });
  it('org 2 con gasto 300 000 y margen 40 %: CAC 300 000 (1 ganada); LTV y payback quedan «Sin datos» por churn no observable, con motivo; ningún 0', () => {
    const m = computeRevenueMath({ months: ORG2_METRICS, cohorts: [], today: TODAY, inputs: { acquisitionSpend: 300000, grossMarginPct: 40 } });
    expect(m.cac).toBe(300000);
    expect(m.ltv).toBeNull();
    expect(m.missing.ltv).toMatch(/churn/i);
    // payback sí se calcula (no depende del churn): 300 000 / (90 737,50 × 0,4) = 8,27 meses (r2: ARPA ponderado)
    expect(m.paybackMonths).toBeCloseTo(300000 / (90737.5 * 0.4), 3);
    expect(m.ltvCacRatio).toBeNull();
  });
  it('unidades: churn en % (no fracción) y payback en meses coherente con LTV (ARPA mensual × margen)', () => {
    // churn 5 % → vida 20 meses → LTV = 100 × 0,4 × 20 = 800; con churn como fracción 0,05 daría 800 × 100.
    expect(computeLtv({ arpa: 100, grossMarginPct: 40, churnRatePct: 5 })).toBeCloseTo(800, 9);
    expect(computeLtv({ arpa: 100, grossMarginPct: 40, churnRatePct: 0.05 })).toBeCloseTo(80000, 6);
    // payback: CAC 200 / (100 × 0,4) = 5 meses; LTV/CAC = 800/200 = 4 → 4 × 5 = 20 = vida (1/churn): coherente.
    expect(computePaybackMonths({ cac: 200, arpa: 100, grossMarginPct: 40 })).toBe(5);
  });
  it('margen 40 (%) y margen 0,4 (fracción) NO dan lo mismo: la UI pide 0–100 y el servidor rechaza > 100', () => {
    expect(computeLtv({ arpa: 100, grossMarginPct: 0.4, churnRatePct: 5 })).toBeCloseTo(8, 9);
    expect(computeLtv({ arpa: 100, grossMarginPct: 140, churnRatePct: 5 })).toBeNull();
  });
});

describe('F14 · filas reales (de tester r1) — supervivientes de la campaña de mutaciones (T07, T11, T16)', () => {
  it('T11: el pipeline abierto del resumen es el del ÚLTIMO mes con oportunidades abiertas (40 900), no la suma de meses (861 605) ni el último mes de la espina (0)', () => {
    const s = summarizeRevenueMetrics(ORG2_METRICS);
    expect(s.revenue_pipeline).toBe(40900);
    expect(s.revenue_pipeline).not.toBe(820705 + 40900);
  });

  it('T07: una RPC que responde algo que no es lista lanza RevenueOsError 502 (nunca [] silencioso)', async () => {
    const { fetchRevenueMetrics, RevenueOsError } = await import('../rpc');
    const supabase = { rpc: async () => ({ data: { unexpected: true }, error: null }) } as never;
    await expect(fetchRevenueMetrics(2, '2025-07-01', '2026-10-01', supabase)).rejects.toBeInstanceOf(RevenueOsError);
    await expect(fetchRevenueMetrics(2, '2025-07-01', '2026-10-01', supabase)).rejects.toMatchObject({ statusCode: 502 });
  });

  it('T16: el cobrado del mes en las tarjetas KPI solo suma pagos completed (un pending de 999 999 no entra)', async () => {
    const { createFakeSupabase } = await import('./revenueOsFakeSupabase');
    const { getKpiCards } = await import('../kpiCards');
    const db = {
      rpcCalls: [],
      writes: [],
      reads: [],
      rpc: {},
      rows: {
        opportunities: [{ id: 'o1', organization_id: 2, status: 'open', amount: 10 }],
        payments: [
          { id: 'p-ok', organization_id: 2, status: 'completed', amount: 100, payment_date: '2099-12-30T15:00:00Z' },
          { id: 'p-pending', organization_id: 2, status: 'pending', amount: 999999, payment_date: '2099-12-30T15:00:00Z' },
          { id: 'p-failed', organization_id: 2, status: 'failed', amount: 555555, payment_date: '2099-12-30T15:00:00Z' },
        ],
        calls: [],
        email_messages: [],
      },
    };
    const supabase = createFakeSupabase(db) as never;
    const kpis = await getKpiCards(2, 'America/Bogota', supabase);
    expect(kpis.revenue_this_month).toBe(100); // con el filtro roto daría 1 555 654
    const readsPayments = db.reads.filter((r: { table: string }) => r.table === 'payments');
    expect(readsPayments.some((r: { filters: Record<string, unknown> }) => r.filters['eq:status'] === 'completed')).toBe(true);
  });
});
