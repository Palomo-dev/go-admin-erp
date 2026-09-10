/**
 * Servicio CRM — Secuencias de seguimiento (FASE-08).
 *
 * CRUD + inscripción atómica + ejecución de pasos:
 *  - `enrollInSequence` llama a la RPC `fn_enroll_in_sequence`, que crea la
 *    inscripción, sus `sequence_step_runs` y el job del PRIMER paso en UNA
 *    transacción (fin del "inscrito fantasma", tester r1 #3) y respeta el
 *    índice único parcial de inscripciones vivas (tester r1 #1).
 *  - `processStepRun` RECLAMA el paso con un UPDATE guardado por estado
 *    (`.eq('status','pending')`), de modo que dos trabajadores no ejecutan el
 *    mismo paso (tester r1 #6), y recupera los que quedaron `running` tras una
 *    caída (`reclaimStaleStepRuns`).
 *  - Todas las lecturas/escrituras filtran por `organization_id` (tester r1 #11).
 *
 * Ronda 2 — programación ENCADENADA (tester r2 N1). Antes la RPC encolaba un
 * job por paso, todos con el mismo `run_at` cuando los retardos eran cero;
 * `fn_claim_jobs` ordena solo por `run_at`, así que con empate el paso `email`
 * podía ejecutarse ANTES que el `condition` que debía bloquearlo y el correo
 * salía igual. Ahora:
 *   1. `fn_enroll_in_sequence` crea todos los `step_runs` pero encola solo el
 *      job del PRIMER paso (`crm_v4_f08_03_enroll_chain_and_resume`).
 *   2. `processStepRun` encola el siguiente paso cuando el anterior termina
 *      (`advanceChain`), y NUNCA cuando la secuencia se corta o sale.
 *   3. Guarda de seguridad: si un paso anterior sigue `pending`/`running`
 *      (barrido de respaldo, job duplicado), el paso se devuelve a `pending` y
 *      se reencola en vez de ejecutarse (`waiting_previous_step`).
 *   4. Una inscripción `paused` ya NO consume sus pasos: se libera el reclamo y
 *      `fn_resume_sequence_enrollment` los reencola al reanudar (tester r2 N3).
 *
 * Tablas: sequences, sequence_steps, sequence_enrollments, sequence_step_runs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/crm/emailService';
import { SEQUENCE_STEP_CHANNELS } from '@/lib/crm/enums';
import { dueDateFrom, insertAutomationTask, type EnqueueFn } from './automation/actions';
import { evaluateConditionTree, isEmptyConditionTree, validateConditions } from './automation/conditionsDsl';
import { loadRuleContext, qualifyVarsForEmail } from './automation/ruleContext';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { scheduleSequenceSweep } from './sequenceSweep';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SequenceTriggerType = 'manual' | 'lead_capture' | 'stage_change' | 'event' | 'custom';
export type SequenceStepChannel = 'email' | 'whatsapp' | 'sms' | 'call' | 'task' | 'wait' | 'condition';
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'exited';
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Máximo de días de retardo por paso (coincide con el CHECK de BD). */
export const MAX_DELAY_DAYS = 3650;
/** Un paso `running` más viejo que esto se considera huérfano y se recupera. */
export const STALE_RUNNING_MINUTES = 15;
/** Espera antes de reintentar un paso bloqueado por el anterior (ms). */
export const WAITING_PREVIOUS_STEP_DELAY_MS = 60_000;
/**
 * Máximo de reencolados por «paso anterior sin resolver». Superado el tope el
 * paso se marca `skipped` (no se envía nada) en vez de girar para siempre.
 */
export const WAITING_PREVIOUS_STEP_MAX_WAITS = 30;

export interface Sequence {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  trigger_type: SequenceTriggerType;
  trigger_config: Record<string, unknown>;
  exit_conditions: unknown[];
  is_active: boolean;
  pause_on_reply?: boolean;
  pipeline_id?: string | null;
  stage_id?: string | null;
  created_at: string;
  updated_at: string;
  steps?: SequenceStep[];
}

export interface SequenceStep {
  id: string;
  organization_id: number;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  delay_hours?: number;
  channel: SequenceStepChannel;
  template_id: string | null;
  action_config: Record<string, unknown>;
  condition?: unknown;
  continue_on_error?: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SequenceEnrollment {
  id: string;
  organization_id: number;
  sequence_id: string;
  opportunity_id: string | null;
  customer_id: string | null;
  status: EnrollmentStatus;
  enrolled_at: string;
  exited_at: string | null;
  exit_reason: string | null;
  source?: string;
  created_at: string;
}

export interface SequenceStepRun {
  id: string;
  organization_id: number;
  enrollment_id: string;
  step_id: string;
  status: StepRunStatus;
  scheduled_at: string;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  attempts?: number;
  created_at: string;
}

export interface CreateSequenceStepInput {
  step_number: number;
  delay_days: number;
  delay_hours?: number;
  channel: SequenceStepChannel;
  template_id?: string;
  action_config?: Record<string, unknown>;
  condition?: unknown;
  /**
   * Un paso `condition` NO admite `true`: si la condición no se pudo evaluar,
   * la secuencia se corta (tester r3 N11).
   */
  continue_on_error?: boolean;
  name?: string;
  is_active?: boolean;
}

export interface CreateSequenceInput {
  name: string;
  description?: string;
  trigger_type?: SequenceTriggerType;
  trigger_config?: Record<string, unknown>;
  exit_conditions?: unknown[];
  is_active?: boolean;
  pause_on_reply?: boolean;
  pipeline_id?: string | null;
  stage_id?: string | null;
  created_by?: string | null;
  steps?: CreateSequenceStepInput[];
}

export type UpdateSequenceInput = Partial<Omit<CreateSequenceInput, 'steps' | 'created_by'>>;

export interface EnrollmentFilters {
  sequence_id?: string;
  status?: EnrollmentStatus;
  opportunity_id?: string;
  customer_id?: string;
  limit?: number;
  offset?: number;
}

export interface StepRunFilters {
  status?: StepRunStatus;
  enrollment_id?: string;
  scheduled_before?: string;
  limit?: number;
  offset?: number;
}

export interface EnrollOptions {
  customerId?: string | null;
  source?: 'manual' | 'rule' | 'stage' | 'bulk' | 'lead_capture' | string;
  enrolledBy?: string | null;
  startAt?: Date | string;
}

export interface EnrollResult {
  /** id de la inscripción (nueva o la viva que ya existía). */
  id: string;
  created: boolean;
  /** `already_active` cuando ya había una inscripción viva. */
  reason: string | null;
  steps: number;
  first_run_at: string | null;
  status: EnrollmentStatus;
}

/** Resultado del barrido de respaldo (`processPendingStepRuns`). */
export interface SweepCounters {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  reclaimed: number;
  /** Ejecuciones que LANZARON (aisladas una a una, tester r3 N9). */
  errors: number;
  /** Primer error del lote, para que el fallo se vea en el resultado del job. */
  first_error: string | null;
}

export const SEQUENCE_TRIGGER_TYPES: SequenceTriggerType[] = [
  'manual', 'lead_capture', 'stage_change', 'event', 'custom',
];

// ─── Validación ──────────────────────────────────────────────────────────────

/** Valida los pasos ANTES de escribir (la ruta devuelve 400, no un 500 tardío). */
export function validateSequenceSteps(steps: unknown): string[] {
  const issues: string[] = [];
  if (steps === undefined) return issues;
  if (!Array.isArray(steps)) return ['steps: debe ser un arreglo'];
  if (steps.length > 50) issues.push('steps: máximo 50 pasos por secuencia');

  const numbers = new Set<number>();
  steps.forEach((raw, i) => {
    const s = raw as CreateSequenceStepInput;
    if (!s || typeof s !== 'object') {
      issues.push(`steps[${i}]: objeto requerido`);
      return;
    }
    if (!Number.isInteger(s.step_number) || s.step_number < 1) {
      issues.push(`steps[${i}].step_number: entero ≥ 1`);
    } else if (numbers.has(s.step_number)) {
      issues.push(`steps[${i}].step_number: duplicado (${s.step_number})`);
    } else {
      numbers.add(s.step_number);
    }
    if (!(SEQUENCE_STEP_CHANNELS as readonly string[]).includes(String(s.channel))) {
      issues.push(`steps[${i}].channel no permitido: ${String(s.channel)}`);
    }
    const delay = s.delay_days;
    if (!Number.isInteger(delay) || (delay as number) < 0 || (delay as number) > MAX_DELAY_DAYS) {
      issues.push(`steps[${i}].delay_days: entero entre 0 y ${MAX_DELAY_DAYS}`);
    }
    if (s.delay_hours !== undefined
      && (!Number.isInteger(s.delay_hours) || s.delay_hours < 0 || s.delay_hours > 23)) {
      issues.push(`steps[${i}].delay_hours: entero entre 0 y 23`);
    }

    // ── Condición (tester r3 N10) ────────────────────────────────────────────
    // Hasta la ronda 2 no se validaba nada de esto: un paso `condition` sin
    // condición (lo único que la interfaz sabía crear) evaluaba a VERDADERO en
    // ejecución, así que el paso que decía «puede cortar la secuencia» no
    // cortaba nunca. Ahora se rechaza al guardar.
    const rawCondition = s.condition ?? (s.action_config as Record<string, unknown> | undefined)?.condition ?? null;
    if (rawCondition !== null && rawCondition !== undefined) {
      issues.push(...validateConditions(rawCondition, `steps[${i}].condition`));
    }
    if (String(s.channel) === 'condition') {
      if (isEmptyConditionTree(rawCondition)) {
        issues.push(
          `steps[${i}].condition: un paso de condición necesita al menos una regla `
          + '(una condición vacía dejaría pasar la secuencia en vez de cortarla)',
        );
      }
      if (s.continue_on_error === true) {
        issues.push(
          `steps[${i}].continue_on_error: un paso de condición no puede continuar ante error `
          + '(una condición que no se pudo evaluar corta la secuencia)',
        );
      }
    }
    if (s.continue_on_error !== undefined && typeof s.continue_on_error !== 'boolean') {
      issues.push(`steps[${i}].continue_on_error: booleano`);
    }
  });
  return issues;
}

export function validateSequenceInput(input: Partial<CreateSequenceInput>): string[] {
  const issues: string[] = [];
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length < 2)) {
    issues.push('name: mínimo 2 caracteres');
  }
  if (input.trigger_type !== undefined && !SEQUENCE_TRIGGER_TYPES.includes(input.trigger_type)) {
    issues.push(`trigger_type: debe ser ${SEQUENCE_TRIGGER_TYPES.join('|')}`);
  }
  if (input.exit_conditions !== undefined && !Array.isArray(input.exit_conditions)) {
    issues.push('exit_conditions: debe ser un arreglo');
  }
  issues.push(...validateSequenceSteps(input.steps));
  return issues;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getSequences(orgId: number, supabase: SupabaseClient): Promise<Sequence[]> {
  const { data: sequences, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getSequences: ${error.message}`);
  if (!sequences || sequences.length === 0) return [];

  const seqIds = (sequences as Sequence[]).map((s) => s.id);
  const { data: steps, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('organization_id', orgId)
    .in('sequence_id', seqIds)
    .order('step_number', { ascending: true });

  if (stepsError) throw new Error(`getSequences(steps): ${stepsError.message}`);

  const stepsMap = new Map<string, SequenceStep[]>();
  for (const s of (steps || []) as SequenceStep[]) {
    const list = stepsMap.get(s.sequence_id) || [];
    list.push(s);
    stepsMap.set(s.sequence_id, list);
  }

  return (sequences as Sequence[]).map((seq) => ({ ...seq, steps: stepsMap.get(seq.id) || [] }));
}

export async function createSequence(
  orgId: number,
  data: CreateSequenceInput,
  supabase: SupabaseClient,
): Promise<Sequence> {
  const issues = validateSequenceInput(data);
  if (issues.length) throw new Error(`Secuencia inválida: ${issues.join('; ')}`);

  const { data: sequence, error } = await supabase
    .from('sequences')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.trigger_type || 'manual',
      trigger_config: data.trigger_config || {},
      exit_conditions: data.exit_conditions || [],
      is_active: data.is_active ?? true,
      pause_on_reply: data.pause_on_reply ?? true,
      pipeline_id: data.pipeline_id ?? null,
      stage_id: data.stage_id ?? null,
      created_by: data.created_by ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  const createdSequence = sequence as Sequence;

  if (data.steps && data.steps.length > 0) {
    const stepRows = data.steps.map((s) => ({
      organization_id: orgId,
      sequence_id: createdSequence.id,
      step_number: s.step_number,
      delay_days: s.delay_days,
      delay_hours: s.delay_hours ?? 0,
      channel: s.channel,
      template_id: s.template_id || null,
      action_config: s.action_config || {},
      condition: s.condition ?? (s.action_config as Record<string, unknown> | undefined)?.condition ?? null,
      // `continue_on_error` es `true` por defecto en la BD, lo cual para un paso
      // de condición significaba «si la condición revienta, manda el correo
      // igual» (tester r3 N11). Un paso de condición se guarda siempre en
      // `false`; el CHECK de BD lo respalda.
      continue_on_error: String(s.channel) === 'condition' ? false : (s.continue_on_error ?? true),
      name: s.name ?? null,
      is_active: s.is_active ?? true,
    }));

    const { error: stepsError } = await supabase.from('sequence_steps').insert(stepRows);
    if (stepsError) {
      // Sin pasos la secuencia no sirve: se deshace para no dejar basura.
      await supabase.from('sequences').delete().eq('id', createdSequence.id).eq('organization_id', orgId);
      throw new Error(`No se pudieron crear los pasos: ${stepsError.message}`);
    }
  }

  const sequences = await getSequences(orgId, supabase);
  return sequences.find((s) => s.id === createdSequence.id) || createdSequence;
}

export async function updateSequence(
  id: string,
  orgId: number,
  data: UpdateSequenceInput,
  supabase: SupabaseClient,
): Promise<Sequence | null> {
  const issues = validateSequenceInput(data);
  if (issues.length) throw new Error(`Secuencia inválida: ${issues.join('; ')}`);

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
  if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
  if (data.exit_conditions !== undefined) updateData.exit_conditions = data.exit_conditions;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.pause_on_reply !== undefined) updateData.pause_on_reply = data.pause_on_reply;
  if (data.pipeline_id !== undefined) updateData.pipeline_id = data.pipeline_id;
  if (data.stage_id !== undefined) updateData.stage_id = data.stage_id;

  const { data: result, error } = await supabase
    .from('sequences')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return result as Sequence | null;
}

export async function deleteSequence(id: string, orgId: number, supabase: SupabaseClient): Promise<void> {
  const { data: live, error: liveError } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('organization_id', orgId)
    .eq('sequence_id', id)
    .in('status', ['active', 'paused'])
    .limit(1);
  if (liveError) throw new Error(`deleteSequence: ${liveError.message}`);
  if ((live ?? []).length > 0) {
    throw new Error('La secuencia tiene inscripciones activas: desinscríbelas o pausa la secuencia antes de borrarla');
  }

  await supabase.from('sequence_steps').delete().eq('sequence_id', id).eq('organization_id', orgId);

  const { error } = await supabase.from('sequences').delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw error;
}

// ─── Inscripción atómica ────────────────────────────────────────────────────

/**
 * Inscribe una oportunidad (o un cliente) en una secuencia.
 *
 * Toda la operación ocurre dentro de `fn_enroll_in_sequence`:
 * valida secuencia activa y pertenencia a la organización, evita la inscripción
 * viva duplicada, crea `sequence_enrollments` + `sequence_step_runs` y encola
 * **un solo** job `sequence_step` —el del primer paso, `dedupe_key =
 * seqrun:{id}`— más el barrido `time_events` de la organización. El resto de
 * los pasos los encola `advanceChain` uno a uno (programación encadenada).
 */
export async function enrollInSequence(
  orgId: number,
  sequenceId: string,
  opportunityId: string | null,
  supabase: SupabaseClient,
  options: EnrollOptions = {},
): Promise<EnrollResult> {
  const startAt = options.startAt
    ? (options.startAt instanceof Date ? options.startAt : new Date(options.startAt))
    : new Date();
  if (Number.isNaN(startAt.getTime())) throw new Error('enrollInSequence: startAt inválido');

  const { data, error } = await supabase.rpc('fn_enroll_in_sequence', {
    p_org: orgId,
    p_sequence_id: sequenceId,
    p_opportunity_id: opportunityId,
    p_customer_id: options.customerId ?? null,
    p_source: options.source ?? 'manual',
    p_enrolled_by: options.enrolledBy ?? null,
    p_start_at: startAt.toISOString(),
  });

  if (error) throw new Error(`enrollInSequence: ${error.message}`);
  const result = (data ?? {}) as {
    created?: boolean;
    reason?: string;
    enrollment_id?: string;
    steps?: number;
    first_run_at?: string | null;
  };
  if (!result.enrollment_id) throw new Error('enrollInSequence: la RPC no devolvió enrollment_id');

  return {
    id: result.enrollment_id,
    created: result.created === true,
    reason: result.reason ?? null,
    steps: result.steps ?? 0,
    first_run_at: result.first_run_at ?? null,
    status: 'active',
  };
}

export async function getEnrollments(
  orgId: number,
  supabase: SupabaseClient,
  filters?: EnrollmentFilters,
): Promise<{ data: SequenceEnrollment[]; count: number }> {
  let query = supabase
    .from('sequence_enrollments')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('enrolled_at', { ascending: false });

  if (filters?.sequence_id) query = query.eq('sequence_id', filters.sequence_id);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.opportunity_id) query = query.eq('opportunity_id', filters.opportunity_id);
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);

  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const offset = Math.max(filters?.offset ?? 0, 0);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`getEnrollments: ${error.message}`);
  return { data: (data || []) as SequenceEnrollment[], count: count || 0 };
}

/** Saca a un inscrito de la secuencia (manual o por regla). */
export async function unenrollFromSequence(
  orgId: number,
  enrollmentId: string,
  supabase: SupabaseClient,
  reason = 'manual_unenroll',
): Promise<SequenceEnrollment | null> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .update({ status: 'exited', exited_at: new Date().toISOString(), exit_reason: reason })
    .eq('id', enrollmentId)
    .eq('organization_id', orgId)
    .in('status', ['active', 'paused'])
    .select()
    .maybeSingle();
  if (error) throw new Error(`unenrollFromSequence: ${error.message}`);

  if (data) {
    await supabase
      .from('sequence_step_runs')
      .update({ status: 'skipped', result: { reason: `enrollment_${reason}` } })
      .eq('organization_id', orgId)
      .eq('enrollment_id', enrollmentId)
      .eq('status', 'pending');
  }
  return (data as SequenceEnrollment | null) ?? null;
}

export interface ResumeResult {
  resumed: boolean;
  reason: string | null;
  status: EnrollmentStatus | null;
  step_run_id: string | null;
  next_run_at: string | null;
}

/**
 * Reanuda una inscripción `paused` (tester r2 N3: pausar por respuesta del
 * cliente era una puerta de un solo sentido).
 *
 * Todo ocurre dentro de `fn_resume_sequence_enrollment`: valida membresía y
 * organización, vuelve a `active`, reprograma a `now()` el siguiente paso
 * pendiente cuya hora ya pasó y encola su job. Es una RPC y no TS porque
 * `fn_enqueue_job` tiene EXECUTE revocado para `authenticated`: desde la ruta
 * (cliente de sesión) no se puede encolar sin ella.
 */
export async function resumeEnrollment(
  orgId: number,
  enrollmentId: string,
  supabase: SupabaseClient,
): Promise<ResumeResult> {
  const { data, error } = await supabase.rpc('fn_resume_sequence_enrollment', {
    p_org: orgId,
    p_enrollment_id: enrollmentId,
  });
  if (error) throw new Error(`resumeEnrollment: ${error.message}`);

  const result = (data ?? {}) as {
    resumed?: boolean;
    reason?: string;
    status?: EnrollmentStatus;
    step_run_id?: string;
    next_run_at?: string;
  };
  return {
    resumed: result.resumed === true,
    reason: result.reason ?? null,
    status: result.status ?? null,
    step_run_id: result.step_run_id ?? null,
    next_run_at: result.next_run_at ?? null,
  };
}

export async function getStepRuns(
  orgId: number,
  supabase: SupabaseClient,
  filters?: StepRunFilters,
): Promise<{ data: SequenceStepRun[]; count: number }> {
  let query = supabase
    .from('sequence_step_runs')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('scheduled_at', { ascending: true });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.enrollment_id) query = query.eq('enrollment_id', filters.enrollment_id);
  if (filters?.scheduled_before) query = query.lte('scheduled_at', filters.scheduled_before);

  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  const offset = Math.max(filters?.offset ?? 0, 0);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`getStepRuns: ${error.message}`);
  return { data: (data || []) as SequenceStepRun[], count: count || 0 };
}

// ─── Ejecución de pasos ─────────────────────────────────────────────────────

interface StepCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ProcessStepOptions {
  enqueue?: EnqueueFn;
  /** Minutos tras los que un `running` se considera huérfano (default 15). */
  staleMinutes?: number;
}

/**
 * Encolador por defecto: reutiliza el cliente que ya trae el llamador (el
 * runner usa service_role) en vez de construir otro con `getServiceClient()`.
 */
function enqueueWith(supabase: SupabaseClient, override?: EnqueueFn): EnqueueFn {
  return override ?? ((input) => enqueueJob({ ...input, supabase }));
}

/** Runs de una inscripción con el `step_number` de su paso resuelto. */
interface PlannedRun {
  id: string;
  step_id: string;
  step_number: number;
  status: StepRunStatus;
  scheduled_at: string;
}

async function loadRunPlan(
  supabase: SupabaseClient,
  orgId: number,
  enrollmentId: string,
  statuses: StepRunStatus[],
): Promise<PlannedRun[]> {
  const { data: runs, error } = await supabase
    .from('sequence_step_runs')
    .select('id, step_id, status, scheduled_at')
    .eq('organization_id', orgId)
    .eq('enrollment_id', enrollmentId)
    .in('status', statuses);
  if (error) throw new Error(`loadRunPlan: ${error.message}`);

  const rows = (runs ?? []) as { id: string; step_id: string; status: StepRunStatus; scheduled_at: string }[];
  if (rows.length === 0) return [];

  const { data: stepRows, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('id, step_number')
    .eq('organization_id', orgId)
    .in('id', rows.map((r) => r.step_id));
  if (stepsError) throw new Error(`loadRunPlan(steps): ${stepsError.message}`);

  const numberById = new Map(
    ((stepRows ?? []) as { id: string; step_number: number }[]).map((s) => [s.id, s.step_number]),
  );

  return rows
    .map((r) => ({ ...r, step_number: numberById.get(r.step_id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.step_number - b.step_number);
}

/**
 * Reclama el paso de forma atómica: un único UPDATE con guarda de estado.
 * Devuelve la fila reclamada o `null` si otro trabajador se adelantó.
 */
export async function claimStepRun(
  runId: string,
  orgId: number,
  supabase: SupabaseClient,
  staleMinutes = STALE_RUNNING_MINUTES,
): Promise<SequenceStepRun | null> {
  const nowIso = new Date().toISOString();

  const { data: claimed, error } = await supabase
    .from('sequence_step_runs')
    .update({ status: 'running', executed_at: nowIso })
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throw new Error(`claimStepRun: ${error.message}`);
  if (claimed) return claimed as SequenceStepRun;

  // Recuperación de un paso que quedó `running` tras una caída.
  const staleIso = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data: reclaimed, error: reclaimError } = await supabase
    .from('sequence_step_runs')
    .update({ status: 'running', executed_at: nowIso })
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('status', 'running')
    .lte('executed_at', staleIso)
    .select()
    .maybeSingle();
  if (reclaimError) throw new Error(`claimStepRun(stale): ${reclaimError.message}`);
  return (reclaimed as SequenceStepRun | null) ?? null;
}

/** Devuelve a `pending` los pasos que quedaron `running` sin terminar. */
export async function reclaimStaleStepRuns(
  orgId: number,
  supabase: SupabaseClient,
  staleMinutes = STALE_RUNNING_MINUTES,
): Promise<number> {
  const staleIso = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('sequence_step_runs')
    .update({ status: 'pending' })
    .eq('organization_id', orgId)
    .eq('status', 'running')
    .lte('executed_at', staleIso)
    .select('id');
  if (error) throw new Error(`reclaimStaleStepRuns: ${error.message}`);
  return ((data ?? []) as unknown[]).length;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  orgId: number,
  patch: Record<string, unknown>,
  fallback: SequenceStepRun,
): Promise<SequenceStepRun> {
  const { data, error } = await supabase
    .from('sequence_step_runs')
    .update(patch)
    .eq('id', runId)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();
  if (error) {
    return {
      ...fallback,
      ...patch,
      error_message: `${patch.error_message ?? ''} [persist_error: ${error.message}]`.trim(),
    } as SequenceStepRun;
  }
  return (data as SequenceStepRun | null) ?? ({ ...fallback, ...patch } as SequenceStepRun);
}

/**
 * Ejecuta un `sequence_step_run`. Lo llama el handler de la cola
 * (`kind='sequence_step'`) y el barrido `processPendingStepRuns`.
 */
export async function processStepRun(
  runId: string,
  orgId: number,
  supabase: SupabaseClient,
  options: ProcessStepOptions = {},
): Promise<SequenceStepRun> {
  const enqueue = enqueueWith(supabase, options.enqueue);
  const claimed = await claimStepRun(runId, orgId, supabase, options.staleMinutes);
  if (!claimed) {
    const { data: current, error } = await supabase
      .from('sequence_step_runs')
      .select('*')
      .eq('id', runId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) throw new Error(`processStepRun: ${error.message}`);
    if (!current) throw new Error('Step run no encontrado');
    return current as SequenceStepRun;
  }

  const stepRun = claimed;

  const { data: stepData, error: stepError } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('id', stepRun.step_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (stepError) throw new Error(`processStepRun(step): ${stepError.message}`);
  const step = stepData as SequenceStep | null;

  if (!step) {
    // Sin el paso no se sabe su posición: no se puede avanzar la cadena.
    return finishRun(supabase, runId, orgId, { status: 'skipped', result: { reason: 'step_not_found' } }, stepRun);
  }
  if (!step.is_active) {
    const skippedRun = await finishRun(
      supabase, runId, orgId, { status: 'skipped', result: { reason: 'step_inactive' } }, stepRun,
    );
    // Un paso desactivado no corta la secuencia: se pasa al siguiente.
    await advanceChain(supabase, orgId, stepRun.enrollment_id, step.step_number, enqueue, runId);
    return skippedRun;
  }

  const { data: enrollData, error: enrollError } = await supabase
    .from('sequence_enrollments')
    .select('*')
    .eq('id', stepRun.enrollment_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (enrollError) throw new Error(`processStepRun(enrollment): ${enrollError.message}`);
  const enrollment = enrollData as SequenceEnrollment | null;

  // Pausada: NO se consume el paso. Antes cada job pendiente lo marcaba
  // `skipped` y la secuencia moría en silencio (tester r2 N3). Ahora se libera
  // el reclamo y `fn_resume_sequence_enrollment` lo vuelve a encolar.
  if (enrollment && enrollment.status === 'paused') {
    return finishRun(
      supabase,
      runId,
      orgId,
      {
        status: 'pending',
        executed_at: null,
        result: { reason: 'enrollment_paused', paused_reason: (enrollment as { paused_reason?: string }).paused_reason ?? null },
      },
      stepRun,
    );
  }

  if (!enrollment || enrollment.status !== 'active') {
    return finishRun(
      supabase,
      runId,
      orgId,
      { status: 'skipped', result: { reason: `enrollment_${enrollment?.status || 'not_found'}` } },
      stepRun,
    );
  }

  // ── Guarda del orden de pasos (tester r2 N1) ──────────────────────────────
  // Con la programación encadenada esto no debería ocurrir; protege el barrido
  // de respaldo (que ordena por `scheduled_at` y empata) y los jobs duplicados.
  const blocking = (await loadRunPlan(supabase, orgId, enrollment.id, ['pending', 'running']))
    .find((r) => r.id !== runId && r.step_number < step.step_number);

  if (blocking) {
    const waits = Number((stepRun.result as { waits?: unknown } | null)?.waits ?? 0) + 1;
    if (waits > WAITING_PREVIOUS_STEP_MAX_WAITS) {
      // Se corta en seco: nunca se envía saltándose el paso anterior.
      return finishRun(
        supabase,
        runId,
        orgId,
        {
          status: 'skipped',
          result: { reason: 'waiting_previous_step_timeout', blocked_by_step_run_id: blocking.id, waits },
        },
        stepRun,
      );
    }

    const retryAt = new Date(Date.now() + WAITING_PREVIOUS_STEP_DELAY_MS);
    const released = await finishRun(
      supabase,
      runId,
      orgId,
      {
        status: 'pending',
        executed_at: null,
        result: {
          reason: 'waiting_previous_step',
          blocked_by_step_run_id: blocking.id,
          blocked_by_step_number: blocking.step_number,
          waits,
        },
      },
      stepRun,
    );
    // `seqrun:{id}` está ocupado por el job vivo que nos trajo aquí: clave nueva.
    await enqueue({
      organizationId: orgId,
      kind: 'sequence_step',
      payload: { step_run_id: runId, enrollment_id: enrollment.id, waiting_for: blocking.id },
      runAt: retryAt,
      dedupeKey: `seqrun:${runId}:wait:${waits}`,
      maxAttempts: 3,
    });
    return released;
  }

  let customer: StepCustomer | null = null;
  if (enrollment.customer_id) {
    const { data: custData, error: custError } = await supabase
      .from('customers')
      .select('id, full_name, email, phone')
      .eq('id', enrollment.customer_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (custError) throw new Error(`processStepRun(customer): ${custError.message}`);
    customer = (custData as StepCustomer | null) ?? null;
  }

  try {
    let result: Record<string, unknown> = {};
    let branch: boolean | undefined;

    switch (step.channel) {
      case 'email': {
        if (!customer?.email) throw new Error('Customer no tiene email');
        const actionConfig = step.action_config || {};
        const variables = {
          customer_name: customer.full_name ?? '',
          ...((actionConfig.template_variables as Record<string, string | number>) || {}),
        };
        // Las variables planas del paso (`{{customer_name}}`) se cualifican a
        // `{{custom.customer_name}}`, que es donde F7 las coloca; sin esto
        // `strict_variables` hacía fallar el envío con MISSING_VARIABLES
        // (tester r3 N12). El valor lo sustituye y lo escapa F7, no F8.
        const stringVars: Record<string, string> = Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, String(v ?? '')]),
        );
        const emailMessage = await sendEmail(
          orgId,
          {
            to: customer.email,
            to_customer_id: customer.id,
            subject: qualifyVarsForEmail((actionConfig.subject as string) || 'Seguimiento', stringVars),
            html: qualifyVarsForEmail((actionConfig.html as string) || '', stringVars),
            template_id: step.template_id || undefined,
            template_variables: variables,
            related_type: 'opportunity',
            related_id: enrollment.opportunity_id || undefined,
            sequence_step_run_id: runId,
            // Idempotencia: un reintento del mismo paso no reenvía el correo.
            idempotency_key: `seqrun:${runId}`,
            kind: 'sequence',
          },
          supabase,
        );
        result = { channel: 'email', email_message_id: emailMessage.id };
        break;
      }

      case 'whatsapp': {
        if (!customer?.id) throw new Error('El paso de WhatsApp requiere un cliente');
        if (!customer.phone) throw new Error('El cliente no tiene teléfono');
        const actionConfig = step.action_config || {};
        // F16 aplica opt-out, ventana de 24 h y plantilla HSM al despachar.
        const jobId = await enqueue({
          organizationId: orgId,
          kind: 'whatsapp',
          payload: {
            message_request: {
              orgId,
              customerId: customer.id,
              opportunityId: enrollment.opportunity_id,
              text: (actionConfig.text as string) || null,
              template: step.template_id
                ? { templateId: step.template_id, variables: (actionConfig.template_variables as Record<string, unknown>) || {} }
                : null,
              purpose: (actionConfig.purpose as 'utility' | 'marketing') || 'utility',
              source: 'sequence',
              clientRequestId: `seqrun:${runId}`,
            },
            customer_id: customer.id,
            sequence_step_run_id: runId,
          },
          dedupeKey: `seqrun-wa:${runId}`,
          maxAttempts: 3,
        });
        result = { channel: 'whatsapp', job_id: jobId, queued: true };
        break;
      }

      case 'sms':
        // No hay proveedor SMS conectado todavía: se declara, no se finge.
        throw new Error('Canal sms no implementado (pendiente de proveedor)');

      case 'call': {
        const actionConfig = step.action_config || {};
        const taskId = await insertAutomationTask(supabase, orgId, {
          title: (actionConfig.title as string) || `Llamar a ${customer?.full_name ?? 'el cliente'}`,
          description: (actionConfig.script as string) || (actionConfig.description as string) || '',
          dueDate: dueDateFrom(new Date(), actionConfig.due_in_days ?? 0),
          priority: (actionConfig.priority as string) || 'med',
          type: 'call',
          opportunityId: enrollment.opportunity_id,
          customerId: enrollment.customer_id,
        });
        result = { channel: 'call', task_id: taskId };
        break;
      }

      case 'task': {
        const actionConfig = step.action_config || {};
        const taskId = await insertAutomationTask(supabase, orgId, {
          title: (actionConfig.title as string) || `Tarea de secuencia: ${customer?.full_name ?? ''}`.trim(),
          description: (actionConfig.description as string) || '',
          dueDate: dueDateFrom(new Date(), actionConfig.due_in_days ?? 1),
          priority: (actionConfig.priority as string) || 'med',
          type: (actionConfig.task_type as string) || 'followup',
          opportunityId: enrollment.opportunity_id,
          customerId: enrollment.customer_id,
        });
        result = { channel: 'task', task_id: taskId };
        break;
      }

      case 'wait':
        result = { channel: 'wait', waited_days: step.delay_days };
        break;

      case 'condition': {
        const definition = step.condition ?? (step.action_config || {}).condition ?? null;
        // Fail-closed (tester r3 N10): una condición vacía o malformada
        // normaliza a un grupo AND vacío, que evalúa a VERDADERO. En una regla
        // de automatización eso es correcto («sin condiciones» = siempre); en
        // un paso que la interfaz anuncia como «puede cortar la secuencia» es
        // justo lo contrario de lo que el usuario espera. Se corta, no se pasa.
        if (isEmptyConditionTree(definition)) {
          throw new Error(
            'condition_not_configured: el paso de condición no tiene ninguna regla; '
            + 'la secuencia se corta en vez de darla por cumplida',
          );
        }
        const ctx = await loadRuleContext(
          { orgId, opportunityId: enrollment.opportunity_id, customerId: enrollment.customer_id },
          supabase,
        );
        const evaluated = evaluateConditionTree(definition, ctx);
        branch = evaluated.result;
        result = { channel: 'condition', branch: evaluated.result, trace: evaluated.trace };
        break;
      }

      default:
        throw new Error(`Canal desconocido: ${String(step.channel)}`);
    }

    // Condición falsa: la secuencia se corta aquí (los pasos siguientes no se
    // ejecutan y NO se encola ninguno). Antes el correo salía igual porque su
    // job compartía `run_at` con el de la condición (tester r1 #9 / r2 N1).
    //
    // Los pasos restantes se marcan ANTES de escribir `completed` (tester r3
    // N14): entre ambas escrituras había un instante en el que la condición ya
    // no estaba en `pending|running` —así que la guarda de orden no frenaba a
    // nadie— y el correo seguía `pending`. Marcándolos primero, ese hueco no
    // existe.
    if (branch === false) {
      await skipRemainingSteps(supabase, orgId, enrollment.id, step.step_number, 'condition_false');
    }

    const completed = await finishRun(
      supabase,
      runId,
      orgId,
      { status: 'completed', result, ...(branch === undefined ? {} : { branch_taken: branch }) },
      stepRun,
    );

    if (branch === false) {
      await exitEnrollment(supabase, orgId, enrollment.id, 'condition_false');
      return completed;
    }

    const exit = await checkExitConditions(enrollment.id, orgId, supabase);
    if (!exit.shouldExit) {
      await advanceChain(supabase, orgId, enrollment.id, step.step_number, enqueue, runId);
    }
    return completed;
  } catch (execErr) {
    const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
    const failed = await finishRun(
      supabase,
      runId,
      orgId,
      { status: 'failed', error_message: errMsg.slice(0, 2000) },
      stepRun,
    );
    // Un paso fallido no puede dejar la inscripción colgada para siempre.
    //
    // `continue_on_error` es `true` por DEFECTO en la base, y para un paso de
    // condición eso significaba «si la condición revienta —un error transitorio
    // leyendo la oportunidad, el cliente o el consentimiento—, encola el paso
    // siguiente igual», es decir: manda el correo sin haber evaluado nada
    // (tester r3 N11). Una condición que no se pudo evaluar CORTA, siempre,
    // diga lo que diga la columna.
    const cutsOnError = step.continue_on_error === false || step.channel === 'condition';
    if (cutsOnError) {
      const cutReason = step.channel === 'condition' ? 'condition_unevaluable' : 'previous_step_failed';
      await skipRemainingSteps(supabase, orgId, stepRun.enrollment_id, step.step_number, cutReason);
      await exitEnrollment(
        supabase, orgId, stepRun.enrollment_id,
        step.channel === 'condition' ? 'condition_unevaluable' : 'step_failed',
      );
    } else {
      const exit = await checkExitConditions(stepRun.enrollment_id, orgId, supabase);
      if (!exit.shouldExit) {
        await advanceChain(supabase, orgId, stepRun.enrollment_id, step.step_number, enqueue, runId);
      }
    }
    return failed;
  }
}

/**
 * Encola el job del siguiente paso pendiente de la inscripción (programación
 * encadenada, tester r2 N1). Devuelve el id del job o `null` si no queda nada.
 *
 * Si el encolado falla, el error NO se traga: queda escrito en el `result` del
 * paso siguiente (`chain_error`) y ese paso sigue `pending`, así que el barrido
 * de respaldo (`processPendingStepRuns`, kind `time_events`) lo recupera cuando
 * venza. Lanzar aquí no serviría: el paso actual ya se ejecutó y el reintento
 * del job no volvería a entrar (el reclamo fallaría por estado).
 */
async function advanceChain(
  supabase: SupabaseClient,
  orgId: number,
  enrollmentId: string,
  fromStepNumber: number,
  enqueue: EnqueueFn,
  currentRunId: string,
): Promise<string | null> {
  const next = (await loadRunPlan(supabase, orgId, enrollmentId, ['pending']))
    .find((r) => r.id !== currentRunId && r.step_number > fromStepNumber);
  if (!next) return null;

  const runAt = new Date(Math.max(new Date(next.scheduled_at).getTime() || Date.now(), Date.now()));

  try {
    const jobId = await enqueue({
      organizationId: orgId,
      kind: 'sequence_step',
      payload: { step_run_id: next.id, enrollment_id: enrollmentId },
      runAt,
      dedupeKey: `seqrun:${next.id}`,
      maxAttempts: 3,
    });
    await supabase
      .from('sequence_step_runs')
      .update({ job_id: jobId })
      .eq('id', next.id)
      .eq('organization_id', orgId);
    await supabase
      .from('sequence_enrollments')
      .update({ next_run_at: runAt.toISOString(), current_step_id: next.step_id })
      .eq('id', enrollmentId)
      .eq('organization_id', orgId);
    return jobId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('sequence_step_runs')
      .update({ result: { chain_error: message.slice(0, 500) } })
      .eq('id', next.id)
      .eq('organization_id', orgId)
      .eq('status', 'pending');
    // La cadena se rompió: el paso queda `pending` esperando al barrido, así
    // que hay que asegurarse de que el barrido EXISTE (tester r3 N9: solo lo
    // sembraban inscribir y reanudar). Si tampoco se puede sembrar, se anota
    // en el mismo `result` en vez de tragarlo.
    try {
      await scheduleSequenceSweep(orgId, supabase, 0);
    } catch (sweepErr) {
      const sweepMessage = sweepErr instanceof Error ? sweepErr.message : String(sweepErr);
      await supabase
        .from('sequence_step_runs')
        .update({ result: { chain_error: message.slice(0, 500), sweep_error: sweepMessage.slice(0, 300) } })
        .eq('id', next.id)
        .eq('organization_id', orgId)
        .eq('status', 'pending');
    }
    return null;
  }
}

/** Marca como `skipped` los pasos pendientes posteriores al indicado. */
async function skipRemainingSteps(
  supabase: SupabaseClient,
  orgId: number,
  enrollmentId: string,
  fromStepNumber: number,
  reason: string,
): Promise<void> {
  const runs = await loadRunPlan(supabase, orgId, enrollmentId, ['pending']);
  if (runs.length === 0) return;

  for (const run of runs) {
    if (run.step_number <= fromStepNumber) continue;
    const { error: updError } = await supabase
      .from('sequence_step_runs')
      .update({ status: 'skipped', result: { reason } })
      .eq('id', run.id)
      .eq('organization_id', orgId)
      .eq('status', 'pending');
    if (updError) throw new Error(`skipRemainingSteps(update): ${updError.message}`);
  }
}

async function exitEnrollment(
  supabase: SupabaseClient,
  orgId: number,
  enrollmentId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('sequence_enrollments')
    .update({ status: 'exited', exited_at: new Date().toISOString(), exit_reason: reason })
    .eq('id', enrollmentId)
    .eq('organization_id', orgId)
    .in('status', ['active', 'paused']);
  if (error) throw new Error(`exitEnrollment: ${error.message}`);
}

/**
 * Condiciones de salida de una inscripción. SIEMPRE con filtro de organización
 * (antes escribía solo por id y cruzaba inquilinos con el cliente service-role).
 *
 * Soporta `sequences.exit_conditions`: `won_lost` (por defecto),
 * `stage_changed` (respecto a la etapa de la inscripción) y `opted_out`.
 */
export async function checkExitConditions(
  enrollmentId: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<{ shouldExit: boolean; reason: string | null }> {
  const { data: enrollment, error } = await supabase
    .from('sequence_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`checkExitConditions: ${error.message}`);
  if (!enrollment) return { shouldExit: false, reason: null };

  const enroll = enrollment as SequenceEnrollment;
  if (enroll.status !== 'active') return { shouldExit: false, reason: null };

  const { data: sequence, error: seqError } = await supabase
    .from('sequences')
    .select('exit_conditions')
    .eq('id', enroll.sequence_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (seqError) throw new Error(`checkExitConditions(sequence): ${seqError.message}`);

  const configured = (((sequence as { exit_conditions?: unknown[] } | null)?.exit_conditions) ?? []) as unknown[];
  const names = new Set(
    configured
      .map((c) => (typeof c === 'string' ? c : (c as { type?: string })?.type))
      .filter((c): c is string => typeof c === 'string'),
  );
  // `won_lost` es el comportamiento histórico y se mantiene aunque no se configure.
  names.add('won_lost');

  const exitWith = async (reason: string) => {
    await exitEnrollment(supabase, orgId, enrollmentId, reason);
    return { shouldExit: true, reason };
  };

  if (enroll.opportunity_id && names.has('won_lost')) {
    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('status')
      .eq('id', enroll.opportunity_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (oppError) throw new Error(`checkExitConditions(opportunity): ${oppError.message}`);
    const oppStatus = (opportunity as { status: string } | null)?.status;
    if (oppStatus === 'won' || oppStatus === 'lost' || oppStatus === 'closed') {
      return exitWith(`opportunity_${oppStatus}`);
    }
  }

  if (enroll.customer_id && names.has('opted_out')) {
    const { data: consents, error: consentError } = await supabase
      .from('contact_consents')
      .select('channel, status')
      .eq('organization_id', orgId)
      .eq('customer_id', enroll.customer_id)
      .eq('status', 'opted_out');
    if (consentError) throw new Error(`checkExitConditions(consents): ${consentError.message}`);
    if (((consents ?? []) as unknown[]).length > 0) return exitWith('opted_out');
  }

  const { data: pendingRuns, error: pendingError } = await supabase
    .from('sequence_step_runs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('enrollment_id', enrollmentId)
    .in('status', ['pending', 'running'])
    .limit(1);
  if (pendingError) throw new Error(`checkExitConditions(step_runs): ${pendingError.message}`);

  if (!pendingRuns || pendingRuns.length === 0) {
    const { error: completeError } = await supabase
      .from('sequence_enrollments')
      .update({
        status: 'completed',
        exited_at: new Date().toISOString(),
        exit_reason: 'all_steps_completed',
      })
      .eq('id', enrollmentId)
      .eq('organization_id', orgId)
      .eq('status', 'active');
    if (completeError) throw new Error(`checkExitConditions(complete): ${completeError.message}`);
    return { shouldExit: true, reason: 'all_steps_completed' };
  }

  return { shouldExit: false, reason: null };
}

/**
 * Barrido de respaldo: procesa los `pending` vencidos de una organización.
 * El camino normal es la cola (`sequence_step`); esto recupera los pasos cuyo
 * job se perdió y los que quedaron `running` tras una caída.
 */
export async function processPendingStepRuns(
  orgId: number,
  supabase: SupabaseClient,
  batchSize = 50,
  options: ProcessStepOptions = {},
): Promise<SweepCounters> {
  const reclaimed = await reclaimStaleStepRuns(orgId, supabase, options.staleMinutes);
  const now = new Date().toISOString();
  const limit = Math.min(Math.max(batchSize, 1), 200);

  const { data: pendingRuns, error } = await supabase
    .from('sequence_step_runs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`processPendingStepRuns: ${error.message}`);

  if (!pendingRuns || pendingRuns.length === 0) {
    return { processed: 0, completed: 0, failed: 0, skipped: 0, reclaimed, errors: 0, first_error: null };
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (const run of pendingRuns as { id: string }[]) {
    // Aislamiento por ejecución (tester r3 N9). Antes un solo run defectuoso
    // —`processStepRun` lanza en cualquier error de lectura— hacía saltar el
    // lote entero; tres lotes seguidos dejaban el job `dead` y la organización
    // sin barrido para siempre. El fallo se cuenta y se devuelve, no se traga.
    try {
      const result = await processStepRun(run.id, orgId, supabase, options);
      if (result.status === 'completed') completed++;
      else if (result.status === 'failed') failed++;
      else if (result.status === 'skipped') skipped++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      if (!firstError) firstError = `${run.id}: ${message}`.slice(0, 500);
    }
  }

  return {
    processed: pendingRuns.length,
    completed,
    failed,
    skipped,
    reclaimed,
    errors,
    first_error: firstError,
  };
}
