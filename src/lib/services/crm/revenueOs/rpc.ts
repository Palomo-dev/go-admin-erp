/**
 * F14 — llamadas a las RPC de Revenue OS con errores visibles.
 *
 * Funciones verificadas en `pg_proc` (2026-09-15, SECURITY INVOKER, RLS aplica):
 * - fn_revenue_metrics(p_org_id int, p_start date, p_end date) — reescrita el
 *   2026-09-15 (migración `20260915120000_f14_fn_revenue_metrics_espina_de_meses`):
 *   devuelve TODOS los meses del rango (espina con `generate_series`),
 *   `revenue_collected` suma los pagos `completed` de facturas de la organización
 *   sin exigir `opportunity_id`, y añade `revenue_collected_linked` (solo
 *   facturas con oportunidad) e `invoices_paid` (facturas `paid` del mes, el
 *   peso del ARPA).
 * - fn_pipeline_funnel(p_org_id int)
 * - fn_cohort_retention(p_org_id int, p_start date, p_end date)
 *
 * Antes, un error de RPC devolvía `[]` con un aviso en consola: el panel
 * mostraba «sin datos» cuando en realidad la consulta había fallado. Ahora
 * cualquier error lanza `RevenueOsError` (502) con el nombre de la función y
 * el mensaje de PostgREST, y la ruta lo devuelve tal cual.
 *
 * Los `null` de la base (win_rate sin cierres, arpa sin facturas, ciclo sin
 * ganadas, avg_amount sin oportunidades) se conservan como `null`: un 0 en su
 * lugar sería una cifra inventada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class RevenueOsError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(message: string, statusCode = 502, code = 'RPC_FAILED') {
    super(message);
    this.name = 'RevenueOsError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface RevenueMetricRow {
  /** YYYY-MM-DD, primer día del mes (columna `date`). */
  month: string;
  deals_won: number;
  deals_lost: number;
  deals_open: number;
  revenue_won_pipeline: number;
  revenue_lost: number;
  revenue_pipeline: number;
  arpa: number | null;
  avg_sales_cycle_days: number | null;
  /** Fracción 0–1 tal como la devuelve la RPC; null sin cierres en el mes. */
  win_rate: number | null;
  /** Pagos `completed` de facturas de la organización en el mes (con o sin oportunidad). */
  revenue_collected: number;
  commissions_paid: number;
  /** Parte de `revenue_collected` cuya factura tiene `opportunity_id`. */
  revenue_collected_linked: number;
  /** Facturas `paid` del mes: peso del `arpa` al ponderar el periodo. */
  invoices_paid: number;
}

export interface PipelineFunnelRow {
  stage_id: string;
  stage_name: string;
  position: number;
  opportunity_count: number;
  total_amount: number;
  avg_amount: number | null;
  /** Enriquecido desde `stages` (la RPC no lo devuelve). */
  pipeline_id: string | null;
  is_won: boolean;
  is_lost: boolean;
  probability: number | null;
}

export interface CohortRetentionRow {
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

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** `date` llega como YYYY-MM-DD; si llegara con hora, se queda el día tal cual (no es un timestamptz). */
const plainDay = (v: unknown): string => String(v ?? '').slice(0, 10);

async function callRpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>): Promise<Raw[]> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new RevenueOsError(`${name}: ${error.message || 'error desconocido'}`);
  }
  if (!Array.isArray(data)) {
    throw new RevenueOsError(`${name}: respuesta inesperada (no es una lista)`);
  }
  return data as Raw[];
}

export async function fetchRevenueMetrics(orgId: number, start: string, end: string, supabase: SupabaseClient): Promise<RevenueMetricRow[]> {
  const rows = await callRpc(supabase, 'fn_revenue_metrics', { p_org_id: orgId, p_start: start, p_end: end });
  return rows.map((row) => ({
    month: plainDay(row.month),
    deals_won: num(row.deals_won),
    deals_lost: num(row.deals_lost),
    deals_open: num(row.deals_open),
    revenue_won_pipeline: num(row.revenue_won_pipeline),
    revenue_lost: num(row.revenue_lost),
    revenue_pipeline: num(row.revenue_pipeline),
    arpa: numOrNull(row.arpa),
    avg_sales_cycle_days: numOrNull(row.avg_sales_cycle_days),
    win_rate: numOrNull(row.win_rate),
    revenue_collected: num(row.revenue_collected),
    commissions_paid: num(row.commissions_paid),
    revenue_collected_linked: num(row.revenue_collected_linked),
    invoices_paid: num(row.invoices_paid),
  }));
}

interface StageMeta {
  pipeline_id: string | null;
  is_won: boolean;
  is_lost: boolean;
  probability: number | null;
}

export interface PipelineRef {
  id: string;
  name: string;
}

/** Pipelines de la organización (id y nombre). Única lectura de `pipelines` del panel. */
export async function fetchPipelines(orgId: number, supabase: SupabaseClient): Promise<PipelineRef[]> {
  const { data, error } = await supabase.from('pipelines').select('id, name').eq('organization_id', orgId);
  if (error) throw new RevenueOsError(`pipelines: ${error.message}`);
  return ((data ?? []) as Raw[]).map((p) => ({ id: String(p.id), name: typeof p.name === 'string' ? p.name.trim() : '' }));
}

/**
 * `stages` no tiene `organization_id`: se resuelven los pipelines de la org y
 * luego sus etapas. Dos lecturas pequeñas con filtro explícito (además del RLS).
 */
async function fetchStageMeta(pipelines: PipelineRef[], supabase: SupabaseClient): Promise<Map<string, StageMeta>> {
  const ids = pipelines.map((p) => p.id);
  const meta = new Map<string, StageMeta>();
  if (ids.length === 0) return meta;
  const { data: stages, error: sErr } = await supabase
    .from('stages')
    .select('id, pipeline_id, is_won, is_lost, probability')
    .in('pipeline_id', ids);
  if (sErr) throw new RevenueOsError(`stages: ${sErr.message}`);
  for (const s of (stages ?? []) as Raw[]) {
    meta.set(String(s.id), {
      pipeline_id: s.pipeline_id ? String(s.pipeline_id) : null,
      is_won: s.is_won === true,
      is_lost: s.is_lost === true,
      probability: numOrNull(s.probability),
    });
  }
  return meta;
}

/** `pipelines` es opcional: quien ya los leyó (el panel) los pasa y se ahorra la lectura. */
export async function fetchPipelineFunnel(orgId: number, supabase: SupabaseClient, pipelines?: PipelineRef[]): Promise<PipelineFunnelRow[]> {
  const [rows, meta] = await Promise.all([
    callRpc(supabase, 'fn_pipeline_funnel', { p_org_id: orgId }),
    (pipelines ? Promise.resolve(pipelines) : fetchPipelines(orgId, supabase)).then((p) => fetchStageMeta(p, supabase)),
  ]);
  return rows.map((row) => {
    const id = String(row.stage_id ?? '');
    const m = meta.get(id);
    return {
      stage_id: id,
      stage_name: String(row.stage_name ?? ''),
      position: num(row.position),
      opportunity_count: num(row.opportunity_count),
      total_amount: num(row.total_amount),
      avg_amount: numOrNull(row.avg_amount),
      pipeline_id: m?.pipeline_id ?? null,
      is_won: m?.is_won ?? false,
      is_lost: m?.is_lost ?? false,
      probability: m?.probability ?? null,
    };
  });
}

export async function fetchCohortRetention(orgId: number, start: string, end: string, supabase: SupabaseClient): Promise<CohortRetentionRow[]> {
  const rows = await callRpc(supabase, 'fn_cohort_retention', { p_org_id: orgId, p_start: start, p_end: end });
  return rows.map((row) => ({
    cohort_month: plainDay(row.cohort_month),
    cohort_size: num(row.cohort_size),
    retained_m1: num(row.retained_m1),
    retained_m2: num(row.retained_m2),
    retained_m3: num(row.retained_m3),
    retained_m6: num(row.retained_m6),
    retained_m12: num(row.retained_m12),
    retention_m1_pct: numOrNull(row.retention_m1_pct),
    retention_m2_pct: numOrNull(row.retention_m2_pct),
    retention_m3_pct: numOrNull(row.retention_m3_pct),
    retention_m6_pct: numOrNull(row.retention_m6_pct),
    retention_m12_pct: numOrNull(row.retention_m12_pct),
  }));
}
