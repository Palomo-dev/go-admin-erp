import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Revenue OS (FASE 14).
 *
 * Agregador de métricas de revenue que reusa las funciones RPC ya migradas:
 * - fn_revenue_metrics(p_org_id, p_start, p_end)
 * - fn_pipeline_funnel(p_org_id)
 * - fn_cohort_retention(p_org_id, p_start, p_end)
 *
 * Tablas implicadas (lectura):
 * - opportunities (status, amount, closed_at)
 * - payments (status, payment_date, amount)
 * - calls (created_at)
 * - email_messages (created_at)
 * - commission_accruals (status, amount)
 */

// ============== Tipos ==============

export interface RevenueMetricRow {
  month: string;
  deals_won: number;
  deals_lost: number;
  deals_open: number;
  revenue_won_pipeline: number;
  revenue_lost: number;
  revenue_pipeline: number;
  arpa: number;
  avg_sales_cycle_days: number;
  win_rate: number;
  revenue_collected: number;
  commissions_paid: number;
}

export interface PipelineFunnelRow {
  stage_id: string;
  stage_name: string;
  position: number;
  opportunity_count: number;
  total_amount: number;
  avg_amount: number;
}

export interface CohortRetentionRow {
  cohort_month: string;
  cohort_size: number;
  retained_m1: number;
  retained_m2: number;
  retained_m3: number;
  retained_m6: number;
  retained_m12: number;
  retention_m1_pct: number;
  retention_m2_pct: number;
  retention_m3_pct: number;
  retention_m6_pct: number;
  retention_m12_pct: number;
}

export interface RevenueKpis {
  mrr: number;
  arr: number;
  arpa: number;
  win_rate: number;
  sales_cycle_days: number;
  pipeline_value: number;
  commissions_paid: number;
}

export interface RevenueDashboard {
  revenue_metrics: RevenueMetricRow[];
  pipeline_funnel: PipelineFunnelRow[];
  cohort_retention: CohortRetentionRow[];
  kpis: RevenueKpis;
  period: {
    start: string;
    end: string;
    cohort_start: string;
  };
}

export interface KpiCard {
  pipeline_value: number;
  revenue_this_month: number;
  win_rate: number;
  open_deals: number;
  calls_this_week: number;
  emails_this_week: number;
}

// ============== Servicio ==============

/**
 * Ejecuta fn_revenue_metrics RPC.
 * Retorna métricas mensuales de revenue en el rango [startDate, endDate].
 */
export async function getRevenueMetrics(
  orgId: number,
  startDate: string,
  endDate: string,
  supabase: SupabaseClient
): Promise<RevenueMetricRow[]> {
  const { data, error } = await supabase.rpc('fn_revenue_metrics', {
    p_org_id: orgId,
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.warn('[revenueOsService] fn_revenue_metrics no disponible:', error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    month: String(row.month ?? ''),
    deals_won: Number(row.deals_won) || 0,
    deals_lost: Number(row.deals_lost) || 0,
    deals_open: Number(row.deals_open) || 0,
    revenue_won_pipeline: Number(row.revenue_won_pipeline) || 0,
    revenue_lost: Number(row.revenue_lost) || 0,
    revenue_pipeline: Number(row.revenue_pipeline) || 0,
    arpa: Number(row.arpa) || 0,
    avg_sales_cycle_days: Number(row.avg_sales_cycle_days) || 0,
    win_rate: Number(row.win_rate) || 0,
    revenue_collected: Number(row.revenue_collected) || 0,
    commissions_paid: Number(row.commissions_paid) || 0,
  }));
}

/**
 * Ejecuta fn_pipeline_funnel RPC.
 * Retorna el funnel actual de pipeline por etapa.
 */
export async function getPipelineFunnel(
  orgId: number,
  supabase: SupabaseClient
): Promise<PipelineFunnelRow[]> {
  const { data, error } = await supabase.rpc('fn_pipeline_funnel', {
    p_org_id: orgId,
  });

  if (error) {
    console.warn('[revenueOsService] fn_pipeline_funnel no disponible:', error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    stage_id: String(row.stage_id ?? ''),
    stage_name: String(row.stage_name ?? ''),
    position: Number(row.position) || 0,
    opportunity_count: Number(row.opportunity_count) || 0,
    total_amount: Number(row.total_amount) || 0,
    avg_amount: Number(row.avg_amount) || 0,
  }));
}

/**
 * Ejecuta fn_cohort_retention RPC.
 * Retorna cohortes de retención en el rango [startDate, endDate].
 */
export async function getCohortRetention(
  orgId: number,
  startDate: string,
  endDate: string,
  supabase: SupabaseClient
): Promise<CohortRetentionRow[]> {
  const { data, error } = await supabase.rpc('fn_cohort_retention', {
    p_org_id: orgId,
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.warn('[revenueOsService] fn_cohort_retention no disponible:', error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    cohort_month: String(row.cohort_month ?? ''),
    cohort_size: Number(row.cohort_size) || 0,
    retained_m1: Number(row.retained_m1) || 0,
    retained_m2: Number(row.retained_m2) || 0,
    retained_m3: Number(row.retained_m3) || 0,
    retained_m6: Number(row.retained_m6) || 0,
    retained_m12: Number(row.retained_m12) || 0,
    retention_m1_pct: Number(row.retention_m1_pct) || 0,
    retention_m2_pct: Number(row.retention_m2_pct) || 0,
    retention_m3_pct: Number(row.retention_m3_pct) || 0,
    retention_m6_pct: Number(row.retention_m6_pct) || 0,
    retention_m12_pct: Number(row.retention_m12_pct) || 0,
  }));
}

/**
 * Calcula KPIs agregados (MRR, ARR, ARPA, Win rate, Sales cycle, Pipeline value, Comisiones)
 * a partir de las filas de fn_revenue_metrics y el funnel actual.
 */
function calculateKpis(
  revenueMetrics: RevenueMetricRow[],
  funnel: PipelineFunnelRow[]
): RevenueKpis {
  // MRR: revenue_collected del último mes disponible
  const lastMonth = revenueMetrics.length > 0 ? revenueMetrics[revenueMetrics.length - 1] : null;
  const mrr = lastMonth ? lastMonth.revenue_collected : 0;
  const arr = mrr * 12;

  // ARPA: promedio del último mes
  const arpa = lastMonth ? lastMonth.arpa : 0;

  // Win rate: promedio ponderado de todos los meses
  const totalWon = revenueMetrics.reduce((sum, r) => sum + r.deals_won, 0);
  const totalLost = revenueMetrics.reduce((sum, r) => sum + r.deals_lost, 0);
  const closedDeals = totalWon + totalLost;
  const winRate = closedDeals > 0 ? (totalWon / closedDeals) * 100 : 0;

  // Sales cycle: promedio de los meses con dato
  const monthsWithCycle = revenueMetrics.filter((r) => r.avg_sales_cycle_days > 0);
  const salesCycleDays =
    monthsWithCycle.length > 0
      ? monthsWithCycle.reduce((sum, r) => sum + r.avg_sales_cycle_days, 0) /
        monthsWithCycle.length
      : 0;

  // Pipeline value: suma de total_amount del funnel
  const pipelineValue = funnel.reduce((sum, f) => sum + f.total_amount, 0);

  // Comisiones pagadas: suma de todos los meses
  const commissionsPaid = revenueMetrics.reduce((sum, r) => sum + r.commissions_paid, 0);

  return {
    mrr: Math.round(mrr),
    arr: Math.round(arr),
    arpa: Math.round(arpa),
    win_rate: Math.round(winRate * 10) / 10,
    sales_cycle_days: Math.round(salesCycleDays),
    pipeline_value: Math.round(pipelineValue),
    commissions_paid: Math.round(commissionsPaid),
  };
}

/**
 * Agrega todas las métricas de Revenue OS en una sola respuesta.
 * - Revenue metrics: últimos 12 meses
 * - Pipeline funnel: actual
 * - Cohort retention: últimos 24 meses
 * - KPIs calculados
 */
export async function getRevenueDashboard(
  orgId: number,
  supabase: SupabaseClient
): Promise<RevenueDashboard> {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);

  // Revenue metrics: últimos 12 meses
  const startMetrics = new Date(now);
  startMetrics.setMonth(startMetrics.getMonth() - 12);
  const startMetricsStr = startMetrics.toISOString().slice(0, 10);

  // Cohort retention: últimos 24 meses
  const startCohort = new Date(now);
  startCohort.setMonth(startCohort.getMonth() - 24);
  const startCohortStr = startCohort.toISOString().slice(0, 10);

  const [revenueMetrics, funnel, cohortRetention] = await Promise.all([
    getRevenueMetrics(orgId, startMetricsStr, end, supabase),
    getPipelineFunnel(orgId, supabase),
    getCohortRetention(orgId, startCohortStr, end, supabase),
  ]);

  const kpis = calculateKpis(revenueMetrics, funnel);

  return {
    revenue_metrics: revenueMetrics,
    pipeline_funnel: funnel,
    cohort_retention: cohortRetention,
    kpis,
    period: {
      start: startMetricsStr,
      end,
      cohort_start: startCohortStr,
    },
  };
}

/**
 * KPIs para las tarjetas del dashboard.
 * - Pipeline value: SUM opportunities.amount WHERE status='open'
 * - Revenue del mes: payments WHERE status='completed' AND payment_date en mes actual
 * - Win rate: won / (won + lost)
 * - Deals abiertos
 * - Llamadas esta semana
 * - Emails enviados esta semana
 */
export async function getKpiCards(
  orgId: number,
  supabase: SupabaseClient
): Promise<KpiCard> {
  const now = new Date();

  // Inicio y fin del mes actual
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString();

  // Inicio y fin de la semana actual (lunes a domingo)
  const dayOfWeek = now.getDay(); // 0 = domingo
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString();

  // Pipeline value: SUM amount de oportunidades abiertas
  const { data: openOpps, error: oppError } = await supabase
    .from('opportunities')
    .select('amount')
    .eq('organization_id', orgId)
    .eq('status', 'open');

  const pipelineValue =
    oppError || !openOpps
      ? 0
      : openOpps.reduce(
          (sum: number, o: Record<string, unknown>) => sum + ((o.amount as number) || 0),
          0
        );

  const openDeals = oppError || !openOpps ? 0 : openOpps.length;

  // Revenue del mes: payments completados en el mes actual
  const { data: payments, error: payError } = await supabase
    .from('payments')
    .select('amount')
    .eq('organization_id', orgId)
    .eq('status', 'completed')
    .gte('payment_date', monthStartStr);

  const revenueThisMonth =
    payError || !payments
      ? 0
      : payments.reduce(
          (sum: number, p: Record<string, unknown>) => sum + ((p.amount as number) || 0),
          0
        );

  // Win rate: won / (won + lost) — todas las oportunidades
  const { count: wonCount } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'won');

  const { count: lostCount } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'lost');

  const won = wonCount || 0;
  const lost = lostCount || 0;
  const closedTotal = won + lost;
  const winRate = closedTotal > 0 ? (won / closedTotal) * 100 : 0;

  // Llamadas esta semana
  const { count: callsCount } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', weekStartStr);

  // Emails enviados esta semana
  const { count: emailsCount } = await supabase
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', weekStartStr);

  return {
    pipeline_value: Math.round(pipelineValue),
    revenue_this_month: Math.round(revenueThisMonth),
    win_rate: Math.round(winRate * 10) / 10,
    open_deals: openDeals,
    calls_this_week: callsCount || 0,
    emails_this_week: emailsCount || 0,
  };
}

// ============== Instancia singleton ==============

export const revenueOsService = {
  getRevenueMetrics,
  getPipelineFunnel,
  getCohortRetention,
  getRevenueDashboard,
  getKpiCards,
};

export default revenueOsService;
