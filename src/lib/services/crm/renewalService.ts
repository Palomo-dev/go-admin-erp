import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import {
  buildRenewalPlan,
  milestoneTaskTitle,
  nextContactFromTasks,
  pickRenewalSequence,
  RenewalPlanError,
  type RenewalSequenceCandidate,
} from './renewalMilestones';

// Este módulo lo carga el navegador (`WonCloseModal` → `wonCloseSteps`). NO debe importar
// —ni estática ni dinámicamente— el módulo de secuencias: arrastra correo, webhooks, twilio y el
// service role al bundle del cliente (H1 del tester D1/D2, 2026-09-16: `next build` fallaba con
// «Can't resolve 'net'»). La inscripción en la secuencia se INYECTA (`ScheduleRenewalOptions.enroll`).

/**
 * Servicio CRM de renovaciones (FASE-11 §3.1).
 *
 * Regla: por contrato ganado (`status='won'`, `billing_cycle_months > 0`)
 * existe UNA oportunidad `deal_type='renewal'` con `parent_opportunity_id`;
 * los toques 120/90/60/30/15/7 días antes del vencimiento son TAREAS
 * (`tasks.type='renewal_milestone'`, `status='open'`, CHECK real
 * `open|in_progress|done|canceled`). `next_contact_at` = primer hito
 * pendiente. El vencimiento sale de `closed_at` (trigger
 * `trg_opportunities_closed_at`), nunca de `updated_at`.
 *
 * La lógica pura vive en `renewalMilestones.ts`; la tarea programada
 * `renewals_sync` (scheduler F11) llama a `syncRenewalsForOrg` por organización.
 */

export interface UpcomingRenewal {
  opportunity_id: string;
  renewal_opportunity_id: string | null;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  original_amount: number;
  currency: string;
  billing_cycle_months: number;
  won_date: string;
  renewal_date: string;
  days_until_renewal: number;
  next_milestone_days: number | null;
  status: 'pending' | 'created' | 'open';
}

export interface ScheduledRenewalResult {
  renewal_opportunity_id: string;
  parent_opportunity_id: string;
  customer_id: string;
  /** Instante del vencimiento (ISO). */
  renewal_date: string;
  next_contact_at: string | null;
  tasks_created: number;
  already_existed: boolean;
  /** Se refrescó `next_contact_at` de una renovación existente. */
  updated: boolean;
  sequence_enrollment_id: string | null;
  sequence_error: string | null;
}

/**
 * Inscripción en la secuencia de renovación (F8). Misma firma que
 * `enrollInSequence` del módulo de secuencias (F8); la aportan SOLO los llamadores de
 * servidor (`renewals_sync`, `POST /api/crm/renewals/sync`). El navegador no la
 * tiene: la renovación se crea igual y la inscribe el siguiente sync.
 */
export type EnrollRenewalFn = (
  orgId: number,
  sequenceId: string,
  renewalOppId: string,
  sb: SupabaseClient,
  extra: { customerId: string; source: 'renewal' },
) => Promise<{ id: string }>;

/** `sequence_error` cuando hay secuencia de renovación pero el llamador no aportó `enroll` (navegador). */
export const SEQUENCE_ENROLL_DEFERRED = 'la inscribe la sincronización diaria del servidor';

export interface ScheduleRenewalOptions {
  now?: Date;
  /** Zona de la organización (día calendario de `expected_close_date`). */
  timezone?: string;
  /**
   * Instante de cierre a usar SOLO si `closed_at` aún es null (deuda D2: el
   * cierre «al ganar» de F10 se ejecuta en el mismo instante en que el trigger
   * lo escribe). `syncRenewalsForOrg` no lo usa: sin `closed_at` sigue fallando.
   */
  closedAtFallback?: Date;
  /** Servidor: `enrollInSequence` del módulo de secuencias (F8). Sin ella no se inscribe (ver `SEQUENCE_ENROLL_DEFERRED`). */
  enroll?: EnrollRenewalFn;
  /** `opportunities.branch_id` de la renovación (nullable en BD). Sin él se hereda el del contrato padre. */
  branchId?: number | null;
  /** `opportunities.created_by` de la renovación (nullable en BD). */
  createdBy?: string | null;
}

export interface RenewalSyncOrgResult {
  org_id: number;
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  /** Inscripciones en la secuencia de renovación hechas en esta pasada (nuevas y existentes sin inscripción). */
  enrolled: number;
  errors: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface ParentRow {
  id: string;
  status?: string | null;
  customer_id: string | null;
  amount: number | null;
  currency: string | null;
  closed_at: string | null;
  salesperson_id: string | null;
  billing_cycle_months: number | null;
  branch_id?: number | null;
}

const PARENT_COLUMNS = 'id, status, customer_id, amount, currency, closed_at, salesperson_id, billing_cycle_months, branch_id';

/** Pipeline `renewal` de la organización; lo crea con sus etapas si no existe. */
export async function getOrCreateRenewalPipelineServer(orgId: number, sb: SupabaseClient): Promise<string> {
  const { data: existing, error: readErr } = await sb
    .from('pipelines')
    .select('id')
    .eq('organization_id', orgId)
    .eq('pipeline_type', 'renewal')
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(`pipeline de renovación: ${readErr.message}`);
  if (existing) return (existing as { id: string }).id;

  const { data: pipeline, error } = await sb
    .from('pipelines')
    .insert({ organization_id: orgId, name: 'Renovaciones', pipeline_type: 'renewal', is_default: false })
    .select('id')
    .single();
  if (error || !pipeline) throw new Error(`crear pipeline de renovación: ${error?.message ?? 'sin fila'}`);
  const pipelineId = (pipeline as { id: string }).id;

  const stages = [
    { name: 'Renovación pendiente', position: 1, probability: 50, color: '#3b82f6', sla_days: null as number | null },
    { name: 'Contacto iniciado', position: 2, probability: 60, color: '#6366f1', sla_days: 30 },
    { name: 'Negociación', position: 3, probability: 75, color: '#a855f7', sla_days: 21 },
    { name: 'Contrato enviado', position: 4, probability: 90, color: '#ec4899', sla_days: 14 },
    { name: 'Renovado', position: 5, probability: 100, color: '#22c55e', sla_days: null },
    { name: 'No renovado', position: 6, probability: 0, color: '#ef4444', sla_days: null },
  ];
  const { error: stErr } = await sb.from('stages').insert(
    stages.map((s) => ({ pipeline_id: pipelineId, ...s, is_won: s.position === 5, is_lost: s.position === 6 })),
  );
  if (stErr) throw new Error(`crear etapas de renovación: ${stErr.message}`);
  return pipelineId;
}

async function firstStageId(pipelineId: string, sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from('stages')
    .select('id, position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`etapas del pipeline de renovación: ${error.message}`);
  if (!data) throw new Error('El pipeline de renovación no tiene etapas');
  return (data as { id: string }).id;
}

async function refreshNextContact(
  orgId: number,
  renewal: { id: string; next_contact_at: string | null },
  now: Date,
  sb: SupabaseClient,
): Promise<{ next: string | null; updated: boolean }> {
  const { data: tasks, error } = await sb
    .from('tasks')
    .select('due_date, status')
    .eq('organization_id', orgId)
    .eq('related_to_type', 'opportunity')
    .eq('related_to_id', renewal.id);
  if (error) throw new Error(`tareas de renovación: ${error.message}`);
  const next = nextContactFromTasks((tasks ?? []) as Array<{ due_date: string | null; status: string | null }>, now);
  const nextIso = next ? next.toISOString() : null;
  const currentMs = renewal.next_contact_at ? new Date(renewal.next_contact_at).getTime() : null;
  const nextMs = next ? next.getTime() : null;
  if (currentMs === nextMs) return { next: nextIso, updated: false };
  const { error: updErr } = await sb
    .from('opportunities')
    .update({ next_contact_at: nextIso })
    .eq('id', renewal.id)
    .eq('organization_id', orgId);
  if (updErr) throw new Error(`actualizar next_contact_at: ${updErr.message}`);
  return { next: nextIso, updated: true };
}

/**
 * Inscribe la renovación en la secuencia de renovación de la organización (si la hay).
 * `onlyIfMissing`: renovación ya existente → se salta si `sequence_enrollments` ya tiene
 * una fila para (organización, secuencia, oportunidad) en CUALQUIER estado. No basta
 * con «viva» (active|paused): una inscripción completed/exited también cuenta, porque
 * reinscribirla en cada sync reenviaría la secuencia entera a diario.
 * (Esquema verificado por MCP el 2026-09-16: `status` CHECK active|paused|completed|exited,
 * índice único parcial `idx_enroll_active_unique (sequence_id, opportunity_id)` sobre vivas.)
 */
async function enrollRenewalSequence(
  orgId: number,
  renewalOppId: string,
  customerId: string,
  sb: SupabaseClient,
  enroll: EnrollRenewalFn | undefined,
  onlyIfMissing: boolean,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await sb
    .from('sequences')
    .select('id, is_active, trigger_type, trigger_config, template_key')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(200);
  if (error) return { id: null, error: `secuencias: ${error.message}` };
  const seq = pickRenewalSequence((data ?? []) as RenewalSequenceCandidate[]);
  if (!seq) return { id: null, error: null };
  if (!enroll) return { id: null, error: SEQUENCE_ENROLL_DEFERRED };
  if (onlyIfMissing) {
    const { data: existing, error: exErr } = await sb
      .from('sequence_enrollments')
      .select('id')
      .eq('organization_id', orgId)
      .eq('sequence_id', seq.id)
      .eq('opportunity_id', renewalOppId)
      .limit(1)
      .maybeSingle();
    if (exErr) return { id: null, error: `inscripciones: ${exErr.message}` };
    if (existing) return { id: null, error: null };
  }
  try {
    const r = await enroll(orgId, seq.id, renewalOppId, sb, { customerId, source: 'renewal' });
    return { id: r.id, error: null };
  } catch (err) {
    return { id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Programa (o refresca) la renovación de una oportunidad ganada.
 * Lanza `RenewalPlanError` si `closed_at` es null o el ciclo no es válido;
 * lanza `Error` si la oportunidad no pertenece a la organización.
 */
export async function scheduleRenewal(
  orgId: number,
  parentOppId: string,
  billingCycleMonths: number,
  sb: SupabaseClient,
  opts: ScheduleRenewalOptions = {},
): Promise<ScheduledRenewalResult> {
  const now = opts.now ?? new Date();
  const { data: parentRow, error: parentError } = await sb
    .from('opportunities')
    .select(PARENT_COLUMNS)
    .eq('id', parentOppId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (parentError) throw new Error(`scheduleRenewal: ${parentError.message}`);
  if (!parentRow) throw new Error(`scheduleRenewal: oportunidad ${parentOppId} no encontrada en la organización`);
  const parent = parentRow as ParentRow;
  // Tester D1/D2 (2026-09-16): solo se programa la renovación de una GANADA. Sin esta guarda, el
  // `closedAtFallback` convertía en «contrato» una oportunidad abierta (PATCH de etapa fallido) o perdida.
  if (parent.status !== 'won') throw new RenewalPlanError(`scheduleRenewal: la oportunidad ${parentOppId} no está ganada`);
  const closedAt = parent.closed_at ?? opts.closedAtFallback?.toISOString() ?? null;
  return scheduleRenewalForParent(orgId, { ...parent, closed_at: closedAt }, billingCycleMonths, sb, now, opts);
}

async function scheduleRenewalForParent(
  orgId: number,
  parent: ParentRow,
  billingCycleMonths: number,
  sb: SupabaseClient,
  now: Date,
  opts: Pick<ScheduleRenewalOptions, 'timezone' | 'enroll' | 'branchId' | 'createdBy'>,
): Promise<ScheduledRenewalResult> {
  const timezone = opts.timezone;
  if (!parent.customer_id) throw new RenewalPlanError(`La oportunidad ${parent.id} no tiene cliente`);
  // El plan se calcula ANTES de cualquier escritura: closed_at null → error claro y sin efectos.
  const plan = buildRenewalPlan({ closedAt: parent.closed_at, billingCycleMonths, now, timezone });

  // Idempotencia por (organization_id, parent_opportunity_id, deal_type='renewal').
  const { data: existing, error: exErr } = await sb
    .from('opportunities')
    .select('id, next_contact_at')
    .eq('organization_id', orgId)
    .eq('parent_opportunity_id', parent.id)
    .eq('deal_type', 'renewal')
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(`scheduleRenewal: ${exErr.message}`);

  if (existing) {
    const row = existing as { id: string; next_contact_at: string | null };
    const { next, updated } = await refreshNextContact(orgId, row, now, sb);
    // Ronda 2 (H1): una renovación creada desde el modal (navegador, sin `enroll`) no quedó inscrita;
    // el servidor la inscribe aquí si aún no tiene inscripción. Sin `enroll` no se consulta nada.
    const seq = opts.enroll
      ? await enrollRenewalSequence(orgId, row.id, parent.customer_id, sb, opts.enroll, true)
      : { id: null, error: null };
    return {
      renewal_opportunity_id: row.id,
      parent_opportunity_id: parent.id,
      customer_id: parent.customer_id,
      renewal_date: plan.expiryDate.toISOString(),
      next_contact_at: next,
      tasks_created: 0,
      already_existed: true,
      updated,
      sequence_enrollment_id: seq.id,
      sequence_error: seq.error,
    };
  }

  const pipelineId = await getOrCreateRenewalPipelineServer(orgId, sb);
  const stageId = await firstStageId(pipelineId, sb);

  const { data: customer } = await sb
    .from('customers')
    .select('full_name')
    .eq('id', parent.customer_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  const customerName = (customer as { full_name: string | null } | null)?.full_name || 'Cliente';

  const { data: created, error: createError } = await sb
    .from('opportunities')
    .insert({
      organization_id: orgId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      customer_id: parent.customer_id,
      name: `Renovación — ${customerName} — ${plan.expiryPlainDate}`,
      amount: parent.amount ?? 0,
      currency: parent.currency || 'COP',
      status: 'open',
      deal_type: 'renewal',
      parent_opportunity_id: parent.id,
      salesperson_id: parent.salesperson_id ?? null,
      expected_close_date: plan.expiryPlainDate,
      next_contact_at: plan.nextContactAt ? plan.nextContactAt.toISOString() : null,
      billing_cycle_months: billingCycleMonths,
      branch_id: opts.branchId ?? parent.branch_id ?? null,
      created_by: opts.createdBy ?? null,
      metadata: { type: 'renewal', parent_opportunity_id: parent.id, billing_cycle_months: billingCycleMonths, renewal_date: plan.expiryDate.toISOString() },
    })
    .select('id')
    .single();
  if (createError?.code === '23505') {
    // uq_opportunities_one_renewal_per_parent (r2): otra llamada ganó la carrera → already_existed.
    const { data: raced, error: rErr } = await sb
      .from('opportunities')
      .select('id, next_contact_at')
      .eq('organization_id', orgId)
      .eq('parent_opportunity_id', parent.id)
      .eq('deal_type', 'renewal')
      .limit(1)
      .maybeSingle();
    if (rErr || !raced) throw new Error(`scheduleRenewal: 23505 pero la renovación no se encuentra: ${rErr?.message ?? 'sin fila'}`);
    const row = raced as { id: string; next_contact_at: string | null };
    return {
      renewal_opportunity_id: row.id,
      parent_opportunity_id: parent.id,
      customer_id: parent.customer_id,
      renewal_date: plan.expiryDate.toISOString(),
      next_contact_at: row.next_contact_at,
      tasks_created: 0,
      already_existed: true,
      updated: false,
      sequence_enrollment_id: null,
      sequence_error: null,
    };
  }
  if (createError || !created) throw new Error(`scheduleRenewal: crear renovación: ${createError?.message ?? 'sin fila'}`);
  const renewalOppId = (created as { id: string }).id;

  let tasksCreated = 0;
  if (plan.milestones.length > 0) {
    const { data: tasks, error: tasksError } = await sb
      .from('tasks')
      .insert(plan.milestones.map((m) => ({
        organization_id: orgId,
        title: milestoneTaskTitle(m.days),
        description: `Contactar a ${customerName}: la renovación vence el ${plan.expiryPlainDate}.`,
        due_date: m.dueAt.toISOString(),
        status: 'open',
        type: 'renewal_milestone',
        related_to_type: 'opportunity',
        related_to_id: renewalOppId,
        customer_id: parent.customer_id,
        assigned_to: parent.salesperson_id ?? null,
      })))
      .select('id');
    if (tasksError) throw new Error(`scheduleRenewal: crear hitos: ${tasksError.message}`);
    tasksCreated = (tasks ?? []).length;
  }

  const seq = await enrollRenewalSequence(orgId, renewalOppId, parent.customer_id, sb, opts.enroll, false);

  return {
    renewal_opportunity_id: renewalOppId,
    parent_opportunity_id: parent.id,
    customer_id: parent.customer_id,
    renewal_date: plan.expiryDate.toISOString(),
    next_contact_at: plan.nextContactAt ? plan.nextContactAt.toISOString() : null,
    tasks_created: tasksCreated,
    already_existed: false,
    updated: false,
    sequence_enrollment_id: seq.id,
    sequence_error: seq.error,
  };
}

/**
 * Tarea programada `renewals_sync` para UNA organización: recorre las
 * oportunidades ganadas con ciclo de facturación y crea/refresca su
 * renovación. Un contrato que falla (p. ej. `closed_at` null) se reporta en
 * `errors` y no detiene a los demás. Nunca lanza.
 */
export async function syncRenewalsForOrg(
  orgId: number,
  sb: SupabaseClient,
  opts: ScheduleRenewalOptions = {},
): Promise<RenewalSyncOrgResult> {
  const now = opts.now ?? new Date();
  const out: RenewalSyncOrgResult = { org_id: orgId, scanned: 0, created: 0, updated: 0, skipped: 0, enrolled: 0, errors: [] };
  const { data, error } = await sb
    .from('opportunities')
    .select(PARENT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('status', 'won')
    .gt('billing_cycle_months', 0)
    .limit(2000);
  if (error) {
    out.errors.push(`leer oportunidades ganadas: ${error.message}`);
    return out;
  }
  const parents = (data ?? []) as ParentRow[];
  out.scanned = parents.length;
  for (const parent of parents) {
    try {
      const r = await scheduleRenewalForParent(orgId, parent, Number(parent.billing_cycle_months), sb, now, { timezone: opts.timezone, enroll: opts.enroll });
      if (!r.already_existed) out.created += 1;
      else if (r.updated) out.updated += 1;
      else out.skipped += 1;
      if (r.sequence_enrollment_id) out.enrolled += 1;
      if (r.sequence_error) out.errors.push(`${parent.id}: secuencia de renovación: ${r.sequence_error}`);
    } catch (err) {
      out.errors.push(`${parent.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/**
 * Próximas renovaciones (ventana de N días) de la organización. Server-side.
 * Usa `closed_at`; las ganadas sin `closed_at` se omiten (no hay vencimiento).
 */
export async function getUpcomingRenewalsServer(
  orgId: number,
  sb: SupabaseClient,
  days: number = 90,
  now: Date = new Date(),
): Promise<UpcomingRenewal[]> {
  const { data: wonOpps, error } = await sb
    .from('opportunities')
    .select(`${PARENT_COLUMNS}, customer:customers(id, full_name, email, phone)`)
    .eq('organization_id', orgId)
    .eq('status', 'won')
    .gt('billing_cycle_months', 0)
    .limit(2000);
  if (error || !wonOpps) return [];

  const { data: renewals } = await sb
    .from('opportunities')
    .select('id, status, next_contact_at, parent_opportunity_id')
    .eq('organization_id', orgId)
    .eq('deal_type', 'renewal')
    .limit(2000);
  const byParent = new Map<string, { id: string; status: string; next_contact_at: string | null }>();
  for (const r of (renewals ?? []) as Array<{ id: string; status: string; next_contact_at: string | null; parent_opportunity_id: string | null }>) {
    if (r.parent_opportunity_id) byParent.set(r.parent_opportunity_id, r);
  }

  const results: UpcomingRenewal[] = [];
  for (const opp of wonOpps as unknown as Array<ParentRow & { customer: { id: string; full_name: string | null; email?: string | null; phone?: string | null } | null }>) {
    if (!opp.customer_id || !opp.closed_at) continue;
    let expiry: Date;
    try {
      expiry = buildRenewalPlan({ closedAt: opp.closed_at, billingCycleMonths: Number(opp.billing_cycle_months), now }).expiryDate;
    } catch {
      continue;
    }
    const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / DAY_MS);
    if (daysUntil > days || daysUntil < -30) continue;
    const renewal = byParent.get(opp.id) ?? null;
    results.push({
      opportunity_id: opp.id,
      renewal_opportunity_id: renewal?.id ?? null,
      customer_id: opp.customer_id,
      customer_name: opp.customer?.full_name || 'Sin nombre',
      customer_email: opp.customer?.email ?? null,
      customer_phone: opp.customer?.phone ?? null,
      original_amount: Number(opp.amount) || 0,
      currency: opp.currency || 'COP',
      billing_cycle_months: Number(opp.billing_cycle_months),
      won_date: opp.closed_at,
      renewal_date: expiry.toISOString(),
      days_until_renewal: daysUntil,
      next_milestone_days: renewal?.next_contact_at ? Math.floor((new Date(renewal.next_contact_at).getTime() - now.getTime()) / DAY_MS) : null,
      status: (renewal ? renewal.status : 'pending') as UpcomingRenewal['status'],
    });
  }
  return results.sort((a, b) => a.days_until_renewal - b.days_until_renewal);
}

// ─── Fachada de navegador (compatibilidad) ───────────────────────────────────
// Delega en las funciones server-side con el cliente del navegador (RLS por
// sesión). Sin lógica propia (regla 7 de CLAUDE.md).

class RenewalService {
  private getOrgId(override?: number): number {
    if (override && override > 0) return override;
    return getOrganizationId();
  }

  async getOrCreateRenewalPipeline(organizationId?: number): Promise<string | null> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return null;
      return await getOrCreateRenewalPipelineServer(orgId, supabase);
    } catch (err) {
      console.error('Error en renewalService.getOrCreateRenewalPipeline:', err);
      return null;
    }
  }

  /** @returns renovaciones creadas + actualizadas. */
  async syncRenewals(organizationId?: number): Promise<number> {
    const orgId = this.getOrgId(organizationId);
    if (!orgId) return 0;
    const r = await syncRenewalsForOrg(orgId, supabase);
    return r.created + r.updated;
  }

  async getUpcomingRenewals(days: number = 90, organizationId?: number): Promise<UpcomingRenewal[]> {
    try {
      const orgId = this.getOrgId(organizationId);
      if (!orgId) return [];
      return await getUpcomingRenewalsServer(orgId, supabase, days);
    } catch (err) {
      console.error('Error en renewalService.getUpcomingRenewals:', err);
      return [];
    }
  }
}

export const renewalService = new RenewalService();
export default renewalService;
