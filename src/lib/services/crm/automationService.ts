/**
 * Servicio CRM — Reglas de automatización (Fase 8).
 *
 * Gestiona automation_rules: reglas que se disparan por eventos
 * (stage_change, field_change, schedule, event, manual) y ejecutan
 * acciones (send_email, create_task, create_activity, update_field,
 * enroll_sequence).
 *
 * Tablas:
 *   automation_rules, automation_runs, activities, tasks, opportunities
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/crm/emailService';
import { enrollInSequence } from '@/lib/services/crm/sequenceService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AutomationTriggerType =
  | 'stage_change'
  | 'field_change'
  | 'schedule'
  | 'event'
  | 'manual';

export type AutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AutomationRule {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}

export interface AutomationAction {
  type: 'send_email' | 'create_task' | 'create_activity' | 'update_field' | 'enroll_sequence';
  // send_email
  to?: string;
  subject?: string;
  html?: string;
  template_id?: string;
  template_variables?: Record<string, string | number>;
  // create_task
  title?: string;
  description?: string;
  due_in_days?: number;
  // create_activity
  activity_type?: string;
  notes?: string;
  // update_field
  entity?: string;
  entity_id?: string;
  field_name?: string;
  field_value?: unknown;
  // enroll_sequence
  sequence_id?: string;
}

export interface AutomationRun {
  id: string;
  organization_id: number;
  automation_rule_id: string;
  trigger_type: string;
  trigger_payload: Record<string, unknown> | null;
  status: AutomationRunStatus;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface CreateAutomationRuleInput {
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  is_active?: boolean;
  priority?: number;
}

export interface UpdateAutomationRuleInput {
  name?: string;
  description?: string;
  trigger_type?: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  is_active?: boolean;
  priority?: number;
}

export interface AutomationRunFilters {
  rule_id?: string;
  status?: AutomationRunStatus;
  trigger_type?: string;
  limit?: number;
  offset?: number;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista las reglas de automatización de una organización.
 */
export async function getAutomationRules(
  orgId: number,
  supabase: SupabaseClient,
): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', orgId)
    .order('priority', { ascending: true });

  if (error || !data) {
    console.warn('[automationService] Error en getAutomationRules:', error?.message);
    return [];
  }

  return data as AutomationRule[];
}

/**
 * Crea una regla de automatización.
 */
export async function createAutomationRule(
  orgId: number,
  data: CreateAutomationRuleInput,
  supabase: SupabaseClient,
): Promise<AutomationRule> {
  const { data: rule, error } = await supabase
    .from('automation_rules')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.trigger_type,
      trigger_config: data.trigger_config || {},
      conditions: data.conditions || [],
      actions: data.actions || [],
      is_active: data.is_active ?? true,
      priority: data.priority ?? 100,
    })
    .select()
    .single();

  if (error) throw error;
  return rule as AutomationRule;
}

/**
 * Actualiza una regla de automatización.
 */
export async function updateAutomationRule(
  id: string,
  orgId: number,
  data: UpdateAutomationRuleInput,
  supabase: SupabaseClient,
): Promise<AutomationRule | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
  if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
  if (data.conditions !== undefined) updateData.conditions = data.conditions;
  if (data.actions !== undefined) updateData.actions = data.actions;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.priority !== undefined) updateData.priority = data.priority;

  const { data: result, error } = await supabase
    .from('automation_rules')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return result as AutomationRule | null;
}

/**
 * Elimina una regla de automatización.
 */
export async function deleteAutomationRule(
  id: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Evalúa si alguna regla aplica dado un trigger.
 * Retorna las reglas que coinciden con el trigger_type y trigger_config.
 */
export async function evaluateTrigger(
  orgId: number,
  triggerType: AutomationTriggerType,
  triggerPayload: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<AutomationRule[]> {
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', orgId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error || !rules) {
    console.warn('[automationService] Error en evaluateTrigger:', error?.message);
    return [];
  }

  const allRules = rules as AutomationRule[];
  const matchingRules: AutomationRule[] = [];

  for (const rule of allRules) {
    // Verificar trigger_config
    if (matchesTriggerConfig(rule.trigger_config, triggerType, triggerPayload)) {
      // Verificar conditions
      if (evaluateConditions(rule.conditions || [], triggerPayload)) {
        matchingRules.push(rule);
      }
    }
  }

  return matchingRules;
}

/**
 * Verifica si el trigger_config de la regla coincide con el payload.
 */
function matchesTriggerConfig(
  config: Record<string, unknown>,
  triggerType: AutomationTriggerType,
  payload: Record<string, unknown>,
): boolean {
  switch (triggerType) {
    case 'stage_change':
      // config: { stage_id, pipeline_id }
      if (config.stage_id && payload.stage_id && config.stage_id !== payload.stage_id) {
        return false;
      }
      if (config.pipeline_id && payload.pipeline_id && config.pipeline_id !== payload.pipeline_id) {
        return false;
      }
      return true;

    case 'field_change':
      // config: { field_name }
      if (config.field_name && payload.field_name && config.field_name !== payload.field_name) {
        return false;
      }
      return true;

    case 'schedule':
      // config: { cron, timezone } — la coincidencia la hace el cron externo
      return true;

    case 'event':
      // config: { event_name }
      if (config.event_name && payload.event_name && config.event_name !== payload.event_name) {
        return false;
      }
      return true;

    case 'manual':
      // Trigger manual siempre coincide
      return true;

    default:
      return false;
  }
}

/**
 * Evalúa las condiciones de una regla contra el payload.
 */
function evaluateConditions(
  conditions: AutomationCondition[],
  payload: Record<string, unknown>,
): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const cond of conditions) {
    const fieldValue = payload[cond.field];
    if (!evaluateCondition(fieldValue, cond.operator, cond.value)) {
      return false;
    }
  }

  return true;
}

/**
 * Evalúa una condición individual.
 */
function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  compareValue: unknown,
): boolean {
  const a = Number(fieldValue);
  const b = Number(compareValue);

  switch (operator) {
    case 'eq':
      return fieldValue === compareValue;
    case 'ne':
      return fieldValue !== compareValue;
    case 'gt':
      return !isNaN(a) && !isNaN(b) && a > b;
    case 'lt':
      return !isNaN(a) && !isNaN(b) && a < b;
    case 'gte':
      return !isNaN(a) && !isNaN(b) && a >= b;
    case 'lte':
      return !isNaN(a) && !isNaN(b) && a <= b;
    case 'contains':
      if (typeof fieldValue !== 'string') return false;
      return fieldValue.includes(String(compareValue));
    case 'in':
      if (Array.isArray(compareValue)) {
        return compareValue.includes(fieldValue);
      }
      return fieldValue === compareValue;
    default:
      return false;
  }
}

/**
 * Ejecuta una regla de automatización.
 *
 * 1. Crea automation_run (status=running)
 * 2. Ejecuta cada action
 * 3. Marca como completed/failed
 */
export async function executeAutomationRule(
  ruleId: string,
  orgId: number,
  triggerPayload: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<AutomationRun> {
  // 1. Obtener la regla
  const { data: rule, error: ruleError } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (ruleError || !rule) {
    throw new Error('Regla de automatización no encontrada');
  }

  const automationRule = rule as AutomationRule;

  // 2. Crear automation_run
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      organization_id: orgId,
      automation_rule_id: ruleId,
      trigger_type: automationRule.trigger_type,
      trigger_payload: triggerPayload,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Error creando automation_run: ${runError?.message || 'unknown'}`);
  }

  const automationRun = run as AutomationRun;

  try {
    // 3. Ejecutar cada action
    const results: Record<string, unknown>[] = [];

    for (const action of automationRule.actions || []) {
      try {
        const actionResult = await executeAction(action, orgId, triggerPayload, supabase);
        results.push(actionResult);
      } catch (actionErr) {
        const errMsg = actionErr instanceof Error ? actionErr.message : String(actionErr);
        results.push({ type: action.type, error: errMsg });
        console.warn(`[automationService] Error en action ${action.type}:`, errMsg);
      }
    }

    // 4. Marcar como completed
    const { data: completed, error: completeError } = await supabase
      .from('automation_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { actions_executed: results.length, results },
      })
      .eq('id', automationRun.id)
      .select()
      .single();

    if (completeError) throw completeError;

    return completed as AutomationRun;
  } catch (execErr) {
    const errMsg = execErr instanceof Error ? execErr.message : String(execErr);

    const { data: failed } = await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errMsg,
      })
      .eq('id', automationRun.id)
      .select()
      .single();

    return failed as AutomationRun;
  }
}

/**
 * Ejecuta una acción individual de automatización.
 */
async function executeAction(
  action: AutomationAction,
  orgId: number,
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case 'send_email': {
      const to = action.to || (payload.customer_email as string);
      if (!to) throw new Error('send_email: falta destinatario');

      const templateVariables = {
        customer_name: (payload.customer_name as string) || '',
        ...action.template_variables,
      };

      const message = await sendEmail(
        orgId,
        {
          to,
          subject: action.subject || 'Notificación automática',
          html: action.html || '',
          template_id: action.template_id,
          template_variables: templateVariables,
          related_type: (payload.related_type as string) || undefined,
          related_id: (payload.related_id as string) || undefined,
        },
        supabase,
      );

      return { type: 'send_email', email_message_id: message.id };
    }

    case 'create_task': {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (action.due_in_days || 1));

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          organization_id: orgId,
          related_id: (payload.opportunity_id as string) || null,
          related_type: 'opportunity',
          title: action.title || 'Tarea automática',
          description: action.description || '',
          status: 'pending',
          due_date: dueDate.toISOString(),
        })
        .select()
        .single();

      if (taskError) throw new Error(`create_task: ${taskError.message}`);

      return { type: 'create_task', task_id: (task as { id: string }).id };
    }

    case 'create_activity': {
      const { data: activity, error: actError } = await supabase
        .from('activities')
        .insert({
          organization_id: orgId,
          activity_type: action.activity_type || 'note',
          notes: action.notes || 'Actividad automática',
          related_type: (payload.related_type as string) || undefined,
          related_id: (payload.related_id as string) || undefined,
          occurred_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (actError) throw new Error(`create_activity: ${actError.message}`);

      return { type: 'create_activity', activity_id: (activity as { id: string }).id };
    }

    case 'update_field': {
      const entity = action.entity || 'opportunities';
      const entityId = action.entity_id || (payload.opportunity_id as string);
      if (!entityId || !action.field_name) {
        throw new Error('update_field: falta entity_id o field_name');
      }

      const { error: updateError } = await supabase
        .from(entity)
        .update({
          [action.field_name]: action.field_value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId)
        .eq('organization_id', orgId);

      if (updateError) throw new Error(`update_field: ${updateError.message}`);

      return { type: 'update_field', entity, entity_id: entityId, field: action.field_name };
    }

    case 'enroll_sequence': {
      if (!action.sequence_id) {
        throw new Error('enroll_sequence: falta sequence_id');
      }

      const opportunityId = (payload.opportunity_id as string);
      if (!opportunityId) {
        throw new Error('enroll_sequence: falta opportunity_id en payload');
      }

      const enrollment = await enrollInSequence(
        orgId,
        action.sequence_id,
        opportunityId,
        supabase,
      );

      return { type: 'enroll_sequence', enrollment_id: enrollment.id };
    }

    default:
      return { type: action.type, status: 'unknown_action' };
  }
}

/**
 * Lista las ejecuciones de automatización con filtros.
 */
export async function getAutomationRuns(
  orgId: number,
  supabase: SupabaseClient,
  filters?: AutomationRunFilters,
): Promise<{ data: AutomationRun[]; count: number }> {
  let query = supabase
    .from('automation_runs')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.rule_id) {
    query = query.eq('automation_rule_id', filters.rule_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.trigger_type) {
    query = query.eq('trigger_type', filters.trigger_type);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[automationService] Error en getAutomationRuns:', error.message);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as AutomationRun[], count: count || 0 };
}
