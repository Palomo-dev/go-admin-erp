import type { SupabaseClient } from '@supabase/supabase-js';
import { isJobKind, type JobKind } from './types';

/**
 * F11 — tareas programadas EN PROCESO (no son `outbound_jobs.kind`).
 *
 * El CHECK real de `outbound_jobs.kind` (guardarraíl 9 de `guardrails.test.ts`
 * lo compara con `JOB_KINDS`) no admite `health_recalculate` ni
 * `renewals_sync`, y esta fase no lleva migraciones. Por eso son un tipo aparte
 * (`ScheduledTask`) que el cron diario ejecuta directamente, como
 * `maintenance`, sin insertar nada en la cola.
 */
export const SCHEDULED_TASKS = ['health_recalculate', 'renewals_sync'] as const;
export type ScheduledTask = (typeof SCHEDULED_TASKS)[number];
export type ScheduledKind = JobKind | ScheduledTask;

export function isScheduledTask(value: unknown): value is ScheduledTask {
  return typeof value === 'string' && (SCHEDULED_TASKS as readonly string[]).includes(value);
}

export function splitScheduledKinds(kinds: readonly ScheduledKind[] | undefined): { jobKinds: JobKind[]; tasks: ScheduledTask[] } {
  const jobKinds: JobKind[] = [];
  const tasks: ScheduledTask[] = [];
  for (const k of kinds ?? []) {
    if (isScheduledTask(k)) tasks.push(k);
    else if (isJobKind(k)) jobKinds.push(k);
  }
  return { jobKinds, tasks };
}

export interface OrgModuleRow {
  organization_id: number;
  module_code: string;
  is_active: boolean | null;
}

/** Ids únicos y válidos de las organizaciones con `module_code` activo. */
export function orgIdsWithModule(rows: ReadonlyArray<OrgModuleRow>, moduleCode: string): number[] {
  const out = new Set<number>();
  for (const r of rows) {
    if (r.module_code !== moduleCode || r.is_active !== true) continue;
    if (!Number.isInteger(r.organization_id) || r.organization_id <= 0) continue;
    out.add(r.organization_id);
  }
  return Array.from(out);
}

/**
 * Organizaciones con el módulo CRM activo, leídas de `organization_modules`.
 * Nunca una lista cableada (CLAUDE.md, mapa de módulos).
 */
export async function listCrmActiveOrgIds(sb: SupabaseClient): Promise<{ orgIds: number[]; error: string | null }> {
  const { data, error } = await sb
    .from('organization_modules')
    .select('organization_id, module_code, is_active')
    .eq('module_code', 'crm')
    .eq('is_active', true)
    .limit(5000);
  if (error) return { orgIds: [], error: error.message };
  return { orgIds: orgIdsWithModule((data ?? []) as OrgModuleRow[], 'crm'), error: null };
}
