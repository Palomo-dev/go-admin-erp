/**
 * Servicio CRM — Reglas de automatización (FASE-08).
 *
 * CRUD de `automation_rules` + ejecución de una regla contra el esquema REAL:
 *   - condiciones evaluadas con la DSL (`automation/conditionsDsl.ts`),
 *   - acciones ejecutadas por `automation/actions.ts` (una acción que falla
 *     marca la ejecución como `failed`; nunca "unknown_action" en verde),
 *   - reglas desactivadas NO se ejecutan (`skipped`, motivo `rule_inactive`),
 *   - `run_once_per_opportunity` y `cooldown_hours` cortan las cascadas.
 *
 * Tablas: automation_rules, automation_runs (+ las que tocan las acciones).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executeAction,
  ActionError,
  AUTOMATION_ACTION_TYPES,
  NOT_IMPLEMENTED_ACTIONS,
  UPDATE_FIELD_ALLOWLIST,
  validateUpdateField,
  type AutomationAction,
  type EnqueueFn,
} from './automation/actions';
import {
  evaluateConditionTree,
  normalizeConditions,
  validateConditions,
  type ConditionNode,
} from './automation/conditionsDsl';
import { emptyRuleContext, loadRuleContext, type RuleContext } from './automation/ruleContext';

export { UPDATE_FIELD_ALLOWLIST, validateUpdateField, AUTOMATION_ACTION_TYPES, NOT_IMPLEMENTED_ACTIONS };
export type { AutomationAction };

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AutomationTriggerType =
  | 'stage_change'
  | 'field_change'
  | 'schedule'
  | 'event'
  | 'manual';

export type AutomationRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface AutomationRule {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  conditions: ConditionNode | ConditionNode[] | null;
  actions: AutomationAction[];
  is_active: boolean;
  priority: number;
  event: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  version: number;
  template_key: string | null;
  last_run_at: string | null;
  runs_count: number;
  created_at: string;
  updated_at: string;
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
  skip_reason?: string | null;
  opportunity_id?: string | null;
  event_id?: string | null;
  created_at: string;
}

export interface CreateAutomationRuleInput {
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  conditions?: unknown;
  actions?: AutomationAction[];
  is_active?: boolean;
  priority?: number;
  event?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  run_once_per_opportunity?: boolean;
  cooldown_hours?: number;
  template_key?: string | null;
  created_by?: string | null;
}

export type UpdateAutomationRuleInput = Partial<Omit<CreateAutomationRuleInput, 'created_by'>> & {
  updated_by?: string | null;
};

export interface AutomationRunFilters {
  rule_id?: string;
  status?: AutomationRunStatus;
  trigger_type?: string;
  limit?: number;
  offset?: number;
}

export interface ExecuteRuleOptions {
  /**
   * NOTA (tester r2 N5): ya NO existe `force`. Hasta la ronda 1,
   * `POST /trigger {"force":true}` ejecutaba de verdad —con envíos reales— una
   * regla marcada como desactivada. El interruptor `is_active` es absoluto:
   * para probar una regla apagada está `testRunAutomationRule` (`dry_run`),
   * que evalúa condiciones y devuelve el plan sin ejecutar nada.
   */
  /** Evento del outbox que originó la ejecución (idempotencia por índice único). */
  eventId?: string | null;
  /** Encolador inyectable (tests / runner). */
  enqueue?: EnqueueFn;
  /** Contexto ya cargado (evita releer en el motor de eventos). */
  context?: RuleContext;
  userId?: string | null;
}

export const AUTOMATION_TRIGGER_TYPES: AutomationTriggerType[] = [
  'stage_change', 'field_change', 'schedule', 'event', 'manual',
];

// ─── Validación de entrada ──────────────────────────────────────────────────

/** Valida la forma de una regla antes de escribirla (400 en la API). */
export function validateRuleInput(input: Partial<CreateAutomationRuleInput>): string[] {
  const issues: string[] = [];
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length < 2)) {
    issues.push('name: mínimo 2 caracteres');
  }
  if (input.trigger_type !== undefined && !AUTOMATION_TRIGGER_TYPES.includes(input.trigger_type)) {
    issues.push(`trigger_type: debe ser ${AUTOMATION_TRIGGER_TYPES.join('|')}`);
  }
  if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 10_000)) {
    issues.push('priority: entero entre 0 y 10000');
  }
  if (input.cooldown_hours !== undefined
    && (!Number.isInteger(input.cooldown_hours) || input.cooldown_hours < 0 || input.cooldown_hours > 8760)) {
    issues.push('cooldown_hours: entero entre 0 y 8760');
  }
  if (input.conditions !== undefined) issues.push(...validateConditions(input.conditions));
  if (input.actions !== undefined) {
    if (!Array.isArray(input.actions)) {
      issues.push('actions: debe ser un arreglo');
    } else {
      if (input.actions.length > 20) issues.push('actions: máximo 20 por regla');
      input.actions.forEach((a, i) => {
        if (!a || typeof a !== 'object') {
          issues.push(`actions[${i}]: objeto requerido`);
          return;
        }
        if (!(AUTOMATION_ACTION_TYPES as readonly string[]).includes(String(a.type))) {
          issues.push(`actions[${i}].type no soportado: ${String(a.type)}`);
        }
        if (a.type === 'update_field') {
          try {
            validateUpdateField(a.entity || 'opportunities', String(a.field_name ?? ''), a.field_value);
          } catch (err) {
            issues.push(`actions[${i}]: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if ((a.type === 'enroll_sequence' || a.type === 'unenroll_sequence') && !a.sequence_id) {
          issues.push(`actions[${i}]: sequence_id requerido`);
        }
      });
    }
  }
  return issues;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getAutomationRules(
  orgId: number,
  supabase: SupabaseClient,
): Promise<AutomationRule[]> {
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', orgId)
    .order('priority', { ascending: true });

  if (error) throw new Error(`getAutomationRules: ${error.message}`);
  return (data ?? []) as AutomationRule[];
}

export async function createAutomationRule(
  orgId: number,
  data: CreateAutomationRuleInput,
  supabase: SupabaseClient,
): Promise<AutomationRule> {
  const issues = validateRuleInput(data);
  if (issues.length) throw new Error(`Regla inválida: ${issues.join('; ')}`);

  const { data: rule, error } = await supabase
    .from('automation_rules')
    .insert({
      organization_id: orgId,
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.trigger_type,
      trigger_config: data.trigger_config || {},
      conditions: normalizeConditions(data.conditions),
      actions: data.actions || [],
      is_active: data.is_active ?? true,
      priority: data.priority ?? 100,
      event: data.event ?? defaultEventFor(data.trigger_type),
      pipeline_id: data.pipeline_id ?? null,
      stage_id: data.stage_id ?? null,
      run_once_per_opportunity: data.run_once_per_opportunity ?? false,
      cooldown_hours: data.cooldown_hours ?? 0,
      template_key: data.template_key ?? null,
      created_by: data.created_by ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rule as AutomationRule;
}

/** Evento por defecto según el disparador (`stage_change` → stage_changed). */
export function defaultEventFor(triggerType: AutomationTriggerType | undefined): string | null {
  switch (triggerType) {
    case 'stage_change':
      return 'opportunity.stage_changed';
    case 'field_change':
      return 'opportunity.updated';
    default:
      return null;
  }
}

export async function updateAutomationRule(
  id: string,
  orgId: number,
  data: UpdateAutomationRuleInput,
  supabase: SupabaseClient,
): Promise<AutomationRule | null> {
  const issues = validateRuleInput(data);
  if (issues.length) throw new Error(`Regla inválida: ${issues.join('; ')}`);

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
  if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
  if (data.conditions !== undefined) updateData.conditions = normalizeConditions(data.conditions);
  if (data.actions !== undefined) updateData.actions = data.actions;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.event !== undefined) updateData.event = data.event;
  if (data.pipeline_id !== undefined) updateData.pipeline_id = data.pipeline_id;
  if (data.stage_id !== undefined) updateData.stage_id = data.stage_id;
  if (data.run_once_per_opportunity !== undefined) updateData.run_once_per_opportunity = data.run_once_per_opportunity;
  if (data.cooldown_hours !== undefined) updateData.cooldown_hours = data.cooldown_hours;
  if (data.updated_by !== undefined) updateData.updated_by = data.updated_by;

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

// ─── Evaluación de disparadores ─────────────────────────────────────────────

/**
 * Reglas activas que coinciden con un disparador. La llama
 * `automation/automationEngine.evaluateRulesForEvent` (listener del outbox).
 */
export async function evaluateTrigger(
  orgId: number,
  triggerType: AutomationTriggerType,
  triggerPayload: Record<string, unknown>,
  supabase: SupabaseClient,
  options?: { eventType?: string | null; context?: RuleContext },
): Promise<AutomationRule[]> {
  // Se filtra por `trigger_type` (columna de V3, siempre poblada). La columna
  // nueva `event` afina después: una regla con `event` distinto al del outbox
  // no aplica; una regla V3 con `event` NULL sigue disparándose por su tipo.
  const { data: rules, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .eq('trigger_type', triggerType)
    .order('priority', { ascending: true });
  if (error) throw new Error(`evaluateTrigger: ${error.message}`);

  const ctx = options?.context ?? emptyRuleContext(orgId, options?.eventType
    ? { event_type: options.eventType, payload: triggerPayload }
    : null);

  const matching: AutomationRule[] = [];
  for (const rule of (rules ?? []) as AutomationRule[]) {
    if (options?.eventType && rule.event && rule.event !== options.eventType) continue;
    if (!matchesTriggerConfig(rule, triggerType, triggerPayload)) continue;
    if (!evaluateConditionTree(rule.conditions, ctx).result) continue;
    matching.push(rule);
  }
  return matching;
}

/** Coincidencia del ámbito de la regla (etapa / pipeline / campo / evento). */
export function matchesTriggerConfig(
  rule: Pick<AutomationRule, 'trigger_config' | 'pipeline_id' | 'stage_id'>,
  triggerType: AutomationTriggerType,
  payload: Record<string, unknown>,
): boolean {
  const config = rule.trigger_config || {};
  const stageId = rule.stage_id ?? (config.stage_id as string | undefined);
  const pipelineId = rule.pipeline_id ?? (config.pipeline_id as string | undefined);

  switch (triggerType) {
    case 'stage_change': {
      const target = (payload.to_stage_id as string) ?? (payload.stage_id as string);
      if (stageId && target && stageId !== target) return false;
      if (pipelineId && payload.pipeline_id && pipelineId !== payload.pipeline_id) return false;
      return true;
    }
    case 'field_change':
      if (config.field_name && payload.field_name && config.field_name !== payload.field_name) return false;
      return true;
    case 'schedule':
      return true;
    case 'event':
      if (config.event_name && payload.event_name && config.event_name !== payload.event_name) return false;
      if (pipelineId && payload.pipeline_id && pipelineId !== payload.pipeline_id) return false;
      return true;
    case 'manual':
      return true;
    default:
      return false;
  }
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

async function insertRun(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<AutomationRun> {
  const { data, error } = await supabase.from('automation_runs').insert(row).select().single();
  if (error || !data) throw new Error(`automation_runs insert: ${error?.message || 'sin datos'}`);
  return data as AutomationRun;
}

async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  orgId: number,
  patch: Record<string, unknown>,
  fallback: AutomationRun,
): Promise<AutomationRun> {
  // El filtro por organización es obligatorio aunque el `id` lo genere este
  // mismo código: el motor corre con service_role y RLS desactivada (D7,
  // tester r2 N6; el `finishRun` de secuencias ya lo llevaba).
  const { data, error } = await supabase
    .from('automation_runs')
    .update(patch)
    .eq('id', runId)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();
  if (error) {
    // El resultado no se pierde en silencio: se refleja en el objeto devuelto.
    return { ...fallback, ...patch, error_message: `${patch.error_message ?? ''} [persist_error: ${error.message}]`.trim() } as AutomationRun;
  }
  return (data as AutomationRun | null) ?? ({ ...fallback, ...patch } as AutomationRun);
}

/** ¿Ya se ejecutó esta regla para esta oportunidad? (`run_once_per_opportunity`) */
async function alreadyRan(
  supabase: SupabaseClient,
  orgId: number,
  ruleId: string,
  opportunityId: string,
  sinceIso?: string,
): Promise<boolean> {
  let q = supabase
    .from('automation_runs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('automation_rule_id', ruleId)
    .eq('opportunity_id', opportunityId)
    .in('status', ['running', 'completed'])
    .limit(1);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(`automation_runs lookup: ${error.message}`);
  return ((data ?? []) as unknown[]).length > 0;
}

/**
 * Ejecuta una regla. El estado final refleja la realidad:
 *   completed  → todas las acciones ok
 *   failed     → alguna acción falló (con `error_message`)
 *   skipped    → regla inactiva, condiciones no cumplidas, run_once o cooldown
 */
export async function executeAutomationRule(
  ruleId: string,
  orgId: number,
  triggerPayload: Record<string, unknown>,
  supabase: SupabaseClient,
  options: ExecuteRuleOptions = {},
): Promise<AutomationRun> {
  if ((options as { force?: unknown }).force) {
    throw new Error('executeAutomationRule: `force` fue retirado (tester r2 N5); usa dry_run');
  }

  const { data: rule, error: ruleError } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (ruleError) throw new Error(`automation_rules: ${ruleError.message}`);
  if (!rule) throw new Error('Regla de automatización no encontrada');

  const automationRule = rule as AutomationRule;
  const now = new Date();

  const opportunityId = (triggerPayload.opportunity_id as string)
    || (options.context?.opportunity?.id as string)
    || null;

  const baseRow = {
    organization_id: orgId,
    automation_rule_id: ruleId,
    trigger_type: automationRule.trigger_type,
    trigger_payload: triggerPayload,
    opportunity_id: opportunityId,
    event_id: options.eventId ?? null,
    rule_version: automationRule.version ?? 1,
  };

  const skip = async (reason: string, extra?: Record<string, unknown>): Promise<AutomationRun> =>
    insertRun(supabase, {
      ...baseRow,
      status: 'skipped',
      skip_reason: reason,
      started_at: now.toISOString(),
      completed_at: now.toISOString(),
      result: { skipped: true, reason, ...(extra ?? {}) },
    });

  // 1. Interruptor de la regla (tester r1 #10). Absoluto: no hay `force` que
  // lo salte (tester r2 N5). La prueba de una regla apagada es `dry_run`.
  if (!automationRule.is_active) {
    return skip('rule_inactive');
  }

  // 2. Contexto real (oportunidad / cliente / etapa / consentimiento).
  const ctx = options.context ?? await loadRuleContext(
    {
      orgId,
      opportunityId,
      customerId: (triggerPayload.customer_id as string) ?? null,
      event: options.eventId || triggerPayload.event_type
        ? { event_type: String(triggerPayload.event_type ?? automationRule.event ?? 'manual'), payload: triggerPayload }
        : null,
      now,
    },
    supabase,
  );

  // 3. Condiciones.
  const evaluated = evaluateConditionTree(automationRule.conditions, ctx);
  if (!evaluated.result) {
    return skip('conditions_not_met', { trace: evaluated.trace });
  }

  // 4. run_once / cooldown.
  if (opportunityId && automationRule.run_once_per_opportunity) {
    if (await alreadyRan(supabase, orgId, ruleId, opportunityId)) return skip('run_once_per_opportunity');
  }
  if (opportunityId && (automationRule.cooldown_hours ?? 0) > 0) {
    const since = new Date(now.getTime() - automationRule.cooldown_hours * 3_600_000).toISOString();
    if (await alreadyRan(supabase, orgId, ruleId, opportunityId, since)) return skip('cooldown');
  }

  const actions = (automationRule.actions || []) as AutomationAction[];
  const run = await insertRun(supabase, {
    ...baseRow,
    status: 'running',
    started_at: now.toISOString(),
    actions_plan: actions.map((a, i) => ({ index: i, type: a?.type ?? null })),
  });

  const results: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const [index, action] of actions.entries()) {
    try {
      const result = await executeAction(action, {
        orgId,
        supabase,
        ctx,
        originKey: `rule:${ruleId}:run:${run.id}`,
        actionIndex: index,
        userId: options.userId ?? null,
        enqueue: options.enqueue,
      });
      results.push({ index, ...result });
    } catch (err) {
      const message = err instanceof ActionError ? err.message : err instanceof Error ? err.message : String(err);
      const code = err instanceof ActionError ? err.code : 'error';
      results.push({ index, type: action?.type ?? 'desconocida', status: 'failed', code, error: message });
      errors.push(`[${index}] ${code}: ${message}`);
    }
  }

  const finished = await finishRun(
    supabase,
    run.id,
    orgId,
    {
      status: errors.length ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
      result: { actions_executed: results.length, failed: errors.length, results },
      error_message: errors.length ? errors.join(' | ').slice(0, 2000) : null,
    },
    run,
  );

  await supabase
    .from('automation_rules')
    .update({ last_run_at: new Date().toISOString(), runs_count: (automationRule.runs_count ?? 0) + 1 })
    .eq('id', ruleId)
    .eq('organization_id', orgId);

  return finished;
}

/**
 * Ejecución en seco: evalúa condiciones y devuelve el plan sin tocar nada
 * (no escribe `automation_runs`).
 */
export async function testRunAutomationRule(
  ruleId: string,
  orgId: number,
  opportunityId: string | null,
  supabase: SupabaseClient,
): Promise<{ matched: boolean; skip_reason: string | null; trace: unknown[]; actions_plan: unknown[] }> {
  const { data: rule, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`automation_rules: ${error.message}`);
  if (!rule) throw new Error('Regla de automatización no encontrada');

  const r = rule as AutomationRule;
  const ctx = await loadRuleContext({ orgId, opportunityId }, supabase);
  const evaluated = evaluateConditionTree(r.conditions, ctx);
  const plan = (r.actions || []).map((a, i) => ({
    index: i,
    type: a?.type ?? null,
    implemented: (AUTOMATION_ACTION_TYPES as readonly string[]).includes(String(a?.type))
      && !(NOT_IMPLEMENTED_ACTIONS as readonly string[]).includes(String(a?.type)),
  }));

  return {
    matched: r.is_active && evaluated.result,
    skip_reason: !r.is_active ? 'rule_inactive' : evaluated.result ? null : 'conditions_not_met',
    trace: evaluated.trace,
    actions_plan: plan,
  };
}

// ─── Historial ───────────────────────────────────────────────────────────────

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

  if (filters?.rule_id) query = query.eq('automation_rule_id', filters.rule_id);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.trigger_type) query = query.eq('trigger_type', filters.trigger_type);

  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const offset = Math.max(filters?.offset ?? 0, 0);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`getAutomationRuns: ${error.message}`);
  return { data: (data || []) as AutomationRun[], count: count || 0 };
}
