import type { SupabaseClient } from '@supabase/supabase-js';
import { syncRenewalsForOrg, type RenewalSyncOrgResult } from '@/lib/services/crm/renewalService';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import { listCrmActiveOrgIds } from '../scheduledOrgs';
import type { JobLogger } from '../types';

/**
 * F11 — tarea programada EN PROCESO `renewals_sync` (no es un
 * `outbound_jobs.kind`). Por cada organización con CRM activo llama a
 * `syncRenewalsForOrg`, que crea/refresca las renovaciones de forma
 * idempotente (una por contrato, hitos como tareas, `closed_at` obligatorio).
 * La zona horaria sale de `organizations.timezone` (fallback
 * `DEFAULT_TIMEZONE`), nunca cableada.
 */

export interface RenewalsSyncOrgResult extends RenewalSyncOrgResult {
  timezone: string;
}

export interface RenewalsSyncResult {
  orgs: number;
  processed: number;
  created: number;
  updated: number;
  errors: number;
  aborted: boolean;
  error?: string;
  by_org: RenewalsSyncOrgResult[];
}

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function loadTimezones(orgIds: number[], sb: SupabaseClient, log: JobLogger): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (orgIds.length === 0) return out;
  const { data, error } = await sb.from('organizations').select('id, timezone').in('id', orgIds);
  if (error) {
    log.warn('renewals_sync_timezones_failed', { error: error.message });
    return out;
  }
  for (const r of (data ?? []) as Array<{ id: number; timezone: unknown }>) {
    if (isValidTimezone(r.timezone)) out.set(r.id, r.timezone);
  }
  return out;
}

export async function runRenewalsSync(
  sb: SupabaseClient,
  now: Date,
  log: JobLogger,
  signal?: AbortSignal,
): Promise<RenewalsSyncResult> {
  const out: RenewalsSyncResult = { orgs: 0, processed: 0, created: 0, updated: 0, errors: 0, aborted: false, by_org: [] };
  const { orgIds, error } = await listCrmActiveOrgIds(sb);
  if (error) {
    log.error('renewals_sync_orgs_failed', { error });
    return { ...out, error };
  }
  out.orgs = orgIds.length;
  const timezones = await loadTimezones(orgIds, sb, log);

  for (const orgId of orgIds) {
    if (signal?.aborted) {
      out.aborted = true;
      log.warn('renewals_sync_aborted', { processed: out.processed, orgs: out.orgs });
      break;
    }
    const timezone = timezones.get(orgId) ?? DEFAULT_TIMEZONE;
    try {
      const r = await syncRenewalsForOrg(orgId, sb, { now, timezone });
      out.by_org.push({ ...r, timezone });
      out.created += r.created;
      out.updated += r.updated;
      out.errors += r.errors.length;
      if (r.errors.length) log.warn('renewals_sync_org_errors', { org_id: orgId, errors: r.errors.slice(0, 5) });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      out.by_org.push({ org_id: orgId, scanned: 0, created: 0, updated: 0, skipped: 0, errors: [message], timezone });
      out.errors += 1;
      log.error('renewals_sync_org_failed', { org_id: orgId, error: message });
    }
    out.processed += 1;
  }
  log.info('renewals_sync_done', { orgs: out.orgs, processed: out.processed, created: out.created, updated: out.updated, errors: out.errors });
  return out;
}
