import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bandForScore,
  buildHealthAlerts,
  DEFAULT_BANDS,
  normalizeBand,
  parseHealthConfig,
  scoreFromConfig,
  shouldWriteSnapshot,
  type HealthAlert,
  type HealthBand,
  type HealthConfigJson,
  type HealthRpcRow,
} from './healthBands';

/**
 * F11 r2 — health score: UN SOLO cálculo para la lista, el detalle, «Recalcular»,
 * «Medir ahora» y el cron: `fn_customer_health(p_org_id, p_customer_id)` +
 * `health_score_configs.config` (`composeHealthResult`). Este módulo no
 * importa el cliente de navegador: lo usan las rutas (sesión, RLS), el cron
 * (service role) y la fachada `healthScoreService.ts` (solo la parte pura).
 *
 * La vista materializada de salud no existe para la aplicación: era una vista sin RLS con
 * un cálculo distinto (compras 90 d / LTV total). Guardarraíl en
 * `src/__tests__/guardrails.test.ts`.
 */

export type { HealthBand } from './healthBands';

export interface HealthScoreResult {
  customer_id: string;
  customer_name: string;
  score: number;
  band: HealthBand;
  indicators: { key: string; label: string; weight: number; value: number; score: number; weightedScore: number }[];
  /** Fila real de `fn_customer_health` (para alertas y detalle). */
  raw?: HealthRpcRow;
  alerts?: HealthAlert[];
}

export interface HealthSnapshot {
  id: string;
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: Record<string, number>;
  created_at: string;
}

/**
 * Etiqueta honesta por fuente real. La config sembrada dice «Frecuencia
 * (compras 90d)» y «LTV total», pero `indicatorSourceValue` alimenta esas
 * claves con `invoices_12m` y `revenue_12m` (la RPC no tiene ventana de 90 d
 * ni LTV histórico). Decisión r2: la UI nombra lo que mide; una clave
 * desconocida conserva la etiqueta de la config.
 */
const SOURCE_LABELS: Record<string, string> = {
  recency: 'Días desde la última factura',
  days_since_last_invoice: 'Días desde la última factura',
  frequency: 'Facturas (12 m)',
  invoices_12m: 'Facturas (12 m)',
  ltv: 'Ingresos (12 m)',
  revenue_12m: 'Ingresos (12 m)',
  avg_ticket: 'Ticket promedio (12 m)',
  activity: 'Días desde la última actividad',
  days_since_last_activity: 'Días desde la última actividad',
  receivables: 'Proporción de cartera vencida',
  overdue: 'Proporción de cartera vencida',
  overdue_ratio: 'Proporción de cartera vencida',
  overdue_balance: 'Saldo vencido',
};

export function honestIndicatorLabel(key: string, configLabel: string): string {
  return SOURCE_LABELS[key] ?? configLabel;
}

const RPC_INDICATOR_LABELS: Array<[keyof HealthRpcRow, string]> = [
  ['invoices_12m', 'Facturas (12 m)'],
  ['revenue_12m', 'Ingresos (12 m)'],
  ['days_since_last_invoice', 'Días desde la última factura'],
  ['days_since_last_activity', 'Días desde la última actividad'],
  ['overdue_balance', 'Saldo vencido'],
  ['overdue_ratio', 'Proporción de cartera vencida'],
];

export function toHealthRpcRow(row: Record<string, unknown>): HealthRpcRow {
  return {
    customer_id: String(row.customer_id ?? ''),
    invoices_12m: Number(row.invoices_12m) || 0,
    revenue_12m: Number(row.revenue_12m) || 0,
    days_since_last_invoice: row.days_since_last_invoice == null ? null : Number(row.days_since_last_invoice),
    days_since_last_activity: row.days_since_last_activity == null ? null : Number(row.days_since_last_activity),
    overdue_balance: Number(row.overdue_balance) || 0,
    overdue_ratio: Number(row.overdue_ratio) || 0,
    score: Number(row.score) || 0,
    band: String(row.band ?? 'red'),
  };
}

/** Score y banda de la config (si tiene indicadores) o de la RPC. */
export function scoreOf(row: HealthRpcRow, config: HealthConfigJson | null): { score: number; band: HealthBand } {
  const scored = config ? scoreFromConfig(config, row) : null;
  if (scored) return { score: scored.score, band: scored.band };
  return { score: Math.max(0, Math.min(100, Math.round(Number(row.score) || 0))), band: normalizeBand(row.band) };
}

/** Resultado para la UI: dimensiones configurables (o campos de la RPC), `raw` y `alerts`. */
export function composeHealthResult(row: HealthRpcRow, config: HealthConfigJson | null, customerName: string): HealthScoreResult {
  const scored = config ? scoreFromConfig(config, row) : null;
  const indicators = scored
    ? scored.indicators.map((i) => ({ ...i, label: honestIndicatorLabel(i.key, i.label), value: i.value ?? -1 }))
    : RPC_INDICATOR_LABELS.map(([key, label]) => ({ key, label, weight: 0, value: row[key] == null ? -1 : Number(row[key]), score: 0, weightedScore: 0 }));
  const { score, band } = scoreOf(row, config);
  return { customer_id: row.customer_id, customer_name: customerName, score, band, indicators, raw: row, alerts: buildHealthAlerts(row) };
}

export interface OrgHealthSettings {
  config: HealthConfigJson | null;
  refreshIntervalHours: number;
  /** `health_score_configs.is_active = false` ⇒ no se mide. */
  active: boolean;
}

export interface HealthConfigRowLite {
  organization_id?: number;
  config: unknown;
  refresh_interval_hours?: number | null;
  is_active?: boolean | null;
}

export function settingsFromRow(row: HealthConfigRowLite | null): OrgHealthSettings {
  if (!row) return { config: null, refreshIntervalHours: 24, active: true };
  const hours = typeof row.refresh_interval_hours === 'number' && row.refresh_interval_hours > 0 ? row.refresh_interval_hours : 24;
  return { config: parseHealthConfig(row.config), refreshIntervalHours: hours, active: row.is_active !== false };
}

export async function getOrgHealthSettings(orgId: number, sb: SupabaseClient): Promise<OrgHealthSettings> {
  const { data, error } = await sb
    .from('health_score_configs')
    .select('organization_id, config, refresh_interval_hours, is_active')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`health_score_configs: ${error.message}`);
  return settingsFromRow((data as HealthConfigRowLite | null) ?? null);
}

/** Config de la organización (null si no hay fila, está inactiva o falla la lectura). */
export async function getOrgHealthConfig(orgId: number, sb: SupabaseClient): Promise<HealthConfigJson | null> {
  try {
    const s = await getOrgHealthSettings(orgId, sb);
    return s.active ? s.config : null;
  } catch {
    return null;
  }
}

export interface HealthScoreChange {
  customer_id: string;
  score: number;
}

/**
 * Escribe `customers.health_score` por LOTES: una sentencia por valor
 * distinto de score (`update … in(ids)`), nunca una por cliente. Solo debe
 * recibir clientes cuyo score cambió. Propuesta de RPC para una sola
 * sentencia por org en el informe de r2 (`fn_apply_health_scores`).
 */
export async function applyHealthScores(
  sb: SupabaseClient,
  orgId: number,
  changes: ReadonlyArray<HealthScoreChange>,
  now: Date,
): Promise<{ statements: number; updated: number }> {
  const byScore = new Map<number, string[]>();
  for (const c of changes) {
    const list = byScore.get(c.score) ?? [];
    list.push(c.customer_id);
    byScore.set(c.score, list);
  }
  let statements = 0;
  let updated = 0;
  for (const [score, ids] of byScore) {
    const q = sb.from('customers').update({ health_score: score, health_score_updated_at: now.toISOString() });
    const { error } = await (ids.length === 1 ? q.eq('id', ids[0]) : q.in('id', ids)).eq('organization_id', orgId);
    if (error) throw new Error(`customers.health_score: ${error.message}`);
    statements += 1;
    updated += ids.length;
  }
  return { statements, updated };
}

export function indicatorsOf(row: HealthRpcRow): Record<string, number | null> {
  return {
    invoices_12m: Number(row.invoices_12m) || 0,
    revenue_12m: Number(row.revenue_12m) || 0,
    days_since_last_invoice: row.days_since_last_invoice == null ? null : Number(row.days_since_last_invoice),
    days_since_last_activity: row.days_since_last_activity == null ? null : Number(row.days_since_last_activity),
    overdue_balance: Number(row.overdue_balance) || 0,
    overdue_ratio: Number(row.overdue_ratio) || 0,
  };
}

export interface CustomerSnapshotResult extends HealthScoreResult {
  snapshot_written: boolean;
  customer_updated: boolean;
  calculated_at: string;
}

/**
 * «Medir ahora» de un cliente: mismo cálculo que la lista y el cron;
 * snapshot solo si cambió el score o venció el intervalo (`shouldWriteSnapshot`);
 * `customers.health_score` solo si cambió. Null si la RPC no devuelve al
 * cliente (otra organización o `lifecycle_stage != 'customer'`).
 */
export async function snapshotCustomerHealth(
  orgId: number,
  customerId: string,
  sb: SupabaseClient,
  now: Date = new Date(),
): Promise<CustomerSnapshotResult | null> {
  const [settings, rpc, customer, lastSnap] = await Promise.all([
    getOrgHealthSettings(orgId, sb),
    sb.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: customerId }),
    sb.from('customers').select('id, full_name, health_score').eq('id', customerId).eq('organization_id', orgId).maybeSingle(),
    sb.from('health_score_snapshots').select('score, created_at').eq('organization_id', orgId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (rpc.error) throw new Error(`fn_customer_health: ${rpc.error.message}`);
  const raw = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!raw) return null;
  const cust = customer.data as { full_name: string | null; health_score: number | null } | null;
  const row = toHealthRpcRow(raw as Record<string, unknown>);
  const result = composeHealthResult(row, settings.active ? settings.config : null, cust?.full_name || 'Sin nombre');

  const last = (lastSnap.data as { score: number; created_at: string } | null) ?? null;
  let snapshotWritten = false;
  if (shouldWriteSnapshot({ last, score: result.score, now, refreshIntervalHours: settings.refreshIntervalHours })) {
    const { error } = await sb
      .from('health_score_snapshots')
      .insert({ organization_id: orgId, customer_id: customerId, score: result.score, band: result.band, indicators: indicatorsOf(row), created_at: now.toISOString() });
    if (error) throw new Error(`health_score_snapshots: ${error.message}`);
    snapshotWritten = true;
  }
  let customerUpdated = false;
  if (cust && cust.health_score !== result.score) {
    await applyHealthScores(sb, orgId, [{ customer_id: customerId, score: result.score }], now);
    customerUpdated = true;
  }
  return { ...result, snapshot_written: snapshotWritten, customer_updated: customerUpdated, calculated_at: now.toISOString() };
}

/** Score guardado en `customers.health_score` (sin recalcular). */
export async function getHealthScore(
  orgId: number,
  customerId: string,
  sb: SupabaseClient,
): Promise<{ customer_id: string; score: number | null; band: HealthBand | null; updated_at: string | null } | null> {
  const [{ data, error }, config] = await Promise.all([
    sb.from('customers').select('id, health_score, health_score_updated_at').eq('id', customerId).eq('organization_id', orgId).maybeSingle(),
    getOrgHealthConfig(orgId, sb),
  ]);
  if (error || !data) return null;
  const row = data as { health_score: number | null; health_score_updated_at: string | null };
  const band = row.health_score === null ? null : bandForScore(row.health_score, config?.bands ?? DEFAULT_BANDS);
  return { customer_id: customerId, score: row.health_score, band, updated_at: row.health_score_updated_at };
}

/** Tendencia (snapshots de la org y del cliente, ascendente). */
export async function getHealthTrend(orgId: number, customerId: string, sb: SupabaseClient, months: number = 6): Promise<HealthSnapshot[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const { data, error } = await sb
    .from('health_score_snapshots')
    .select('id, customer_id, score, band, indicators, created_at')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });
  if (error || !data) {
    console.warn('[healthScoreServer.getHealthTrend] error:', error?.message);
    return [];
  }
  return (data as HealthSnapshot[]).map((r) => ({ id: r.id, customer_id: r.customer_id, score: r.score, band: r.band, indicators: r.indicators, created_at: r.created_at }));
}

export interface HealthScoreServerResult {
  customer_id: string;
  score: number;
  band: HealthBand;
  indicators: Record<string, number | null>;
  calculated_at: string;
  alerts: HealthAlert[];
  /** Indicadores puntuados según `health_score_configs.config` (vacío si no hay config). */
  dimensions: HealthScoreResult['indicators'];
}

/**
 * Calcula el score de un cliente (RPC + config) y refresca `customers.health_score`
 * solo si cambió. Sin snapshot (para eso, `snapshotCustomerHealth`).
 */
export async function calculateHealthScore(orgId: number, customerId: string, sb: SupabaseClient): Promise<HealthScoreServerResult | null> {
  const [settings, rpc, customer] = await Promise.all([
    getOrgHealthSettings(orgId, sb),
    sb.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: customerId }),
    sb.from('customers').select('id, health_score').eq('id', customerId).eq('organization_id', orgId).maybeSingle(),
  ]);
  if (rpc.error) {
    console.warn('[healthScoreServer.calculateHealthScore] RPC error:', rpc.error.message);
    return null;
  }
  const raw = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!raw) return null;
  const row = toHealthRpcRow(raw as Record<string, unknown>);
  const config = settings.active ? settings.config : null;
  const composed = composeHealthResult(row, config, '');
  const now = new Date();
  const current = (customer.data as { health_score: number | null } | null)?.health_score ?? null;
  if (current !== composed.score) await applyHealthScores(sb, orgId, [{ customer_id: customerId, score: composed.score }], now);
  return {
    customer_id: customerId,
    score: composed.score,
    band: composed.band,
    indicators: indicatorsOf(row),
    calculated_at: now.toISOString(),
    alerts: composed.alerts ?? [],
    dimensions: config && config.indicators.length ? composed.indicators : [],
  };
}
