import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldWriteSnapshot, type HealthRpcRow } from '@/lib/services/crm/healthBands';
import {
  indicatorsOf,
  scoreOf,
  settingsFromRow,
  type HealthConfigRowLite,
  type OrgHealthSettings,
} from '@/lib/services/crm/healthScoreServer';
import { guardarMedicionesSalud, leerBaseMedicionesSalud } from '@/lib/services/crm/healthMutationService';
import { listCrmActiveOrgIds } from '../scheduledOrgs';
import type { JobLogger } from '../types';

/** Salud comparte cálculo con «Medir ahora». Cada lote guarda score y snapshot
 * en una única RPC; la última medición se lee por cliente sin truncar historial.
 * La rotación y el presupuesto permiten retomar las organizaciones pendientes. */

export interface HealthRecalcOrgResult {
  org_id: number;
  customers: number;
  snapshots_written: number;
  skipped_unchanged: number;
  customers_updated: number;
  update_statements: number;
  ms: number;
  reason?: 'config_inactive';
  error: string | null;
}

export interface HealthRecalcResult {
  orgs: number;
  processed: number;
  snapshots_written: number;
  customers_updated: number;
  errors: number;
  aborted: boolean;
  /** Organizaciones que no se procesaron (presupuesto o señal); vacío si se procesaron todas. */
  pending_org_ids: number[];
  budget_ms: number | null;
  elapsed_ms: number;
  error?: string;
  by_org: HealthRecalcOrgResult[];
}

export interface HealthRecalcOptions {
  /** Presupuesto propio de la tarea; `null`/ausente = solo la señal. */
  budgetMs?: number | null;
  /** Reloj inyectable (ms) para medir el presupuesto; por defecto `Date.now`. */
  clock?: () => number;
}

const INSERT_CHUNK = 200;
const ROTATION_WINDOW_DAYS = 7;
const ROTATION_SCAN_LIMIT = 5000;

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export async function recalculateOrgHealth(
  orgId: number,
  sb: SupabaseClient,
  now: Date,
  opts: { settings?: OrgHealthSettings; clock?: () => number; signal?: AbortSignal } = {},
): Promise<HealthRecalcOrgResult> {
  const clock = opts.clock ?? Date.now;
  const started = clock();
  const out: HealthRecalcOrgResult = { org_id: orgId, customers: 0, snapshots_written: 0, skipped_unchanged: 0, customers_updated: 0, update_statements: 0, ms: 0, error: null };
  const done = () => ({ ...out, ms: clock() - started });

  let settings = opts.settings;
  if (!settings) {
    const { data: cfgRow, error: cfgErr } = await sb
      .from('health_score_configs')
      .select('organization_id, config, refresh_interval_hours, is_active, updated_at')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (cfgErr) throw new Error(`health_score_configs: ${cfgErr.message}`);
    settings = settingsFromRow((cfgRow as HealthConfigRowLite | null) ?? null);
  }
  if (!settings.active) return { ...done(), reason: 'config_inactive' };
  const rpc = await sb.rpc('fn_customer_health', { p_org_id: orgId, p_customer_id: null });
  if (rpc.error) throw new Error(`fn_customer_health: ${rpc.error.message}`);
  const rows = (Array.isArray(rpc.data) ? rpc.data : rpc.data ? [rpc.data] : []) as HealthRpcRow[];
  out.customers = rows.length;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    if (opts.signal?.aborted) throw new Error('Medición de salud interrumpida');
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const base = await leerBaseMedicionesSalud(sb, orgId, chunk.map(r => r.customer_id));
    const measurements = chunk.map(row => {
      const current = base.get(row.customer_id);
      if (!current) throw new Error('Cliente no disponible para medir salud');
      const { score, band } = scoreOf(row, settings.config);
      return { customer_id: row.customer_id, score, band, indicators: indicatorsOf(row),
        write_snapshot: shouldWriteSnapshot({ last: current.last_snapshot, score, now, refreshIntervalHours: settings.refreshIntervalHours }),
        expected_snapshot_id: current.last_snapshot?.id ?? null };
    });
    const applied = await guardarMedicionesSalud(sb, orgId, measurements, settings.configStamp ?? null, now);
    out.snapshots_written += applied.snapshots_written;
    out.customers_updated += applied.customers_updated;
    out.skipped_unchanged += applied.skipped_unchanged;
    out.update_statements += 1;
  }
  return done();
}

/** Sin snapshot primero (nunca procesadas), luego por último snapshot ascendente; estable. */
export function orderOrgsByLeastRecentlyProcessed(orgIds: ReadonlyArray<number>, lastProcessedMs: ReadonlyMap<number, number>): number[] {
  return orgIds
    .map((id, i) => ({ id, i, at: lastProcessedMs.get(id) ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at - b.at))
    .map((x) => x.id);
}

async function lastProcessedByOrg(sb: SupabaseClient, orgIds: number[], now: Date): Promise<Map<number, number>> {
  const since = new Date(now.getTime() - ROTATION_WINDOW_DAYS * 864e5).toISOString();
  const { data, error } = await sb
    .from('health_score_snapshots')
    .select('organization_id, created_at')
    .in('organization_id', orgIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(ROTATION_SCAN_LIMIT);
  if (error) throw new Error(`health_score_snapshots (rotación): ${error.message}`);
  const out = new Map<number, number>();
  for (const r of (data ?? []) as Array<{ organization_id: number; created_at: string }>) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    const cur = out.get(r.organization_id);
    if (cur === undefined || at > cur) out.set(r.organization_id, at);
  }
  return out;
}

async function settingsByOrg(sb: SupabaseClient, orgIds: number[]): Promise<Map<number, OrgHealthSettings>> {
  const { data, error } = await sb
    .from('health_score_configs')
    .select('organization_id, config, refresh_interval_hours, is_active, updated_at')
    .in('organization_id', orgIds)
    .limit(ROTATION_SCAN_LIMIT);
  if (error) throw new Error(`health_score_configs: ${error.message}`);
  const out = new Map<number, OrgHealthSettings>();
  for (const r of (data ?? []) as HealthConfigRowLite[]) if (typeof r.organization_id === 'number') out.set(r.organization_id, settingsFromRow(r));
  return out;
}

export async function runHealthRecalculate(
  sb: SupabaseClient,
  now: Date,
  log: JobLogger,
  signal?: AbortSignal,
  opts: HealthRecalcOptions = {},
): Promise<HealthRecalcResult> {
  const clock = opts.clock ?? Date.now;
  const budgetMs = typeof opts.budgetMs === 'number' && opts.budgetMs > 0 ? opts.budgetMs : null;
  const started = clock();
  const out: HealthRecalcResult = { orgs: 0, processed: 0, snapshots_written: 0, customers_updated: 0, errors: 0, aborted: false, pending_org_ids: [], budget_ms: budgetMs, elapsed_ms: 0, by_org: [] };
  const finish = () => ({ ...out, elapsed_ms: clock() - started });

  const { orgIds, error } = await listCrmActiveOrgIds(sb);
  if (error) {
    log.error('health_recalculate_orgs_failed', { error });
    return { ...finish(), error };
  }
  out.orgs = orgIds.length;
  if (orgIds.length === 0) return finish();

  let ordered = orgIds;
  let settings = new Map<number, OrgHealthSettings>();
  try {
    const [last, cfg] = await Promise.all([lastProcessedByOrg(sb, orgIds, now), settingsByOrg(sb, orgIds)]);
    ordered = orderOrgsByLeastRecentlyProcessed(orgIds, last);
    settings = cfg;
  } catch (err) {
    log.warn('health_recalculate_rotation_failed', { error: errorMessage(err) });
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const orgId = ordered[i];
    const overBudget = budgetMs !== null && clock() - started >= budgetMs;
    if (signal?.aborted || overBudget) {
      out.aborted = true;
      out.pending_org_ids = ordered.slice(i);
      log.warn('health_recalculate_aborted', { processed: out.processed, orgs: out.orgs, pending: out.pending_org_ids.length, reason: overBudget ? 'budget' : 'signal' });
      break;
    }
    try {
      const r = await recalculateOrgHealth(orgId, sb, now, { settings: settings.get(orgId) ?? settingsFromRow(null), clock, signal });
      out.by_org.push(r);
      out.processed += 1;
      out.snapshots_written += r.snapshots_written;
      out.customers_updated += r.customers_updated;
    } catch (err) {
      const message = errorMessage(err);
      out.by_org.push({ org_id: orgId, customers: 0, snapshots_written: 0, skipped_unchanged: 0, customers_updated: 0, update_statements: 0, ms: 0, error: message });
      out.processed += 1;
      out.errors += 1;
      log.error('health_recalculate_org_failed', { org_id: orgId, error: message });
    }
  }
  const result = finish();
  log.info('health_recalculate_done', { orgs: result.orgs, processed: result.processed, pending: result.pending_org_ids.length, snapshots_written: result.snapshots_written, customers_updated: result.customers_updated, errors: result.errors, elapsed_ms: result.elapsed_ms });
  return result;
}
