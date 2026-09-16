/**
 * Servicio CRM de onboarding (FASE-11). Solo funciones server-side con cliente
 * inyectado (sesión con RLS en las rutas; service role donde esté justificado).
 * r2: la clase de navegador (sin consumidores, cableaba 'COP' y `tasks`) se
 * eliminó; este módulo ya no importa el cliente de navegador.
 *
 * Tablas: pipelines, stages, opportunities, onboarding_templates,
 * onboarding_instances, onboarding_steps
 */

// Etapas del pipeline de onboarding
export const ONBOARDING_STAGES = [
  { name: 'Kickoff', position: 1, probability: 10, color: '#3b82f6', sla_days: 3 },
  { name: 'Configuracion', position: 2, probability: 20, color: '#6366f1', sla_days: 7 },
  { name: 'Importacion', position: 3, probability: 35, color: '#8b5cf6', sla_days: 10 },
  { name: 'Capacitacion', position: 4, probability: 50, color: '#a855f7', sla_days: 14 },
  { name: 'Uso asistido', position: 5, probability: 70, color: '#d946ef', sla_days: 21 },
  { name: 'Revision 14d', position: 6, probability: 85, color: '#ec4899', sla_days: 30 },
  { name: 'Business Review 30d', position: 7, probability: 100, color: '#22c55e', sla_days: 45 },
] as const;

// ─── Funciones server-side (F11) ─────────────────────────────────────────────
// Esquema real verificado por MCP (2026-09-15): `onboarding_instances` y
// `onboarding_steps` NO tienen `updated_at`; `onboarding_templates.steps` es
// `[{day,key,owner,title}]`; `onboarding_instances.status` CHECK
// active|completed|at_risk|churned. La lógica pura vive en `onboardingProgress.ts`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgBaseCurrency } from './salesTargetService';
import {
  buildStepRows,
  canCompleteOnboarding,
  findWonStage,
  parseTemplateSteps,
  pickDefaultTemplate,
} from './onboardingProgress';

export type OnboardingInstanceStatus = 'active' | 'completed' | 'at_risk' | 'churned';

/** `23505` de los índices únicos parciales de la migración de r2: otra llamada ganó la carrera. */
export const isUniqueViolation = (error: { code?: string } | null | undefined): boolean => error?.code === '23505';

export interface OnboardingTemplateRow {
  id: string;
  organization_id: number;
  name: string;
  steps: unknown;
  default_duration_days: number;
  is_active: boolean;
  created_at: string;
}

export interface OnboardingInstanceRow {
  id: string;
  organization_id: number;
  template_id: string | null;
  opportunity_id: string;
  customer_id: string;
  parent_opportunity_id: string | null;
  status: OnboardingInstanceStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface OnboardingStepRow {
  id: string;
  organization_id: number;
  instance_id: string;
  step_number: number;
  name: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  is_completed: boolean;
  notes: string | null;
  created_at: string;
}

export interface OnboardingInstanceWithSteps extends OnboardingInstanceRow {
  steps: OnboardingStepRow[];
  template?: OnboardingTemplateRow | null;
  /** `true` si la instancia ya existía para la oportunidad (idempotencia). */
  already_existed?: boolean;
}

export interface OnboardingInstanceFilters {
  status?: string;
  opportunity_id?: string;
  customer_id?: string;
  template_id?: string;
  limit?: number;
  offset?: number;
}

export interface OnboardingTemplateInput {
  name: string;
  steps: unknown;
  default_duration_days?: number;
  is_active?: boolean;
}

export class OnboardingIncompleteError extends Error {
  constructor(message = 'Aún hay pasos pendientes: completa todos los pasos antes de cerrar el onboarding') {
    super(message);
    this.name = 'OnboardingIncompleteError';
  }
}

interface ServerOpts {
  now?: Date;
}

const STEP_COLUMNS = 'id, organization_id, instance_id, step_number, name, description, due_date, completed_at, completed_by, is_completed, notes, created_at';
const INSTANCE_COLUMNS = 'id, organization_id, template_id, opportunity_id, customer_id, parent_opportunity_id, status, started_at, completed_at, created_at';

async function loadSteps(instanceId: string, orgId: number, sb: SupabaseClient): Promise<OnboardingStepRow[]> {
  const { data, error } = await sb
    .from('onboarding_steps')
    .select(STEP_COLUMNS)
    .eq('instance_id', instanceId)
    .eq('organization_id', orgId)
    .order('step_number', { ascending: true });
  if (error) throw new Error(`pasos de onboarding: ${error.message}`);
  return (data ?? []) as OnboardingStepRow[];
}

async function loadTemplate(templateId: string, orgId: number, sb: SupabaseClient): Promise<OnboardingTemplateRow | null> {
  const { data, error } = await sb
    .from('onboarding_templates')
    .select('*')
    .eq('id', templateId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`plantilla de onboarding: ${error.message}`);
  return (data as OnboardingTemplateRow | null) ?? null;
}

/** Instancia existente de la oportunidad (con pasos y plantilla) marcada `already_existed`. */
async function loadExistingInstance(orgId: number, opportunityId: string, sb: SupabaseClient): Promise<OnboardingInstanceWithSteps | null> {
  const { data: existing, error: exErr } = await sb
    .from('onboarding_instances')
    .select(INSTANCE_COLUMNS)
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(`instancia de onboarding: ${exErr.message}`);
  if (!existing) return null;
  const row = existing as OnboardingInstanceRow;
  const steps = await loadSteps(row.id, orgId, sb);
  const template = row.template_id ? await loadTemplate(row.template_id, orgId, sb) : null;
  return { ...row, steps, template, already_existed: true };
}

/**
 * Crea la instancia de onboarding de una oportunidad (+ pasos desde la
 * plantilla). Idempotente por `(organization_id, opportunity_id)`: si ya
 * existe devuelve la existente con `already_existed=true`.
 * `templateId` null → plantilla activa por defecto de la organización.
 * Devuelve null si la plantilla o la oportunidad no pertenecen a la org.
 */
export async function createOnboardingInstance(
  orgId: number,
  opportunityId: string,
  templateId: string | null,
  sb: SupabaseClient,
  opts: ServerOpts = {},
): Promise<OnboardingInstanceWithSteps | null> {
  const now = opts.now ?? new Date();

  const existing = await loadExistingInstance(orgId, opportunityId, sb);
  if (existing) return existing;

  let tpl: OnboardingTemplateRow | null;
  if (templateId) {
    tpl = await loadTemplate(templateId, orgId, sb);
    if (!tpl) {
      console.warn('[onboardingService.createOnboardingInstance] plantilla no encontrada en la organización:', templateId);
      return null;
    }
  } else {
    const templates = await getOnboardingTemplatesServer(orgId, sb);
    tpl = pickDefaultTemplate(templates);
    if (!tpl) throw new Error('La organización no tiene ninguna plantilla de onboarding activa');
  }

  const { data: opp, error: oppError } = await sb
    .from('opportunities')
    .select('id, customer_id, parent_opportunity_id')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (oppError) throw new Error(`oportunidad: ${oppError.message}`);
  const oppData = opp as { id: string; customer_id: string | null; parent_opportunity_id: string | null } | null;
  if (!oppData || !oppData.customer_id) {
    console.warn('[onboardingService.createOnboardingInstance] oportunidad no encontrada o sin cliente:', opportunityId);
    return null;
  }

  const { data: instance, error: instError } = await sb
    .from('onboarding_instances')
    .insert({
      organization_id: orgId,
      template_id: tpl.id,
      opportunity_id: opportunityId,
      customer_id: oppData.customer_id,
      parent_opportunity_id: oppData.parent_opportunity_id,
      status: 'active',
      started_at: now.toISOString(),
    })
    .select(INSTANCE_COLUMNS)
    .single();
  if (isUniqueViolation(instError)) {
    // uq_onboarding_instances_org_opportunity: la creó una llamada concurrente → devolver la existente.
    const raced = await loadExistingInstance(orgId, opportunityId, sb);
    if (!raced) throw new Error('crear instancia de onboarding: 23505 pero la instancia no se encuentra');
    return raced;
  }
  if (instError || !instance) throw new Error(`crear instancia de onboarding: ${instError?.message ?? 'sin fila'}`);
  const instanceRow = instance as OnboardingInstanceRow;

  const rows = buildStepRows({
    templateSteps: parseTemplateSteps(tpl.steps),
    startedAt: now,
    defaultDurationDays: tpl.default_duration_days || 30,
    orgId,
    instanceId: instanceRow.id,
  });
  let createdSteps: OnboardingStepRow[] = [];
  if (rows.length > 0) {
    const { data: steps, error: stepsError } = await sb
      .from('onboarding_steps')
      .insert(rows)
      .select(STEP_COLUMNS)
      .order('step_number', { ascending: true });
    if (stepsError) throw new Error(`crear pasos de onboarding: ${stepsError.message}`);
    createdSteps = (steps ?? []) as OnboardingStepRow[];
  }

  return { ...instanceRow, steps: createdSteps, template: tpl, already_existed: false };
}

export async function getOnboardingInstances(
  orgId: number,
  sb: SupabaseClient,
  filters?: OnboardingInstanceFilters,
): Promise<{ data: OnboardingInstanceRow[]; count: number }> {
  let query = sb
    .from('onboarding_instances')
    .select(INSTANCE_COLUMNS, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.opportunity_id) query = query.eq('opportunity_id', filters.opportunity_id);
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);
  if (filters?.template_id) query = query.eq('template_id', filters.template_id);
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const offset = Math.max(filters?.offset ?? 0, 0);
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) {
    console.error('[onboardingService.getOnboardingInstances] error:', error.message);
    return { data: [], count: 0 };
  }
  return { data: (data ?? []) as OnboardingInstanceRow[], count: count ?? 0 };
}

export async function getOnboardingInstance(
  id: string,
  orgId: number,
  sb: SupabaseClient,
): Promise<OnboardingInstanceWithSteps | null> {
  const { data: instance, error } = await sb
    .from('onboarding_instances')
    .select(INSTANCE_COLUMNS)
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`instancia de onboarding: ${error.message}`);
  if (!instance) return null;
  const row = instance as OnboardingInstanceRow;
  const steps = await loadSteps(row.id, orgId, sb);
  const template = row.template_id ? await loadTemplate(row.template_id, orgId, sb) : null;
  return { ...row, steps, template };
}

/** Instancia (con pasos) de una oportunidad, o null si no tiene. */
export async function getOnboardingInstanceByOpportunity(
  opportunityId: string,
  orgId: number,
  sb: SupabaseClient,
): Promise<OnboardingInstanceWithSteps | null> {
  const { data, error } = await sb
    .from('onboarding_instances')
    .select(INSTANCE_COLUMNS)
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`instancia de onboarding: ${error.message}`);
  if (!data) return null;
  return getOnboardingInstance((data as OnboardingInstanceRow).id, orgId, sb);
}

/**
 * Marca/desmarca un paso. `completed_by` lo decide el llamador desde la
 * sesión (nunca del body). Sin `updated_at`: la tabla no la tiene.
 */
export async function updateOnboardingStep(
  stepId: string,
  orgId: number,
  data: { is_completed?: boolean; notes?: string; completed_by?: string },
  sb: SupabaseClient,
  opts: ServerOpts & { instanceId?: string } = {},
): Promise<OnboardingStepRow | null> {
  const now = opts.now ?? new Date();
  const updateData: Record<string, unknown> = {};
  if (data.is_completed !== undefined) {
    updateData.is_completed = data.is_completed;
    updateData.completed_at = data.is_completed ? now.toISOString() : null;
    updateData.completed_by = data.is_completed ? data.completed_by ?? null : null;
  }
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (Object.keys(updateData).length === 0) return null;

  let query = sb.from('onboarding_steps').update(updateData).eq('id', stepId).eq('organization_id', orgId);
  if (opts.instanceId) query = query.eq('instance_id', opts.instanceId);
  const { data: result, error } = await query.select(STEP_COLUMNS).maybeSingle();
  if (error) {
    console.error('[onboardingService.updateOnboardingStep] error:', error.message);
    return null;
  }
  return (result as OnboardingStepRow | null) ?? null;
}

/**
 * Cierra el onboarding: exige TODOS los pasos hechos
 * (`OnboardingIncompleteError`), escribe `status='completed'` +
 * `completed_at` y mueve la oportunidad a la etapa `is_won` de su pipeline
 * (por bandera, nunca por nombre). Lanza si la instancia no es de la org.
 */
export async function completeOnboardingInstance(
  id: string,
  orgId: number,
  sb: SupabaseClient,
  opts: ServerOpts = {},
): Promise<OnboardingInstanceRow> {
  const now = opts.now ?? new Date();
  const inst = await getOnboardingInstance(id, orgId, sb);
  if (!inst) throw new Error(`Instancia de onboarding ${id} no encontrada en la organización`);
  if (!canCompleteOnboarding(inst.steps)) throw new OnboardingIncompleteError();

  const { data: updated, error } = await sb
    .from('onboarding_instances')
    .update({ status: 'completed', completed_at: now.toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(INSTANCE_COLUMNS)
    .maybeSingle();
  if (error || !updated) throw new Error(`completar onboarding: ${error?.message ?? 'sin fila'}`);

  const { data: opp } = await sb
    .from('opportunities')
    .select('id, pipeline_id, stage_id')
    .eq('id', inst.opportunity_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  const oppRow = opp as { id: string; pipeline_id: string; stage_id: string } | null;
  if (oppRow) {
    const { data: stages } = await sb
      .from('stages')
      .select('id, is_won, position')
      .eq('pipeline_id', oppRow.pipeline_id);
    const won = findWonStage((stages ?? []) as Array<{ id: string; is_won: boolean | null; position: number }>);
    if (won && won.id !== oppRow.stage_id) {
      const { error: stErr } = await sb
        .from('opportunities')
        .update({ stage_id: won.id })
        .eq('id', oppRow.id)
        .eq('organization_id', orgId);
      if (stErr) {
        // r2: no dejar la instancia `completed` en silencio con la oportunidad sin mover.
        const { error: revErr } = await sb
          .from('onboarding_instances')
          .update({ status: 'active', completed_at: null })
          .eq('id', id)
          .eq('organization_id', orgId);
        const suffix = revErr ? ` (y no se pudo revertir la instancia: ${revErr.message})` : '';
        throw new Error(`completar onboarding: no se pudo mover la oportunidad a la etapa ganada: ${stErr.message}${suffix}`);
      }
    }
  }
  return updated as OnboardingInstanceRow;
}

export async function updateOnboardingInstanceStatus(
  id: string,
  orgId: number,
  status: OnboardingInstanceStatus,
  sb: SupabaseClient,
  opts: ServerOpts = {},
): Promise<OnboardingInstanceRow | null> {
  if (status === 'completed') return completeOnboardingInstance(id, orgId, sb, opts);
  const { data: result, error } = await sb
    .from('onboarding_instances')
    .update({ status })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(INSTANCE_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error('[onboardingService.updateOnboardingInstanceStatus] error:', error.message);
    return null;
  }
  return (result as OnboardingInstanceRow | null) ?? null;
}

export async function getOnboardingTemplatesServer(orgId: number, sb: SupabaseClient): Promise<OnboardingTemplateRow[]> {
  const { data, error } = await sb
    .from('onboarding_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });
  if (error) {
    console.warn('[onboardingService.getOnboardingTemplatesServer] error:', error.message);
    return [];
  }
  return (data ?? []) as OnboardingTemplateRow[];
}

export async function createOnboardingTemplateServer(
  orgId: number,
  data: OnboardingTemplateInput,
  sb: SupabaseClient,
): Promise<OnboardingTemplateRow | null> {
  const { data: result, error } = await sb
    .from('onboarding_templates')
    .insert({
      organization_id: orgId,
      name: data.name,
      steps: data.steps,
      default_duration_days: data.default_duration_days ?? 30,
      is_active: data.is_active ?? true,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[onboardingService.createOnboardingTemplateServer] error:', error.message);
    throw error;
  }
  return result as OnboardingTemplateRow;
}

// ─── Al ganar (punto de entrada para F10) ────────────────────────────────────

export interface StartOnboardingResult {
  onboarding_opportunity_id: string;
  instance_id: string;
  steps_created: number;
  already_existed: boolean;
}

/** Pipeline `onboarding` de la organización; lo crea con `ONBOARDING_STAGES` si no existe. */
export async function getOrCreateOnboardingPipelineServer(orgId: number, sb: SupabaseClient): Promise<string> {
  const { data: existing, error: readErr } = await sb
    .from('pipelines')
    .select('id')
    .eq('organization_id', orgId)
    .eq('pipeline_type', 'onboarding')
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(`pipeline de onboarding: ${readErr.message}`);
  if (existing) return (existing as { id: string }).id;

  const { data: pipeline, error } = await sb
    .from('pipelines')
    .insert({ organization_id: orgId, name: 'Onboarding', pipeline_type: 'onboarding', is_default: false })
    .select('id')
    .single();
  if (error || !pipeline) throw new Error(`crear pipeline de onboarding: ${error?.message ?? 'sin fila'}`);
  const pipelineId = (pipeline as { id: string }).id;
  const { error: stErr } = await sb.from('stages').insert(
    ONBOARDING_STAGES.map((s) => ({ pipeline_id: pipelineId, ...s, is_won: s.position === ONBOARDING_STAGES.length, is_lost: false })),
  );
  if (stErr) throw new Error(`crear etapas de onboarding: ${stErr.message}`);
  return pipelineId;
}

/**
 * Punto de entrada para F10 al cerrar como ganada:
 * `startOnboardingForWonOpportunity(orgId, opportunityId, supabase)`.
 *
 * 1) verifica que la oportunidad es de la org y está `won`;
 * 2) obtiene/crea el pipeline `onboarding`;
 * 3) crea la oportunidad hija (`parent_opportunity_id`, `metadata.type='onboarding'`)
 *    en la primera etapa — idempotente por (org, parent, pipeline);
 * 4) crea la instancia + pasos desde la plantilla activa por defecto —
 *    idempotente por oportunidad hija.
 * Lanza `Error` con mensaje claro; nunca escribe si falla la validación.
 */
export async function startOnboardingForWonOpportunity(
  orgId: number,
  opportunityId: string,
  sb: SupabaseClient,
  opts: ServerOpts = {},
): Promise<StartOnboardingResult> {
  const { data: parent, error: pErr } = await sb
    .from('opportunities')
    .select('id, status, customer_id, salesperson_id, currency')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (pErr) throw new Error(`startOnboarding: ${pErr.message}`);
  const parentRow = parent as { id: string; status: string; customer_id: string | null; salesperson_id: string | null; currency: string | null } | null;
  if (!parentRow) throw new Error(`startOnboarding: oportunidad ${opportunityId} no encontrada en la organización`);
  if (parentRow.status !== 'won') throw new Error('startOnboarding: la oportunidad no está ganada');
  if (!parentRow.customer_id) throw new Error('startOnboarding: la oportunidad no tiene cliente');

  const pipelineId = await getOrCreateOnboardingPipelineServer(orgId, sb);

  const { data: existingChild, error: cErr } = await sb
    .from('opportunities')
    .select('id')
    .eq('organization_id', orgId)
    .eq('parent_opportunity_id', parentRow.id)
    .eq('pipeline_id', pipelineId)
    .limit(1)
    .maybeSingle();
  if (cErr) throw new Error(`startOnboarding: ${cErr.message}`);

  let childId: string;
  let childExisted = false;
  if (existingChild) {
    childId = (existingChild as { id: string }).id;
    childExisted = true;
  } else {
    const { data: firstStage, error: sErr } = await sb
      .from('stages')
      .select('id, position')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(`startOnboarding: ${sErr.message}`);
    if (!firstStage) throw new Error('startOnboarding: el pipeline de onboarding no tiene etapas');

    const { data: customer } = await sb
      .from('customers')
      .select('full_name')
      .eq('id', parentRow.customer_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    const customerName = (customer as { full_name: string | null } | null)?.full_name || 'Cliente';
    // r2: moneda del padre; si no la tiene, la base de la organización; nunca 'COP' cableado.
    const currency = parentRow.currency?.trim().toUpperCase() || (await getOrgBaseCurrency(orgId, sb));
    if (!currency) console.warn('[onboardingService.startOnboarding] sin moneda en el padre ni base en la organización; la hija toma el default de la tabla', { orgId });

    const { data: child, error: iErr } = await sb
      .from('opportunities')
      .insert({
        organization_id: orgId,
        pipeline_id: pipelineId,
        stage_id: (firstStage as { id: string }).id,
        customer_id: parentRow.customer_id,
        name: `Onboarding — ${customerName}`,
        amount: 0,
        ...(currency ? { currency } : {}),
        status: 'open',
        parent_opportunity_id: parentRow.id,
        salesperson_id: parentRow.salesperson_id ?? null,
        metadata: { type: 'onboarding', parent_opportunity_id: parentRow.id },
      })
      .select('id')
      .single();
    if (isUniqueViolation(iErr)) {
      // uq_opportunities_one_onboarding_child_per_parent: otra llamada creó la hija → reutilizarla.
      const { data: raced, error: rErr } = await sb
        .from('opportunities')
        .select('id')
        .eq('organization_id', orgId)
        .eq('parent_opportunity_id', parentRow.id)
        .eq('pipeline_id', pipelineId)
        .limit(1)
        .maybeSingle();
      if (rErr || !raced) throw new Error(`startOnboarding: 23505 pero la hija no se encuentra: ${rErr?.message ?? 'sin fila'}`);
      childId = (raced as { id: string }).id;
      childExisted = true;
    } else {
      if (iErr || !child) throw new Error(`startOnboarding: crear oportunidad hija: ${iErr?.message ?? 'sin fila'}`);
      childId = (child as { id: string }).id;
    }
  }

  const inst = await createOnboardingInstance(orgId, childId, null, sb, opts);
  if (!inst) throw new Error('startOnboarding: no se pudo crear la instancia de onboarding');
  return {
    onboarding_opportunity_id: childId,
    instance_id: inst.id,
    steps_created: inst.already_existed ? 0 : inst.steps.length,
    already_existed: childExisted && inst.already_existed === true,
  };
}
