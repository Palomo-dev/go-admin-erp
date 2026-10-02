/**
 * Voice Agent Tools — FASE 6: herramientas de CRM que el agente IA puede ejecutar.
 *
 * Correcciones de la ronda 1 (TEST-F6-r1):
 *  - I1: este módulo ya NO importa `stageGateService` (que evaluaba el cliente de
 *    NAVEGADOR de Supabase al cargarse). Es código de servidor puro: recibe el
 *    `SupabaseClient` por parámetro.
 *  - A6/A7/I4: `activities` usa los `activity_type` del CHECK real y las columnas
 *    reales (`notes`, `related_type`, `related_id`, `metadata`); `tasks` usa
 *    `related_to_id`/`related_to_type` y `status` del CHECK (`open`).
 *  - I5: `move_opportunity_stage` NO miente: se niega a mover a una etapa terminal
 *    (ganada/perdida), que es lo que dejaba la oportunidad abierta para siempre en
 *    la columna «Ganada». El cierre lo hace una persona.
 *  - C-F6-13: catálogo real de acciones del CRM, incluidas las que pidió el dueño.
 *  - M-F6-29: las definiciones tienen la forma anidada que exige `chat.completions`.
 *  - Toda ejecución queda registrada en `voice_agent_tool_runs`.
 */

import { OPPORTUNITY_WRITABLE_FIELDS } from './voiceAgentToolCatalog';
export { ALL_TOOL_NAMES, OPPORTUNITY_WRITABLE_FIELDS, MANDATORY_TOOLS, VOICE_AGENT_TOOL_DEFINITIONS, toolDefinitionsFor } from './voiceAgentToolCatalog';
export type { ChatToolDefinition } from './voiceAgentToolCatalog';

import type { SupabaseClient } from '@supabase/supabase-js';
import { bookMeeting } from './voiceAgent/reuniones';
export { bookMeeting, resolverInicioReunion } from './voiceAgent/reuniones';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Mensaje corto que el agente puede leer en voz alta. */
  say?: string;
}

export interface ToolContext {
  orgId: number;
  supabase: SupabaseClient;
  /** Fila de `voice_agent_calls` en curso (para trazabilidad y correlación). */
  voiceAgentCallId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  /** 'auto' aplica los cambios; 'suggest' solo los registra como sugerencia. */
  actionPolicy?: 'auto' | 'suggest';
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  related_to_id?: string;
  related_to_type?: string;
  assigned_to?: string;
  due_date?: string;
}

/** Campos de `opportunities` que el agente puede escribir (allow-list, D7). */

export type OpportunityWritableField = (typeof OPPORTUNITY_WRITABLE_FIELDS)[number];

// ─── Registro de ejecuciones ─────────────────────────────────────────────────

export async function recordToolRun(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  result: ToolResult,
  status: 'applied' | 'suggested' | 'denied' | 'failed'
): Promise<void> {
  const { error } = await ctx.supabase.from('voice_agent_tool_runs').insert({
    organization_id: ctx.orgId,
    voice_agent_call_id: ctx.voiceAgentCallId ?? null,
    tool,
    args,
    result: (result as unknown as Record<string, unknown>) ?? {},
    status,
    error_message: result.error ?? null,
    applied_at: status === 'applied' ? new Date().toISOString() : null,
  });
  // No se traga el error: se registra con su mensaje real (nunca `.catch(() => {})`).
  if (error) console.error('[voiceAgentTools] no se pudo registrar la ejecución:', error.message);
}

/** Actividad en el timeline de la oportunidad/cliente (columnas y CHECK reales). */
async function logActivity(
  ctx: ToolContext,
  params: {
    relatedType: 'opportunity' | 'customer';
    relatedId: string;
    notes: string;
    metadata?: Record<string, unknown>;
    outcome?: string;
  }
): Promise<void> {
  const { error } = await ctx.supabase.from('activities').insert({
    organization_id: ctx.orgId,
    activity_type: 'ai_call', // CHECK real: call|email|whatsapp|sms|meeting|visit|note|system|ai_call|task
    related_type: params.relatedType,
    related_id: params.relatedId,
    notes: params.notes,
    channel: 'voice',
    outcome: params.outcome ?? null,
    occurred_at: new Date().toISOString(),
    metadata: {
      source: 'voice_agent',
      voice_agent_call_id: ctx.voiceAgentCallId ?? null,
      ...(params.metadata ?? {}),
    },
  });
  if (error) console.error('[voiceAgentTools] activity:', error.message);
}

// ─── Tool: get_customer_context ──────────────────────────────────────────────

export async function getCustomerContext(ctx: ToolContext, customerId: string): Promise<ToolResult> {
  const { data: customer, error: custError } = await ctx.supabase
    .from('customers')
    .select('id, first_name, last_name, full_name, company_name, email, phone, timezone, do_not_call, lifecycle_stage')
    .eq('id', customerId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();

  if (custError) return { success: false, error: custError.message };
  if (!customer) return { success: false, error: 'Cliente no encontrado' };

  const { data: opportunities, error: oppError } = await ctx.supabase
    .from('opportunities')
    .select('id, name, amount, currency, expected_close_date, status, stages:stage_id(id, name, position)')
    .eq('customer_id', customerId)
    .eq('organization_id', ctx.orgId)
    .eq('status', 'open') // CHECK real: open|won|lost (antes se filtraba por valores inexistentes)
    .order('created_at', { ascending: false })
    .limit(5);
  if (oppError) return { success: false, error: oppError.message };

  const { data: activities, error: actError } = await ctx.supabase
    .from('activities')
    .select('id, activity_type, notes, outcome, occurred_at')
    .eq('related_id', customerId)
    .eq('related_type', 'customer')
    .eq('organization_id', ctx.orgId)
    .order('occurred_at', { ascending: false })
    .limit(10);
  if (actError) return { success: false, error: actError.message };

  const { data: tasks, error: taskError } = await ctx.supabase
    .from('tasks')
    .select('id, title, status, due_date')
    .eq('related_to_id', customerId)
    .eq('related_to_type', 'customer')
    .eq('organization_id', ctx.orgId)
    .in('status', ['open', 'in_progress'])
    .order('due_date', { ascending: true })
    .limit(5);
  if (taskError) return { success: false, error: taskError.message };

  return {
    success: true,
    data: {
      customer,
      opportunities: opportunities || [],
      recent_activities: activities || [],
      pending_tasks: tasks || [],
    },
  };
}

// ─── Tool: move_opportunity_stage ────────────────────────────────────────────

/**
 * Mueve una oportunidad de etapa.
 * I5: se NIEGA a mover a una etapa terminal (is_won / is_lost). Mover ahí sin
 * desenlace dejaba la oportunidad en la columna «Ganada» y abierta para siempre,
 * y la herramienta respondía `success: true`. El cierre lo confirma una persona.
 */
export async function moveOpportunityStage(
  ctx: ToolContext,
  opportunityId: string,
  stageId: string
): Promise<ToolResult> {
  const { data: opportunity, error: oppError } = await ctx.supabase
    .from('opportunities')
    .select('id, stage_id, pipeline_id, salesperson_id, name')
    .eq('id', opportunityId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (oppError) return { success: false, error: oppError.message };
  if (!opportunity) return { success: false, error: 'Oportunidad no encontrada' };

  const opp = opportunity as { id: string; pipeline_id: string; salesperson_id: string | null; name: string };

  const { data: stage, error: stageError } = await ctx.supabase
    .from('stages')
    .select('id, name, pipeline_id, is_won, is_lost')
    .eq('id', stageId)
    .maybeSingle();
  if (stageError) return { success: false, error: stageError.message };
  if (!stage) return { success: false, error: 'Etapa no encontrada' };

  const st = stage as { id: string; name: string; pipeline_id: string; is_won: boolean; is_lost: boolean };
  if (st.pipeline_id !== opp.pipeline_id) {
    return { success: false, error: 'La etapa pertenece a otro embudo' };
  }

  if (st.is_won || st.is_lost) {
    // No se miente ni se deja un estado incoherente: se deja una tarea para cerrar.
    const task = await createTask(ctx, {
      title: `Confirmar cierre de «${opp.name}» (${st.is_won ? 'ganada' : 'perdida'})`,
      description:
        'El agente IA detectó el desenlace durante la llamada. El cierre debe confirmarlo una persona ' +
        'para registrar importe, fecha de cierre y comisión.',
      related_to_id: opportunityId,
      related_to_type: 'opportunity',
      assigned_to: opp.salesperson_id ?? undefined,
    });
    return {
      success: false,
      error:
        `«${st.name}» es una etapa de cierre: el agente IA no puede cerrar oportunidades. ` +
        'Se creó una tarea para que el vendedor confirme el cierre.',
      data: { task: task.data, requires_human_close: true },
      say: 'Perfecto, dejo el caso listo para que un asesor lo confirme con usted.',
    };
  }

  if (ctx.actionPolicy === 'suggest') {
    return {
      success: true,
      data: { suggested_stage_id: stageId, applied: false },
      say: 'Anoto ese avance para que el equipo lo revise.',
    };
  }

  const { data: updated, error: updateError } = await ctx.supabase
    .from('opportunities')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('organization_id', ctx.orgId)
    .select('id, stage_id')
    .maybeSingle();
  if (updateError) return { success: false, error: updateError.message };
  if (!updated) return { success: false, error: 'No se pudo mover la etapa' };

  await logActivity(ctx, {
    relatedType: 'opportunity',
    relatedId: opportunityId,
    notes: `El agente IA movió la oportunidad a la etapa «${st.name}».`,
    outcome: 'stage_moved',
    metadata: { new_stage_id: stageId, new_stage_name: st.name },
  });

  return { success: true, data: { opportunity_id: opportunityId, new_stage_id: stageId, applied: true } };
}

// ─── Tool: update_opportunity_field ──────────────────────────────────────────

export async function updateOpportunityField(
  ctx: ToolContext,
  opportunityId: string,
  field: string,
  value: unknown
): Promise<ToolResult> {
  if (!(OPPORTUNITY_WRITABLE_FIELDS as readonly string[]).includes(field)) {
    return { success: false, error: `Campo no permitido: ${field}` };
  }
  if (ctx.actionPolicy === 'suggest') {
    return { success: true, data: { field, value, applied: false } };
  }

  const { data, error } = await ctx.supabase
    .from('opportunities')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('organization_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Oportunidad no encontrada' };

  await logActivity(ctx, {
    relatedType: 'opportunity',
    relatedId: opportunityId,
    notes: `El agente IA actualizó «${field}» durante la llamada.`,
    outcome: 'field_updated',
    metadata: { field, value },
  });
  return { success: true, data: { field, value, applied: true } };
}

// ─── Tool: create_task ───────────────────────────────────────────────────────

export async function createTask(ctx: ToolContext, data: CreateTaskInput): Promise<ToolResult> {
  if (!data.title) return { success: false, error: 'El título es obligatorio' };

  const { data: task, error } = await ctx.supabase
    .from('tasks')
    .insert({
      organization_id: ctx.orgId,
      title: data.title,
      description: data.description ?? null,
      related_to_id: data.related_to_id ?? ctx.opportunityId ?? ctx.customerId ?? null,
      related_to_type: data.related_to_type ?? (ctx.opportunityId ? 'opportunity' : 'customer'),
      assigned_to: data.assigned_to ?? null,
      status: 'open', // CHECK real: open|in_progress|done|canceled
      priority: 'med',
      due_date: data.due_date ?? null,
      type: 'ai_call_followup',
    })
    .select('id, title, status')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: task };
}

// ─── Tool: schedule_callback ─────────────────────────────────────────────────

export async function scheduleCallback(
  ctx: ToolContext,
  args: { when: string; reason?: string }
): Promise<ToolResult> {
  const when = Date.parse(args.when);
  if (!Number.isFinite(when)) return { success: false, error: 'Fecha inválida' };
  if (!ctx.voiceAgentCallId) return { success: false, error: 'No hay llamada en curso' };

  if (when <= Date.now()) return { success: false, error: 'La hora de la devolución ya pasó' };

  const { data: current, error: curError } = await ctx.supabase
    .from('voice_agent_calls')
    .select('status, voice_agent_id, campaign_id, customer_id, opportunity_id, stage_agent_id')
    .eq('id', ctx.voiceAgentCallId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (curError) return { success: false, error: curError.message };
  if (!current) return { success: false, error: 'Llamada no encontrada' };

  const row = current as Record<string, unknown>;
  const outcome = args.reason ? `callback: ${args.reason}`.slice(0, 500) : 'callback';

  // Durante la llamada la fila sigue viva y el índice «una viva por cliente»
  // rechaza otra `pending` del mismo cliente. Se guarda la hora en la propia
  // llamada y el trigger `trg_vac_encolar_devolucion` (migración 20260930240000)
  // crea la fila `pending` cuando la llamada se cierra.
  if (row.status === 'pending' || row.status === 'queued' || row.status === 'in_progress') {
    const scheduledAt = new Date(when).toISOString();
    const { error: updError } = await ctx.supabase
      .from('voice_agent_calls')
      .update({ callback_at: scheduledAt, outcome, updated_at: new Date().toISOString() })
      .eq('id', ctx.voiceAgentCallId)
      .eq('organization_id', ctx.orgId);
    if (updError) return { success: false, error: updError.message };
    return { success: true, data: { scheduled_at: scheduledAt }, say: 'Perfecto, le devolvemos la llamada en ese momento.' };
  }

  const { data: created, error } = await ctx.supabase
    .from('voice_agent_calls')
    .insert({
      organization_id: ctx.orgId,
      voice_agent_id: row.voice_agent_id,
      campaign_id: row.campaign_id,
      customer_id: row.customer_id,
      opportunity_id: row.opportunity_id,
      stage_agent_id: row.stage_agent_id,
      status: 'pending',
      scheduled_at: new Date(when).toISOString(),
      outcome,
    })
    .select('id, scheduled_at')
    .single();
  if (error) return { success: false, error: error.message };

  return { success: true, data: created, say: 'Perfecto, le devolvemos la llamada en ese momento.' };
}

// ─── Tool: log_objection ─────────────────────────────────────────────────────

export async function logObjection(
  ctx: ToolContext,
  args: { objection: string; detail?: string }
): Promise<ToolResult> {
  if (!args.objection?.trim()) return { success: false, error: 'La objeción no puede estar vacía' };
  const relatedId = ctx.opportunityId ?? ctx.customerId;
  if (!relatedId) return { success: false, error: 'Sin oportunidad ni cliente asociado' };

  await logActivity(ctx, {
    relatedType: ctx.opportunityId ? 'opportunity' : 'customer',
    relatedId,
    notes: `Objeción detectada por el agente IA: ${args.objection}${args.detail ? ` — ${args.detail}` : ''}`,
    outcome: 'objection',
    metadata: { objection: args.objection, detail: args.detail ?? null },
  });
  return { success: true, data: { objection: args.objection } };
}

// ─── Tool: send_payment_link ─────────────────────────────────────────────────

/**
 * Deja preparado el envío del enlace de pago.
 *
 * ⚠️ NO VERIFICADO en vivo: esta ronda no genera el enlace contra la pasarela
 * (no hay proveedor de pagos configurado en este entorno). Lo que sí ocurre y se
 * puede comprobar: queda una tarea para el vendedor y una actividad en el timeline.
 * El agente NUNCA pide datos de tarjeta por teléfono.
 */
export async function sendPaymentLink(
  ctx: ToolContext,
  args: { amount?: number; concept?: string }
): Promise<ToolResult> {
  const relatedId = ctx.opportunityId ?? ctx.customerId;
  if (!relatedId) return { success: false, error: 'Sin oportunidad ni cliente asociado' };

  const task = await createTask(ctx, {
    title: `Enviar enlace de pago${args.amount ? ` por ${args.amount}` : ''}`,
    description: `Solicitado por el cliente durante la llamada del agente IA. ${args.concept ?? ''}`.trim(),
    related_to_id: relatedId,
    related_to_type: ctx.opportunityId ? 'opportunity' : 'customer',
  });
  if (!task.success) return task;

  await logActivity(ctx, {
    relatedType: ctx.opportunityId ? 'opportunity' : 'customer',
    relatedId,
    notes: 'El cliente pidió el enlace de pago durante la llamada del agente IA.',
    outcome: 'payment_link_requested',
    metadata: { amount: args.amount ?? null, concept: args.concept ?? null },
  });

  return {
    success: true,
    data: { queued: true, task: task.data },
    say: 'Le enviamos el enlace de pago en unos minutos.',
  };
}

// ─── Tool: log_consent_opt_out ───────────────────────────────────────────────

/**
 * Baja voluntaria: el cliente pide no recibir más llamadas.
 * Escribe `contact_consents`, `customers.metadata.do_not_call` y la columna
 * `customers.do_not_call` en una sola operación atómica (RPC `fn_log_consent_opt_out`).
 */
export async function logConsentOptOut(
  ctx: ToolContext,
  args: { channel?: 'voice' | 'email' | 'whatsapp' | 'sms'; reason?: string }
): Promise<ToolResult> {
  if (!ctx.customerId) return { success: false, error: 'Sin cliente asociado' };
  const channel = args.channel ?? 'voice';

  const { data, error } = await ctx.supabase.rpc('fn_log_consent_opt_out', {
    p_org: ctx.orgId,
    p_customer: ctx.customerId,
    p_channel: channel,
    p_source: 'ai_voice_agent',
    p_evidence: {
      voice_agent_call_id: ctx.voiceAgentCallId ?? null,
      reason: args.reason ?? null,
      at: new Date().toISOString(),
    },
  });
  if (error) return { success: false, error: error.message };
  if (data !== true) return { success: false, error: 'Cliente no encontrado' };

  await logActivity(ctx, {
    relatedType: 'customer',
    relatedId: ctx.customerId,
    notes: `El cliente solicitó no recibir más comunicaciones por ${channel}. Registrado y respetado.`,
    outcome: 'opted_out',
    metadata: { channel, reason: args.reason ?? null },
  });

  return {
    success: true,
    data: { channel, opted_out: true },
    say: 'Entendido, no volveremos a llamarle. Queda registrado. Gracias por su tiempo.',
  };
}

// ─── Tool: transfer_to_human ─────────────────────────────────────────────────

export async function transferToHuman(ctx: ToolContext, args: { reason?: string }): Promise<ToolResult> {
  if (!ctx.voiceAgentCallId) return { success: false, error: 'No hay llamada en curso' };

  const { error } = await ctx.supabase
    .from('voice_agent_calls')
    .update({
      status: 'transferred',
      outcome: args.reason ? `transferred: ${args.reason}` : 'transferred_to_human',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.voiceAgentCallId)
    .eq('organization_id', ctx.orgId);
  if (error) return { success: false, error: error.message };

  const relatedId = ctx.opportunityId ?? ctx.customerId;
  if (relatedId) {
    await logActivity(ctx, {
      relatedType: ctx.opportunityId ? 'opportunity' : 'customer',
      relatedId,
      notes: `El agente IA transfirió la llamada a una persona. Motivo: ${args.reason ?? 'no indicado'}.`,
      outcome: 'transferred',
    });
  }
  return { success: true, data: { transferred: true }, say: 'Le paso con un asesor, un momento por favor.' };
}

// ─── Tool: end_call ──────────────────────────────────────────────────────────

export async function endCall(ctx: ToolContext, args: { outcome?: string }): Promise<ToolResult> {
  if (!ctx.voiceAgentCallId) return { success: false, error: 'No hay llamada en curso' };
  const { error } = await ctx.supabase
    .from('voice_agent_calls')
    .update({
      outcome: args.outcome ?? 'completed_by_agent',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.voiceAgentCallId)
    .eq('organization_id', ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { end: true } };
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  allowedTools: string[]
): Promise<ToolResult> {
  if (!allowedTools.includes(toolName)) {
    const denied: ToolResult = { success: false, error: `Herramienta no permitida: ${toolName}` };
    await recordToolRun(ctx, toolName, args, denied, 'denied');
    return denied;
  }

  let result: ToolResult;
  try {
    switch (toolName) {
      case 'get_customer_context':
        result = await getCustomerContext(ctx, (args.customer_id as string) || (ctx.customerId as string));
        break;
      case 'move_opportunity_stage':
        result = await moveOpportunityStage(
          ctx,
          (args.opportunity_id as string) || (ctx.opportunityId as string),
          args.stage_id as string
        );
        break;
      case 'update_opportunity_field':
        result = await updateOpportunityField(
          ctx,
          (args.opportunity_id as string) || (ctx.opportunityId as string),
          args.field as string,
          args.value
        );
        break;
      case 'create_task':
        result = await createTask(ctx, {
          title: args.title as string,
          description: args.description as string | undefined,
          due_date: args.due_date as string | undefined,
        });
        break;
      case 'book_meeting':
        result = await bookMeeting(ctx, args as never);
        break;
      case 'schedule_callback':
        result = await scheduleCallback(ctx, args as never);
        break;
      case 'log_objection':
        result = await logObjection(ctx, args as never);
        break;
      case 'send_payment_link':
        result = await sendPaymentLink(ctx, args as never);
        break;
      case 'log_consent_opt_out':
        result = await logConsentOptOut(ctx, args as never);
        break;
      case 'transfer_to_human':
        result = await transferToHuman(ctx, args as never);
        break;
      case 'end_call':
        result = await endCall(ctx, args as never);
        break;
      default:
        result = { success: false, error: `Herramienta desconocida: ${toolName}` };
    }
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  const status: 'applied' | 'suggested' | 'failed' = !result.success
    ? 'failed'
    : ctx.actionPolicy === 'suggest' && (result.data as { applied?: boolean })?.applied === false
      ? 'suggested'
      : 'applied';
  await recordToolRun(ctx, toolName, args, result, status);
  return result;
}
