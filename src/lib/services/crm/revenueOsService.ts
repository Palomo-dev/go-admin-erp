import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import { todayInTz } from '@/lib/utils/dateDisplay';
import {
  RevenueOsError,
  fetchCohortRetention,
  fetchPipelineFunnel,
  fetchPipelines,
  fetchRevenueMetrics,
  type CohortRetentionRow,
  type PipelineFunnelRow,
  type RevenueMetricRow,
} from './revenueOs/rpc';
import { addMonthsPlain, type DateRange } from './revenueOs/dateRange';
import { computeArpa, computeRevenueMath, type RevenueMathResult } from './revenueOs/revenueMath';
import { getRevenueInputs, type RevenueInputs } from './revenueOs/revenueInputs';
import { getOrgBaseCurrency } from './salesTargetService';

/**
 * Servicio CRM — Revenue OS (FASE 14).
 *
 * Agrega las RPC ya migradas (`fn_revenue_metrics`, `fn_pipeline_funnel`,
 * `fn_cohort_retention`), los insumos manuales de `organization_settings` y la
 * matemática comercial pura (`revenueOs/revenueMath.ts`).
 *
 * Módulos puros, testeados aparte: `revenueOs/dateRange.ts`,
 * `revenueOs/revenueMath.ts`, `revenueOs/forecastScenarios.ts`,
 * `revenueOs/funnelConversion.ts`, `revenueOs/cohortModel.ts`.
 *
 * Errores: toda RPC o lectura fallida lanza `RevenueOsError` (502). Este
 * servicio ya no devuelve `[]` en silencio.
 */

export { RevenueOsError };
export type { CohortRetentionRow, PipelineFunnelRow, RevenueMetricRow, RevenueInputs, RevenueMathResult, DateRange };
export { getKpiCards, type KpiCard } from './revenueOs/kpiCards';
export { getRevenueInputs, saveRevenueInputs, validateRevenueInputs, RevenueInputsValidationError } from './revenueOs/revenueInputs';
export { resolveDateRange, defaultRange, DateRangeError } from './revenueOs/dateRange';

/** Meses hacia atrás para las cohortes (necesitan más historia que las métricas). */
export const COHORT_LOOKBACK_MONTHS = 24;

export interface RevenueSummary {
  /** Σ pagos `completed` de facturas de la organización (con o sin oportunidad). */
  revenue_collected: number;
  /** Parte de `revenue_collected` con factura enlazada a una oportunidad. */
  revenue_collected_linked: number;
  revenue_won_pipeline: number;
  revenue_lost: number;
  /** Valor abierto del último mes CON oportunidades abiertas (no acumulable; 0 si ninguno). */
  revenue_pipeline: number;
  deals_won: number;
  deals_lost: number;
  deals_open: number;
  /** % 0–100; null si no hubo cierres en el periodo. */
  win_rate_pct: number | null;
  /** Media de los meses con ciclo observado; null si no hubo ganadas. */
  avg_sales_cycle_days: number | null;
  /** Ticket medio por factura pagada, ponderado por `invoices_paid` (`computeArpa`); null sin facturas. */
  arpa: number | null;
  /** Facturas pagadas del periodo (peso del ARPA). */
  invoices_paid: number;
  commissions_paid: number;
  /** Meses del rango con alguna actividad (la RPC devuelve la espina completa, con meses en 0/null). */
  months_with_data: number;
}

/** Alias de compatibilidad: `src/lib/services/crm/index.ts` reexporta `RevenueKpis`. */
export type RevenueKpis = RevenueSummary;

export interface RevenueDashboard {
  period: { start: string; end: string; today: string; timezone: string };
  /** Moneda base (`organization_currencies.is_base`); null si la organización no la configuró: la UI pinta cifras sin símbolo y lo dice. */
  currency: string | null;
  /** Nombre de cada pipeline de la organización por id (para el selector del embudo). */
  pipeline_names: Record<string, string>;
  revenue_metrics: RevenueMetricRow[];
  summary: RevenueSummary;
  pipeline_funnel: PipelineFunnelRow[];
  cohort_retention: CohortRetentionRow[];
  cohort_period: { start: string; end: string };
  inputs: RevenueInputs;
  math: RevenueMathResult;
}

/**
 * Zona horaria de la organización leída con el cliente de sesión
 * (`organizations.timezone`, NOT NULL). `getOrganizationTimezone` del
 * servicio canónico usa el cliente de navegador y no sirve en rutas.
 */
export async function getOrgTimezoneServer(orgId: number, supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.from('organizations').select('timezone').eq('id', orgId).maybeSingle();
  if (error) throw new RevenueOsError(`organizations: ${error.message}`);
  const tz = typeof data?.timezone === 'string' ? data.timezone : '';
  try {
    if (tz) {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    }
  } catch {
    /* zona inválida en BD: cae al fallback */
  }
  return DEFAULT_TIMEZONE;
}

const mean = (values: number[]): number | null => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Un mes de la espina «tiene dato» si trae alguna oportunidad, factura, pago o comisión. */
export function monthHasData(r: RevenueMetricRow): boolean {
  return (
    r.deals_won + r.deals_lost + r.deals_open > 0 ||
    r.revenue_collected > 0 ||
    r.invoices_paid > 0 ||
    r.commissions_paid > 0 ||
    r.revenue_won_pipeline + r.revenue_lost + r.revenue_pipeline > 0
  );
}

/** Resume las filas mensuales de `fn_revenue_metrics`. Puro. */
export function summarizeRevenueMetrics(rows: RevenueMetricRow[]): RevenueSummary {
  const sum = (pick: (r: RevenueMetricRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const won = sum((r) => r.deals_won);
  const lost = sum((r) => r.deals_lost);
  const closed = won + lost;
  const cycles = rows.map((r) => r.avg_sales_cycle_days).filter((v): v is number => v !== null && v > 0);
  const withOpen = rows.filter((r) => r.deals_open > 0 || r.revenue_pipeline > 0);
  const lastOpen = withOpen.length > 0 ? withOpen[withOpen.length - 1] : null;
  return {
    revenue_collected: sum((r) => r.revenue_collected),
    revenue_collected_linked: sum((r) => r.revenue_collected_linked),
    revenue_won_pipeline: sum((r) => r.revenue_won_pipeline),
    revenue_lost: sum((r) => r.revenue_lost),
    revenue_pipeline: lastOpen ? lastOpen.revenue_pipeline : 0,
    deals_won: won,
    deals_lost: lost,
    deals_open: sum((r) => r.deals_open),
    win_rate_pct: closed > 0 ? (won / closed) * 100 : null,
    avg_sales_cycle_days: mean(cycles),
    arpa: computeArpa(rows),
    invoices_paid: sum((r) => r.invoices_paid),
    commissions_paid: sum((r) => r.commissions_paid),
    months_with_data: rows.filter(monthHasData).length,
  };
}

/**
 * Moneda base (`organization_currencies.is_base`) con el helper único de F13.
 * `null` si no está configurada (la UI lo declara); un error de lectura es 502
 * como cualquier otra lectura del panel, no un `null` disimulado.
 */
export async function getRevenueCurrency(orgId: number, supabase: SupabaseClient): Promise<string | null> {
  try {
    return await getOrgBaseCurrency(orgId, supabase);
  } catch (err) {
    throw new RevenueOsError(`organization_currencies: ${err instanceof Error ? err.message : 'error desconocido'}`);
  }
}

export async function getRevenueMetrics(orgId: number, start: string, end: string, supabase: SupabaseClient): Promise<RevenueMetricRow[]> {
  return fetchRevenueMetrics(orgId, start, end, supabase);
}

export async function getPipelineFunnel(orgId: number, supabase: SupabaseClient): Promise<PipelineFunnelRow[]> {
  return fetchPipelineFunnel(orgId, supabase);
}

export async function getCohortRetention(orgId: number, start: string, end: string, supabase: SupabaseClient): Promise<CohortRetentionRow[]> {
  return fetchCohortRetention(orgId, start, end, supabase);
}

/**
 * Panel completo para `[range.start, range.end)` (fin exclusivo, como las RPC).
 * Las cohortes se piden desde 24 meses antes del fin para que M6/M12 tengan
 * historia; `today` (YYYY-MM-DD en la zona de la org) decide qué celdas son
 * observables y qué cohortes cuentan para el churn.
 */
export async function getRevenueDashboard(orgId: number, range: DateRange, timezone: string, supabase: SupabaseClient): Promise<RevenueDashboard> {
  const today = todayInTz(timezone);
  const cohortStart = addMonthsPlain(range.end, -COHORT_LOOKBACK_MONTHS);
  const pipelines = await fetchPipelines(orgId, supabase);
  const [revenueMetrics, funnel, cohorts, inputs, currency] = await Promise.all([
    fetchRevenueMetrics(orgId, range.start, range.end, supabase),
    fetchPipelineFunnel(orgId, supabase, pipelines),
    fetchCohortRetention(orgId, cohortStart, range.end, supabase),
    getRevenueInputs(orgId, supabase),
    getRevenueCurrency(orgId, supabase),
  ]);
  const pipelineNames: Record<string, string> = {};
  for (const p of pipelines) if (p.name) pipelineNames[p.id] = p.name;

  const math = computeRevenueMath({
    months: revenueMetrics.map((m) => ({ arpa: m.arpa, invoices_paid: m.invoices_paid, deals_won: m.deals_won, revenue_collected: m.revenue_collected })),
    cohorts: cohorts.map((c) => ({ cohort_month: c.cohort_month, cohort_size: c.cohort_size, retained_m1: c.retained_m1 })),
    today,
    inputs: { acquisitionSpend: inputs.acquisition_spend, grossMarginPct: inputs.gross_margin_pct },
  });

  return {
    period: { start: range.start, end: range.end, today, timezone },
    currency,
    pipeline_names: pipelineNames,
    revenue_metrics: revenueMetrics,
    summary: summarizeRevenueMetrics(revenueMetrics),
    pipeline_funnel: funnel,
    cohort_retention: cohorts,
    cohort_period: { start: cohortStart, end: range.end },
    inputs,
    math,
  };
}

export const revenueOsService = {
  getRevenueMetrics,
  getPipelineFunnel,
  getCohortRetention,
  getRevenueDashboard,
  getOrgTimezoneServer,
  getRevenueCurrency,
  summarizeRevenueMetrics,
};

export default revenueOsService;
