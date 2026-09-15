/**
 * Estadísticas por secuencia para las tarjetas de la lista (brief UX 6.3):
 * inscritos activos y tasa de respuesta.
 *
 * Una sola lectura de `sequence_enrollments` de la organización, agregada en
 * Node. No toca el esquema ni el servicio F8 (`sequenceService.ts`).
 *
 * «Respondió» = la pausa automática por respuesta del cliente:
 * `fn_pause_sequences_on_reply` escribe `paused_reason =
 * 'customer_replied_<canal>'`. Es el ÚNICO camino real (r2 #3): ningún
 * código escribe `exit_reason = 'replied'` (`checkExitConditions` no
 * implementa esa condición) y `processStepRun` ya no salta pasos mientras
 * la inscripción está pausada. Límite conocido: `fn_resume_sequence_enrollment`
 * pone `paused_reason = NULL`, así que una respuesta seguida de «Reanudar»
 * deja de contar. La tarjeta lo dice: «pausadas por respuesta».
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EnrollmentStatRow {
  sequence_id?: string;
  status: string;
  paused_reason: string | null;
  exit_reason: string | null;
}

export interface SequenceStats {
  /** Inscripciones vivas: `active` + `paused` (siguen inscritas). */
  active: number;
  total: number;
  replied: number;
  /** 0..1 con dos decimales; `null` sin inscripciones. */
  response_rate: number | null;
}

const LIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'paused']);

export function isRepliedEnrollment(row: EnrollmentStatRow): boolean {
  return typeof row.paused_reason === 'string' && row.paused_reason.startsWith('customer_replied');
}

export function responseRate(replied: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((replied / total) * 100) / 100;
}

export function summarizeEnrollmentRows(
  rows: (EnrollmentStatRow & { sequence_id: string })[],
): Record<string, SequenceStats> {
  const acc: Record<string, { active: number; total: number; replied: number }> = {};
  for (const row of rows) {
    const bucket = (acc[row.sequence_id] ??= { active: 0, total: 0, replied: 0 });
    bucket.total += 1;
    if (LIVE_STATUSES.has(row.status)) bucket.active += 1;
    if (isRepliedEnrollment(row)) bucket.replied += 1;
  }
  const out: Record<string, SequenceStats> = {};
  for (const [id, b] of Object.entries(acc)) {
    out[id] = { ...b, response_rate: responseRate(b.replied, b.total) };
  }
  return out;
}

/** Estadísticas de todas las secuencias de la organización (sesión, con RLS). */
export async function getSequenceStats(
  orgId: number,
  supabase: SupabaseClient,
): Promise<Record<string, SequenceStats>> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('sequence_id, status, paused_reason, exit_reason')
    .eq('organization_id', orgId);
  if (error) throw new Error(`getSequenceStats: ${error.message}`);
  return summarizeEnrollmentRows((data ?? []) as (EnrollmentStatRow & { sequence_id: string })[]);
}

// ─── Nombres para la lista de inscripciones ──────────────────────────────────

export interface EnrollmentNameRefs {
  opportunity_id: string | null;
  customer_id: string | null;
}

export interface EnrollmentNames {
  opportunity_name: string | null;
  customer_name: string | null;
}

/**
 * Resuelve, dentro de la organización, el nombre de la oportunidad y del
 * cliente de cada inscripción: la lista mostraba UUIDs. Solo lectura.
 */
export async function resolveEnrollmentNames<T extends EnrollmentNameRefs>(
  orgId: number,
  supabase: SupabaseClient,
  enrollments: T[],
): Promise<(T & EnrollmentNames)[]> {
  const oppIds = Array.from(new Set(enrollments.map((e) => e.opportunity_id).filter((v): v is string => !!v)));
  const oppById = new Map<string, { name: string | null; customer_id: string | null }>();
  if (oppIds.length > 0) {
    const { data, error } = await supabase
      .from('opportunities')
      .select('id, name, customer_id')
      .eq('organization_id', orgId)
      .in('id', oppIds);
    if (error) throw new Error(`resolveEnrollmentNames(opportunities): ${error.message}`);
    for (const o of (data ?? []) as { id: string; name: string | null; customer_id: string | null }[]) {
      oppById.set(o.id, { name: o.name, customer_id: o.customer_id });
    }
  }

  const customerIds = Array.from(new Set([
    ...enrollments.map((e) => e.customer_id),
    ...Array.from(oppById.values()).map((o) => o.customer_id),
  ].filter((v): v is string => !!v)));
  const customerById = new Map<string, string | null>();
  if (customerIds.length > 0) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .in('id', customerIds);
    if (error) throw new Error(`resolveEnrollmentNames(customers): ${error.message}`);
    for (const c of (data ?? []) as { id: string; full_name: string | null }[]) customerById.set(c.id, c.full_name);
  }

  return enrollments.map((e) => {
    const opp = e.opportunity_id ? oppById.get(e.opportunity_id) : undefined;
    const customerId = e.customer_id ?? opp?.customer_id ?? null;
    return {
      ...e,
      opportunity_name: opp?.name ?? null,
      customer_name: customerId ? (customerById.get(customerId) ?? null) : null,
    };
  });
}
