/**
 * Servicio CRM — Secuencias de seguimiento (Fase 8).
 *
 * Gestiona secuencias, pasos, inscripciones y ejecución de step_runs.
 * Diseñado para ser invocado por un cron que procesa step_runs pendientes.
 *
 * Tablas:
 *   sequences, sequence_steps, sequence_enrollments, sequence_step_runs,
 *   email_messages, activities, opportunities, customers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/crm/emailService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SequenceTriggerType = 'manual' | 'lead_capture' | 'stage_change' | 'custom';
export type SequenceStepChannel = 'email' | 'whatsapp' | 'sms' | 'call' | 'task' | 'wait' | 'condition';
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'exited';
export type StepRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Sequence {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  trigger_type: SequenceTriggerType;
  trigger_config: Record<string, unknown>;
  exit_conditions: Record<string, unknown>[];
  is_active: boolean;
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
  channel: SequenceStepChannel;
  template_id: string | null;
  action_config: Record<string, unknown>;
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
  created_at: string;
}

export interface CreateSequenceInput {
  name: string;
  description?: string;
  trigger_type?: SequenceTriggerType;
  trigger_config?: Record<string, unknown>;
  exit_conditions?: Record<string, unknown>[];
  is_active?: boolean;
  steps?: CreateSequenceStepInput[];
}

export interface CreateSequenceStepInput {
  step_number: number;
  delay_days: number;
  channel: SequenceStepChannel;
  template_id?: string;
  action_config?: Record<string, unknown>;
  is_active?: boolean;
}

export interface UpdateSequenceInput {
  name?: string;
  description?: string;
  trigger_type?: SequenceTriggerType;
  trigger_config?: Record<string, unknown>;
  exit_conditions?: Record<string, unknown>[];
  is_active?: boolean;
}

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

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista las secuencias de una organización (con steps).
 */
export async function getSequences(
  orgId: number,
  supabase: SupabaseClient,
): Promise<Sequence[]> {
  const { data: sequences, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error || !sequences) {
    console.warn('[sequenceService] Error en getSequences:', error?.message);
    return [];
  }

  if (sequences.length === 0) return [];

  const seqIds = (sequences as Sequence[]).map((s) => s.id);

  const { data: steps, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('*')
    .in('sequence_id', seqIds)
    .order('step_number', { ascending: true });

  if (stepsError) {
    console.warn('[sequenceService] Error cargando steps:', stepsError.message);
  }

  const stepsMap = new Map<string, SequenceStep[]>();
  for (const s of (steps || []) as SequenceStep[]) {
    const list = stepsMap.get(s.sequence_id) || [];
    list.push(s);
    stepsMap.set(s.sequence_id, list);
  }

  return (sequences as Sequence[]).map((seq) => ({
    ...seq,
    steps: stepsMap.get(seq.id) || [],
  }));
}

/**
 * Crea una secuencia con sus steps.
 */
export async function createSequence(
  orgId: number,
  data: CreateSequenceInput,
  supabase: SupabaseClient,
): Promise<Sequence> {
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
    })
    .select()
    .single();

  if (error) throw error;

  const createdSequence = sequence as Sequence;

  // Insertar steps si vienen en la creación
  if (data.steps && data.steps.length > 0) {
    const stepRows = data.steps.map((s) => ({
      organization_id: orgId,
      sequence_id: createdSequence.id,
      step_number: s.step_number,
      delay_days: s.delay_days,
      channel: s.channel,
      template_id: s.template_id || null,
      action_config: s.action_config || {},
      is_active: s.is_active ?? true,
    }));

    const { error: stepsError } = await supabase
      .from('sequence_steps')
      .insert(stepRows);

    if (stepsError) {
      console.warn('[sequenceService] Error insertando steps:', stepsError.message);
    }
  }

  // Recargar con steps
  const sequences = await getSequences(orgId, supabase);
  return sequences.find((s) => s.id === createdSequence.id) || createdSequence;
}

/**
 * Actualiza una secuencia existente.
 */
export async function updateSequence(
  id: string,
  orgId: number,
  data: UpdateSequenceInput,
  supabase: SupabaseClient,
): Promise<Sequence | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
  if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
  if (data.exit_conditions !== undefined) updateData.exit_conditions = data.exit_conditions;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

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

/**
 * Elimina una secuencia (los steps se borran por cascade si hay FK,
 * sino se borran manualmente).
 */
export async function deleteSequence(
  id: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<void> {
  // Borrar steps manualmente por si no hay cascade
  await supabase
    .from('sequence_steps')
    .delete()
    .eq('sequence_id', id)
    .eq('organization_id', orgId);

  const { error } = await supabase
    .from('sequences')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Inscribe una oportunidad en una secuencia.
 *
 * 1. Crea enrollment (status=active)
 * 2. Crea step_runs para cada step activo con scheduled_at calculado
 *
 * @returns el enrollment creado
 */
export async function enrollInSequence(
  orgId: number,
  sequenceId: string,
  opportunityId: string,
  supabase: SupabaseClient,
): Promise<SequenceEnrollment> {
  // Verificar que la secuencia existe y está activa
  const { data: sequence, error: seqError } = await supabase
    .from('sequences')
    .select('*')
    .eq('id', sequenceId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (seqError || !sequence) {
    throw new Error('Secuencia no encontrada');
  }

  // Obtener customer_id de la oportunidad
  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('customer_id')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();

  const customerId = (opportunity as { customer_id: string | null })?.customer_id || null;

  // 1. Crear enrollment
  const { data: enrollment, error: enrollError } = await supabase
    .from('sequence_enrollments')
    .insert({
      organization_id: orgId,
      sequence_id: sequenceId,
      opportunity_id: opportunityId,
      customer_id: customerId,
      status: 'active',
    })
    .select()
    .single();

  if (enrollError || !enrollment) {
    throw new Error(`Error creando enrollment: ${enrollError?.message || 'unknown'}`);
  }

  const createdEnrollment = enrollment as SequenceEnrollment;

  // 2. Obtener steps activos de la secuencia
  const { data: steps, error: stepsError } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('step_number', { ascending: true });

  if (stepsError || !steps) {
    console.warn('[sequenceService] Error cargando steps para enrollment:', stepsError?.message);
    return createdEnrollment;
  }

  // 3. Crear step_runs con scheduled_at calculado
  const enrolledAt = new Date(createdEnrollment.enrolled_at);
  const stepRuns = (steps as SequenceStep[]).map((step) => {
    const scheduledAt = new Date(enrolledAt);
    scheduledAt.setDate(scheduledAt.getDate() + step.delay_days);

    return {
      organization_id: orgId,
      enrollment_id: createdEnrollment.id,
      step_id: step.id,
      status: 'pending' as StepRunStatus,
      scheduled_at: scheduledAt.toISOString(),
    };
  });

  if (stepRuns.length > 0) {
    const { error: runsError } = await supabase
      .from('sequence_step_runs')
      .insert(stepRuns);

    if (runsError) {
      console.warn('[sequenceService] Error insertando step_runs:', runsError.message);
    }
  }

  return createdEnrollment;
}

/**
 * Lista inscripciones con filtros opcionales.
 */
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

  if (filters?.sequence_id) {
    query = query.eq('sequence_id', filters.sequence_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.opportunity_id) {
    query = query.eq('opportunity_id', filters.opportunity_id);
  }
  if (filters?.customer_id) {
    query = query.eq('customer_id', filters.customer_id);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[sequenceService] Error en getEnrollments:', error.message);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as SequenceEnrollment[], count: count || 0 };
}

/**
 * Lista step runs con filtros (para el cron).
 */
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

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.enrollment_id) {
    query = query.eq('enrollment_id', filters.enrollment_id);
  }
  if (filters?.scheduled_before) {
    query = query.lte('scheduled_at', filters.scheduled_before);
  }

  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[sequenceService] Error en getStepRuns:', error.message);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as SequenceStepRun[], count: count || 0 };
}

/**
 * Ejecuta un step run individual.
 *
 * 1. Marca como running
 * 2. Obtiene el step + enrollment + oportunidad + customer
 * 3. Ejecuta la acción según channel (email/whatsapp/sms/task)
 * 4. Verifica condiciones de salida
 * 5. Marca como completed/failed
 */
export async function processStepRun(
  runId: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<SequenceStepRun> {
  // 1. Obtener el step_run
  const { data: run, error: runError } = await supabase
    .from('sequence_step_runs')
    .select('*')
    .eq('id', runId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (runError || !run) {
    throw new Error('Step run no encontrado');
  }

  const stepRun = run as SequenceStepRun;

  if (stepRun.status !== 'pending') {
    return stepRun; // Ya procesado
  }

  // 2. Marcar como running
  await supabase
    .from('sequence_step_runs')
    .update({
      status: 'running',
      executed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  // 3. Obtener el step
  const { data: stepData } = await supabase
    .from('sequence_steps')
    .select('*')
    .eq('id', stepRun.step_id)
    .maybeSingle();

  const step = stepData as SequenceStep | null;

  if (!step || !step.is_active) {
    // Step inactivo → skip
    const { data: skipped } = await supabase
      .from('sequence_step_runs')
      .update({
        status: 'skipped',
        result: { reason: 'step_inactive' },
      })
      .eq('id', runId)
      .select()
      .single();

    return skipped as SequenceStepRun;
  }

  // 4. Obtener enrollment
  const { data: enrollData } = await supabase
    .from('sequence_enrollments')
    .select('*')
    .eq('id', stepRun.enrollment_id)
    .maybeSingle();

  const enrollment = enrollData as SequenceEnrollment | null;

  if (!enrollment || enrollment.status !== 'active') {
    // Enrollment no activo → skip
    const { data: skipped } = await supabase
      .from('sequence_step_runs')
      .update({
        status: 'skipped',
        result: { reason: `enrollment_${enrollment?.status || 'not_found'}` },
      })
      .eq('id', runId)
      .select()
      .single();

    return skipped as SequenceStepRun;
  }

  // 5. Obtener customer
  let customer: { id: string; full_name: string; email: string | null; phone: string | null } | null = null;
  if (enrollment.customer_id) {
    const { data: custData } = await supabase
      .from('customers')
      .select('id, full_name, email, phone')
      .eq('id', enrollment.customer_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    customer = custData as { id: string; full_name: string; email: string | null; phone: string | null } | null;
  }

  try {
    // 6. Ejecutar según channel
    let result: Record<string, unknown> = {};

    switch (step.channel) {
      case 'email': {
        if (!customer?.email) {
          throw new Error('Customer no tiene email');
        }

        const actionConfig = step.action_config || {};
        const subject = (actionConfig.subject as string) || 'Seguimiento';
        const html = (actionConfig.html as string) || '';
        const templateVariables = (actionConfig.template_variables as Record<string, string | number>) || {};

        // Variables por defecto
        const variables = {
          customer_name: customer.full_name,
          ...templateVariables,
        };

        const emailMessage = await sendEmail(
          orgId,
          {
            to: customer.email,
            to_customer_id: customer.id,
            subject,
            html,
            template_id: step.template_id || undefined,
            template_variables: variables,
            related_type: 'opportunity',
            related_id: enrollment.opportunity_id || undefined,
            sequence_step_run_id: runId,
          },
          supabase,
        );

        result = { email_message_id: emailMessage.id, channel: 'email' };
        break;
      }

      case 'whatsapp':
      case 'sms': {
        // Delegar a CampanasService/twilioEmailService en el futuro
        // Por ahora, registrar como actividad
        result = { channel: step.channel, status: 'pending_implementation' };
        console.log(`[sequenceService] Canal ${step.channel} pendiente de implementación para run ${runId}`);
        break;
      }

      case 'task': {
        const actionConfig = step.action_config || {};
        const title = (actionConfig.title as string) || `Tarea de secuencia: ${customer?.full_name || ''}`;
        const description = (actionConfig.description as string) || '';

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);

        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            organization_id: orgId,
            related_id: enrollment.opportunity_id,
            related_type: 'opportunity',
            title,
            description,
            status: 'pending',
            due_date: dueDate.toISOString(),
          })
          .select()
          .single();

        if (taskError) throw new Error(`Error creando tarea: ${taskError.message}`);

        result = { task_id: (task as { id: string }).id, channel: 'task' };
        break;
      }

      case 'wait':
        // Wait step — no hace nada, solo registra
        result = { channel: 'wait', waited_days: step.delay_days };
        break;

      case 'condition': {
        // Condition step — evaluar y decidir
        result = { channel: 'condition', evaluated: true };
        break;
      }

      default:
        result = { channel: step.channel, status: 'unknown_channel' };
    }

    // 7. Marcar como completed
    const { data: completed, error: completeError } = await supabase
      .from('sequence_step_runs')
      .update({
        status: 'completed',
        result,
      })
      .eq('id', runId)
      .select()
      .single();

    if (completeError) throw completeError;

    // 8. Verificar condiciones de salida
    await checkExitConditions(stepRun.enrollment_id, supabase);

    return completed as SequenceStepRun;
  } catch (execErr) {
    const errMsg = execErr instanceof Error ? execErr.message : String(execErr);

    const { data: failed } = await supabase
      .from('sequence_step_runs')
      .update({
        status: 'failed',
        error_message: errMsg,
      })
      .eq('id', runId)
      .select()
      .single();

    return failed as SequenceStepRun;
  }
}

/**
 * Verifica si un enrollment debe salir de la secuencia.
 *
 * Condiciones de salida típicas:
 * - opportunity.status = 'won' o 'lost'
 * - Todos los step_runs completados
 * - Condición personalizada en exit_conditions
 */
export async function checkExitConditions(
  enrollmentId: string,
  supabase: SupabaseClient,
): Promise<{ shouldExit: boolean; reason: string | null }> {
  const { data: enrollment } = await supabase
    .from('sequence_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .maybeSingle();

  if (!enrollment) {
    return { shouldExit: false, reason: null };
  }

  const enroll = enrollment as SequenceEnrollment;

  if (enroll.status !== 'active') {
    return { shouldExit: false, reason: null };
  }

  // 1. Verificar si la oportunidad cambió de estado
  if (enroll.opportunity_id) {
    const { data: opportunity } = await supabase
      .from('opportunities')
      .select('status')
      .eq('id', enroll.opportunity_id)
      .maybeSingle();

    const oppStatus = (opportunity as { status: string } | null)?.status;

    if (oppStatus === 'won' || oppStatus === 'lost' || oppStatus === 'closed') {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'exited',
          exited_at: new Date().toISOString(),
          exit_reason: `opportunity_${oppStatus}`,
        })
        .eq('id', enrollmentId);

      return { shouldExit: true, reason: `opportunity_${oppStatus}` };
    }
  }

  // 2. Verificar si todos los step_runs están completados
  const { data: pendingRuns } = await supabase
    .from('sequence_step_runs')
    .select('id')
    .eq('enrollment_id', enrollmentId)
    .in('status', ['pending', 'running'])
    .limit(1);

  if (!pendingRuns || pendingRuns.length === 0) {
    // No hay runs pendientes → secuencia completada
    await supabase
      .from('sequence_enrollments')
      .update({
        status: 'completed',
        exited_at: new Date().toISOString(),
        exit_reason: 'all_steps_completed',
      })
      .eq('id', enrollmentId);

    return { shouldExit: true, reason: 'all_steps_completed' };
  }

  return { shouldExit: false, reason: null };
}

/**
 * Procesa todos los step_runs pendientes cuya scheduled_at ya pasó.
 * Diseñado para ser llamado por el cron.
 */
export async function processPendingStepRuns(
  orgId: number,
  supabase: SupabaseClient,
  batchSize = 50,
): Promise<{ processed: number; completed: number; failed: number; skipped: number }> {
  const now = new Date().toISOString();

  const { data: pendingRuns } = await supabase
    .from('sequence_step_runs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(batchSize);

  if (!pendingRuns || pendingRuns.length === 0) {
    return { processed: 0, completed: 0, failed: 0, skipped: 0 };
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const run of pendingRuns as { id: string }[]) {
    try {
      const result = await processStepRun(run.id, orgId, supabase);
      if (result.status === 'completed') completed++;
      else if (result.status === 'failed') failed++;
      else if (result.status === 'skipped') skipped++;
    } catch (err) {
      console.error(`[sequenceService] Error procesando run ${run.id}:`, err);
      failed++;
    }
  }

  return {
    processed: pendingRuns.length,
    completed,
    failed,
    skipped,
  };
}
