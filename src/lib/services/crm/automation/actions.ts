/**
 * Catálogo de acciones del motor de automatizaciones (FASE-08 §0.3, §4.2).
 *
 * Reglas de honestidad del resultado (tester r1 #5):
 *  - Una acción que no se puede ejecutar LANZA `ActionError`; el llamador marca
 *    la ejecución como `failed`. Nunca se devuelve `{status:'unknown_action'}`
 *    como éxito.
 *  - Las acciones que aún no existen (`send_sms`, `start_ai_agent`,
 *    `ai_draft_email`, `book_meeting_request`, `webhook_out`) lanzan
 *    `action_not_implemented`: se ven en rojo en el historial, no en verde.
 *  - Los destinatarios NUNCA salen del cuerpo de la petición: se resuelven del
 *    cliente de la oportunidad, de modo que F7/F16 aplican `fn_can_contact`
 *    (consentimiento) y la ventana de 24 h de WhatsApp. Un `to` fijo que no
 *    corresponda a ningún cliente de la organización se RECHAZA salvo
 *    `allow_non_customer: true` (tester r2 N4).
 *  - El asunto y el cuerpo HTML se entregan a F7 SIN sustituir: quien renderiza
 *    es quien escapa (tester r2 N8). Aquí solo se cualifican los nombres de las
 *    variables planas de F8 (`qualifyVarsForEmail`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/crm/emailService';
import { ACTIVITY_TYPES, TASK_PRIORITIES, type JobKind } from '@/lib/crm/enums';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { contextVariables, qualifyVarsForEmail, renderVars, type RuleContext } from './ruleContext';

export const AUTOMATION_ACTION_TYPES = [
  'send_email',
  'send_whatsapp',
  'send_sms',
  'create_task',
  'create_activity',
  'update_field',
  'enroll_sequence',
  'unenroll_sequence',
  'notify_user',
  'move_stage',
  'start_ai_agent',
  'ai_draft_email',
  'book_meeting_request',
  'webhook_out',
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

/** Acciones declaradas en el catálogo pero todavía sin implementación real. */
export const NOT_IMPLEMENTED_ACTIONS: readonly AutomationActionType[] = [
  'send_sms',
  'start_ai_agent',
  'ai_draft_email',
  'book_meeting_request',
  'webhook_out',
] as const;

export class ActionError extends Error {
  code: string;
  actionType: string;
  constructor(actionType: string, code: string, message?: string) {
    super(message ? `${actionType}: ${message}` : `${actionType}: ${code}`);
    this.name = 'ActionError';
    this.code = code;
    this.actionType = actionType;
  }
}

export interface AutomationAction {
  type: AutomationActionType | string;
  // send_email / send_whatsapp
  to?: string;
  /**
   * Permite `to` fijo aunque no corresponda a ningún cliente de la org (avisos
   * internos). Sin esto el envío se rechaza porque F7 no podría consultar el
   * consentimiento (tester r2 N4).
   */
  allow_non_customer?: boolean;
  subject?: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_variables?: Record<string, string | number>;
  purpose?: 'utility' | 'marketing';
  // create_task
  title?: string;
  description?: string;
  due_in_days?: number;
  priority?: string;
  task_type?: string;
  assign_to?: 'owner' | 'user' | 'none';
  user_id?: string;
  // create_activity
  activity_type?: string;
  notes?: string;
  // update_field
  entity?: string;
  entity_id?: string;
  field_name?: string;
  field_value?: unknown;
  // enroll_sequence / unenroll_sequence
  sequence_id?: string;
  reason?: string;
  // move_stage
  stage_id?: string;
  // notify_user
  content?: string;
}

export type EnqueueFn = (input: {
  organizationId: number;
  kind: JobKind;
  payload: Record<string, unknown>;
  runAt?: Date | string;
  dedupeKey?: string;
  maxAttempts?: number;
}) => Promise<string>;

export interface ActionRunContext {
  orgId: number;
  supabase: SupabaseClient;
  ctx: RuleContext;
  /** Identificador estable del origen, para idempotencia (`rule:{id}:run:{id}`). */
  originKey: string;
  actionIndex: number;
  userId?: string | null;
  /** Inyectable en tests; por defecto la cola real (`fn_enqueue_job`). */
  enqueue?: EnqueueFn;
}


// ─── update_field: allow-list (F0, C-H) ─────────────────────────────────────

type FieldKind = 'text' | 'number' | 'date' | 'string_array';

export const UPDATE_FIELD_ALLOWLIST: Record<string, Record<string, FieldKind>> = {
  opportunities: {
    temperature: 'text',
    next_contact_at: 'date',
    next_action: 'text',
    expected_close_date: 'date',
    amount: 'number',
    recontact_at: 'date',
    source: 'text',
    deal_type: 'text',
  },
  customers: {
    lifecycle_stage: 'text',
    tags: 'string_array',
  },
  tasks: {
    priority: 'text',
    due_date: 'date',
  },
};

const OPPORTUNITY_TEMPERATURES = ['hot', 'warm', 'cold'];

export function validateUpdateField(entity: string, field: string, value: unknown): unknown {
  const columns = UPDATE_FIELD_ALLOWLIST[entity];
  if (!columns) throw new Error(`update_field: entidad no permitida '${entity}'`);
  const kind = columns[field];
  if (!kind) throw new Error(`update_field: columna no permitida '${entity}.${field}'`);

  if (value === null || value === undefined) return null;

  switch (kind) {
    case 'text': {
      if (typeof value !== 'string' || value.length > 2000) {
        throw new Error(`update_field: '${field}' debe ser texto (≤2000)`);
      }
      if (entity === 'opportunities' && field === 'temperature' && !OPPORTUNITY_TEMPERATURES.includes(value)) {
        throw new Error(`update_field: temperature debe ser ${OPPORTUNITY_TEMPERATURES.join('|')}`);
      }
      if (entity === 'tasks' && field === 'priority' && !(TASK_PRIORITIES as readonly string[]).includes(value)) {
        throw new Error(`update_field: priority debe ser ${TASK_PRIORITIES.join('|')}`);
      }
      return value;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`update_field: '${field}' debe ser numérico`);
      return n;
    }
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new Error(`update_field: '${field}' debe ser una fecha ISO`);
      return d.toISOString();
    }
    case 'string_array': {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new Error(`update_field: '${field}' debe ser un arreglo de strings`);
      }
      return value.slice(0, 50);
    }
    default:
      throw new Error(`update_field: tipo desconocido para '${field}'`);
  }
}

// ─── Utilidades comunes ─────────────────────────────────────────────────────

/** Fecha de vencimiento saneada (0–365 días). */
export function dueDateFrom(now: Date, dueInDays: unknown): string {
  const raw = typeof dueInDays === 'number' ? dueInDays : Number(dueInDays);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), 365) : 1;
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Inserta una tarea con el esquema REAL de `tasks`
 * (`related_to_id`/`related_to_type`, `status='open'`). Compartido por reglas y
 * pasos de secuencia para que no vuelvan a divergir (tester r1 #2).
 */
export async function insertAutomationTask(
  supabase: SupabaseClient,
  orgId: number,
  input: {
    title: string;
    description?: string;
    dueDate: string;
    priority?: string;
    type?: string;
    opportunityId?: string | null;
    customerId?: string | null;
    assignedTo?: string | null;
  },
): Promise<string> {
  const priority = input.priority && (TASK_PRIORITIES as readonly string[]).includes(input.priority)
    ? input.priority
    : 'med';

  const row: Record<string, unknown> = {
    organization_id: orgId,
    title: input.title,
    description: input.description ?? '',
    status: 'open',
    priority,
    due_date: input.dueDate,
    type: input.type ?? 'followup',
    related_to_id: input.opportunityId ?? null,
    related_to_type: input.opportunityId ? 'opportunity' : null,
    customer_id: input.customerId ?? null,
    assigned_to: input.assignedTo ?? null,
  };

  const { data, error } = await supabase.from('tasks').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

function ownerOf(ctx: RuleContext): string | null {
  const o = ctx.opportunity ?? {};
  return (o.salesperson_id as string) || (o.created_by as string) || null;
}

// ─── Ejecutor ───────────────────────────────────────────────────────────────

export interface ActionResult {
  type: string;
  status: 'ok';
  [key: string]: unknown;
}

/**
 * Ejecuta UNA acción. Lanza `ActionError` si no se puede completar: quien llama
 * refleja el fallo en `automation_runs` / `sequence_step_runs`.
 */
export async function executeAction(
  action: AutomationAction,
  run: ActionRunContext,
): Promise<ActionResult> {
  const { orgId, supabase, ctx } = run;
  // Se reutiliza el cliente del llamador (el runner ya trae service_role) en
  // vez de construir otro con `getServiceClient()`.
  const enqueue = run.enqueue ?? ((input) => enqueueJob({ ...input, supabase }));
  const vars = contextVariables(ctx);
  const type = action?.type as AutomationActionType;

  if (!type || !(AUTOMATION_ACTION_TYPES as readonly string[]).includes(type)) {
    throw new ActionError(String(action?.type ?? 'desconocida'), 'unknown_action', 'tipo de acción no soportado');
  }
  if (NOT_IMPLEMENTED_ACTIONS.includes(type)) {
    throw new ActionError(type, 'action_not_implemented', 'acción declarada en el catálogo pero sin implementación');
  }

  switch (type) {
    case 'send_email': {
      // El destinatario se resuelve SIEMPRE del cliente del contexto: nunca del
      // payload del disparador (tester r1 #8). `action.to` (fija por un admin)
      // solo se usa si no hay cliente y se intenta ligar a un customer de la org.
      const customerEmail = (ctx.customer?.email as string | undefined) || null;
      let to = customerEmail;
      let toCustomerId = (ctx.customer?.id as string | undefined) ?? null;

      if (!to && action.to) {
        to = action.to;
        const { data: match, error } = await supabase
          .from('customers')
          .select('id')
          .eq('organization_id', orgId)
          .eq('email', action.to)
          .maybeSingle();
        if (error) throw new ActionError(type, 'lookup_failed', error.message);
        toCustomerId = (match as { id: string } | null)?.id ?? null;
        // Sin cliente que resuelva, F7 no puede consultar `fn_can_contact` y el
        // correo se saltaría el consentimiento (tester r2 N4). Ese destino solo
        // se permite si el administrador lo declara explícitamente (avisos
        // internos), nunca por omisión.
        if (!toCustomerId && action.allow_non_customer !== true) {
          throw new ActionError(
            type,
            'recipient_not_a_customer',
            `'${action.to}' no corresponde a ningún cliente de la organización; marca allow_non_customer si es un aviso interno`,
          );
        }
      }
      if (!to) throw new ActionError(type, 'no_recipient', 'sin cliente con email en el contexto');

      const message = await sendEmail(
        orgId,
        {
          to,
          to_customer_id: toCustomerId ?? undefined,
          // El asunto y el HTML viajan SIN sustituir: quien renderiza (F7)
          // escapa cada valor. Aquí solo se cualifican las variables planas de
          // F8 (`{{customer_name}}` -> `{{custom.customer_name}}`), N8.
          subject: qualifyVarsForEmail(action.subject || 'Notificación automática', vars),
          html: qualifyVarsForEmail(action.html || '', vars),
          template_id: action.template_id,
          template_variables: { ...vars, ...(action.template_variables ?? {}) },
          related_type: ctx.opportunity?.id ? 'opportunity' : undefined,
          related_id: (ctx.opportunity?.id as string) || undefined,
          idempotency_key: `${run.originKey}:action:${run.actionIndex}`,
          kind: 'transactional',
        },
        supabase,
      );
      return { type, status: 'ok', email_message_id: message.id, to_customer_id: toCustomerId };
    }

    case 'send_whatsapp': {
      const customerId = (ctx.customer?.id as string | undefined) ?? null;
      if (!customerId) throw new ActionError(type, 'no_recipient', 'sin cliente en el contexto');
      if (!ctx.customer?.phone) throw new ActionError(type, 'no_phone', 'el cliente no tiene teléfono');

      // El envío real lo hace F16 (`sendWhatsApp`), que aplica opt-out,
      // ventana de 24 h y plantillas HSM. Aquí solo se encola.
      const jobId = await enqueue({
        organizationId: orgId,
        kind: 'whatsapp',
        payload: {
          message_request: {
            orgId,
            customerId,
            opportunityId: (ctx.opportunity?.id as string) || null,
            text: action.text ? renderVars(action.text, vars) : null,
            template: action.template_id ? { templateId: action.template_id, variables: vars } : null,
            purpose: action.purpose ?? 'utility',
            source: 'crm',
            clientRequestId: `${run.originKey}:action:${run.actionIndex}`,
          },
          customer_id: customerId,
        },
        dedupeKey: `${run.originKey}:action:${run.actionIndex}`,
        maxAttempts: 3,
      });
      return { type, status: 'ok', job_id: jobId, queued: true };
    }

    case 'create_task': {
      const assignedTo = action.assign_to === 'user' ? action.user_id ?? null
        : action.assign_to === 'none' ? null
        : ownerOf(ctx);
      const taskId = await insertAutomationTask(supabase, orgId, {
        title: renderVars(action.title || 'Tarea automática', vars),
        description: renderVars(action.description || '', vars),
        dueDate: dueDateFrom(ctx.now, action.due_in_days ?? 1),
        priority: action.priority,
        type: action.task_type,
        opportunityId: (ctx.opportunity?.id as string) || null,
        customerId: (ctx.customer?.id as string) || null,
        assignedTo,
      }).catch((err: unknown) => {
        throw new ActionError(type, 'insert_failed', err instanceof Error ? err.message : String(err));
      });
      return { type, status: 'ok', task_id: taskId };
    }

    case 'create_activity': {
      const activityType = action.activity_type || 'system';
      if (!(ACTIVITY_TYPES as readonly string[]).includes(activityType)) {
        throw new ActionError(type, 'invalid_activity_type', `'${activityType}' no está en el CHECK de activities`);
      }
      const { data, error } = await supabase
        .from('activities')
        .insert({
          organization_id: orgId,
          activity_type: activityType,
          notes: renderVars(action.notes || 'Actividad automática', vars),
          related_type: ctx.opportunity?.id ? 'opportunity' : null,
          related_id: (ctx.opportunity?.id as string) || null,
          occurred_at: ctx.now.toISOString(),
          metadata: { source: 'automation', origin: run.originKey },
        })
        .select('id')
        .single();
      if (error) throw new ActionError(type, 'insert_failed', error.message);
      return { type, status: 'ok', activity_id: (data as { id: string }).id };
    }

    case 'update_field': {
      const entity = action.entity || 'opportunities';
      const entityId = action.entity_id
        || (entity === 'customers' ? (ctx.customer?.id as string) : (ctx.opportunity?.id as string));
      if (!entityId || !action.field_name) {
        throw new ActionError(type, 'missing_target', 'falta entity_id o field_name');
      }
      let value: unknown;
      try {
        value = validateUpdateField(entity, action.field_name, action.field_value);
      } catch (err) {
        throw new ActionError(type, 'not_allowed', err instanceof Error ? err.message : String(err));
      }
      const { error } = await supabase
        .from(entity)
        .update({ [action.field_name]: value, updated_at: ctx.now.toISOString() })
        .eq('id', entityId)
        .eq('organization_id', orgId);
      if (error) throw new ActionError(type, 'update_failed', error.message);
      return { type, status: 'ok', entity, entity_id: entityId, field: action.field_name };
    }

    case 'enroll_sequence': {
      if (!action.sequence_id) throw new ActionError(type, 'missing_sequence_id');
      const opportunityId = (ctx.opportunity?.id as string) || null;
      const customerId = (ctx.customer?.id as string) || null;
      if (!opportunityId && !customerId) throw new ActionError(type, 'missing_target', 'sin oportunidad ni cliente');
      // Import diferido: sequenceService importa este módulo para el paso `task`.
      const { enrollInSequence } = await import('@/lib/services/crm/sequenceService');
      const result = await enrollInSequence(orgId, action.sequence_id, opportunityId, supabase, {
        customerId,
        source: 'rule',
      }).catch((err: unknown) => {
        throw new ActionError(type, 'enroll_failed', err instanceof Error ? err.message : String(err));
      });
      return { type, status: 'ok', enrollment_id: result.id, created: result.created, reason: result.reason ?? null };
    }

    case 'unenroll_sequence': {
      if (!action.sequence_id) throw new ActionError(type, 'missing_sequence_id');
      const opportunityId = (ctx.opportunity?.id as string) || null;
      if (!opportunityId) throw new ActionError(type, 'missing_target', 'sin oportunidad en el contexto');
      const { data, error } = await supabase
        .from('sequence_enrollments')
        .update({
          status: 'exited',
          exited_at: ctx.now.toISOString(),
          exit_reason: action.reason || 'rule_unenroll',
        })
        .eq('organization_id', orgId)
        .eq('sequence_id', action.sequence_id)
        .eq('opportunity_id', opportunityId)
        .in('status', ['active', 'paused'])
        .select('id');
      if (error) throw new ActionError(type, 'update_failed', error.message);
      return { type, status: 'ok', exited: (data as { id: string }[] | null)?.length ?? 0 };
    }

    case 'notify_user': {
      const recipient = action.user_id || ownerOf(ctx);
      if (!recipient) throw new ActionError(type, 'no_recipient', 'sin usuario destino (owner vacío)');
      const { error } = await supabase.rpc('fn_create_org_notification', {
        p_organization_id: orgId,
        p_recipient_user_id: recipient,
        p_channel: 'in_app',
        p_type: 'automation',
        p_title: renderVars(action.title || 'Automatización', vars),
        p_content: renderVars(action.content || action.description || '', vars),
        p_metadata: { origin: run.originKey, opportunity_id: (ctx.opportunity?.id as string) || null },
      });
      if (error) throw new ActionError(type, 'rpc_failed', error.message);
      return { type, status: 'ok', recipient_user_id: recipient };
    }

    case 'move_stage': {
      const opportunityId = (ctx.opportunity?.id as string) || null;
      if (!opportunityId) throw new ActionError(type, 'missing_target', 'sin oportunidad en el contexto');
      if (!action.stage_id) throw new ActionError(type, 'missing_stage_id');
      // Import diferido: `stageGateService` crea un cliente Supabase al cargarse
      // (deuda legacy en la allow-list del guardarraíl 6); no debe cargarse solo
      // por importar el catálogo de acciones.
      const { evaluateStageGate } = await import('@/lib/services/crm/stageGateService');
      const gate = await evaluateStageGate(supabase, orgId, {
        opportunityId,
        targetStageId: action.stage_id,
      });
      if (!gate.ok) {
        throw new ActionError(type, 'gate_blocked', gate.missing.map((m) => m.label).join(', '));
      }
      const { error } = await supabase
        .from('opportunities')
        .update({ stage_id: action.stage_id, updated_at: ctx.now.toISOString() })
        .eq('id', opportunityId)
        .eq('organization_id', orgId);
      if (error) throw new ActionError(type, 'update_failed', error.message);
      return { type, status: 'ok', opportunity_id: opportunityId, stage_id: action.stage_id };
    }

    default:
      throw new ActionError(String(type), 'unknown_action');
  }
}
