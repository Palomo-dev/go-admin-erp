/**
 * Stage Agent Service — FASE 6 · configuración del agente IA POR ETAPA del embudo.
 *
 * Petición literal del dueño: para cada etapa, decidir qué hace el agente al llamar
 * (vender un producto concreto, agendar una reunión, calificar al contacto,
 * recuperar un carrito, u otras acciones).
 *
 * Tabla: `stage_agents` (organization_id + RLS org_member con 4 políticas reales).
 * La configuración NO se queda guardada: `resolveStageAgentContext()` la lleva al
 * runtime de la llamada (prompt del agente, herramientas permitidas y política de
 * acciones), y el despachador la enlaza en `voice_agent_calls.stage_agent_id`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const STAGE_AGENT_OBJECTIVES = [
  'sell_product',
  'book_meeting',
  'qualify_lead',
  'recover_cart',
  'confirm_demo',
  'follow_up_proposal',
  'collect_payment',
  'reactivate_cold',
  'nps_survey',
  'renewal_reminder',
  'custom',
] as const;
export type StageAgentObjective = (typeof STAGE_AGENT_OBJECTIVES)[number];

export const STAGE_AGENT_CHANNELS = ['voice', 'email', 'whatsapp', 'multi'] as const;
export type StageAgentChannel = (typeof STAGE_AGENT_CHANNELS)[number];

export const STAGE_AGENT_TRIGGERS = ['enter', 'sla_breach', 'no_response_days', 'manual'] as const;
export type StageAgentTrigger = (typeof STAGE_AGENT_TRIGGERS)[number];

export type StageAgentActionPolicy = 'auto' | 'suggest';

/** Etiquetas en español para la UI (una sola fuente de verdad). */
export const OBJECTIVE_LABELS: Record<StageAgentObjective, string> = {
  sell_product: 'Vender un producto',
  book_meeting: 'Agendar una reunión',
  qualify_lead: 'Calificar al contacto',
  recover_cart: 'Recuperar un carrito abandonado',
  confirm_demo: 'Confirmar la demostración',
  follow_up_proposal: 'Dar seguimiento a la propuesta',
  collect_payment: 'Gestionar el cobro',
  reactivate_cold: 'Reactivar un contacto frío',
  nps_survey: 'Encuesta de satisfacción',
  renewal_reminder: 'Recordar la renovación',
  custom: 'Otra acción (la describo yo)',
};

/** Guion base por objetivo: es lo que de verdad cambia el comportamiento de la llamada. */
export const OBJECTIVE_PLAYBOOKS: Record<StageAgentObjective, string> = {
  sell_product:
    'Tu objetivo es vender el producto indicado. Presenta el beneficio principal en una frase, ' +
    'pregunta si le interesa, resuelve una objeción y cierra pidiendo la compra o el envío del enlace de pago.',
  book_meeting:
    'Tu objetivo es agendar una reunión. Propón dos franjas concretas, confirma la fecha y hora exactas ' +
    'y usa la herramienta book_meeting para dejarla registrada antes de despedirte.',
  qualify_lead:
    'Tu objetivo es calificar al contacto: necesidad, presupuesto aproximado, plazo y si decide la compra. ' +
    'Registra lo que averigües con update_opportunity_field y no intentes vender todavía.',
  recover_cart:
    'Tu objetivo es recuperar una compra que quedó a medias. Recuerda con naturalidad lo que dejó pendiente, ' +
    'pregunta qué le detuvo, registra la objeción y ofrece completar la compra o enviar el enlace de pago.',
  confirm_demo:
    'Tu objetivo es confirmar la asistencia a la demostración ya agendada. Si no puede, reagenda con book_meeting.',
  follow_up_proposal:
    'Tu objetivo es saber en qué quedó la propuesta enviada: si la revisaron, qué dudas hay y cuál es el siguiente paso.',
  collect_payment:
    'Tu objetivo es gestionar un pago pendiente. Sé respetuoso, confirma el importe y ofrece el enlace de pago. ' +
    'Nunca pidas datos de tarjeta ni credenciales por teléfono.',
  reactivate_cold:
    'Tu objetivo es reactivar un contacto frío. Pregunta si el proyecto sigue vivo y agenda un siguiente paso si lo está.',
  nps_survey:
    'Tu objetivo es una encuesta breve: pide una nota del 0 al 10 y una razón. No vendas nada.',
  renewal_reminder:
    'Tu objetivo es recordar la renovación próxima, confirmar si continúa y resolver dudas de facturación.',
  custom: 'Sigue exactamente las instrucciones del guion de esta etapa.',
};

export interface StageAgent {
  id: string;
  organization_id: number;
  stage_id: string;
  voice_agent_id: string | null;
  channel: StageAgentChannel;
  objective: StageAgentObjective;
  objective_prompt: string | null;
  product_id: number | null;
  offer: Record<string, unknown>;
  trigger_on: StageAgentTrigger;
  trigger_config: Record<string, unknown>;
  allowed_tools: string[];
  action_policy: StageAgentActionPolicy;
  max_attempts: number;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StageAgentInput {
  stage_id: string;
  voice_agent_id?: string | null;
  channel?: StageAgentChannel;
  objective: StageAgentObjective;
  objective_prompt?: string | null;
  product_id?: number | null;
  offer?: Record<string, unknown>;
  trigger_on?: StageAgentTrigger;
  trigger_config?: Record<string, unknown>;
  allowed_tools?: string[];
  action_policy?: StageAgentActionPolicy;
  max_attempts?: number;
  config?: Record<string, unknown>;
  is_active?: boolean;
}

export class StageAgentError extends Error {
  readonly code: string | undefined;
  constructor(context: string, error: { message: string; code?: string }) {
    super(`[${context}] ${error.message}${error.code ? ` (${error.code})` : ''}`);
    this.name = 'StageAgentError';
    this.code = error.code;
  }
}

function unwrap<T>(context: string, res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new StageAgentError(context, res.error);
  return res.data;
}

/** Valida que la etapa pertenece a la organización (stages no tiene organization_id). */
export async function stageBelongsToOrg(
  supabase: SupabaseClient,
  orgId: number,
  stageId: string
): Promise<boolean> {
  const data = unwrap(
    'stageBelongsToOrg',
    await supabase
      .from('stages')
      .select('id, pipelines:pipeline_id(organization_id)')
      .eq('id', stageId)
      .maybeSingle()
  ) as { id: string; pipelines?: { organization_id: number } | null } | null;
  return !!data && data.pipelines?.organization_id === orgId;
}

export async function getStageAgent(
  supabase: SupabaseClient,
  orgId: number,
  stageId: string,
  channel: StageAgentChannel = 'voice'
): Promise<StageAgent | null> {
  const data = unwrap(
    'getStageAgent',
    await supabase
      .from('stage_agents')
      .select('*')
      .eq('organization_id', orgId)
      .eq('stage_id', stageId)
      .eq('channel', channel)
      .maybeSingle()
  );
  return (data as StageAgent) || null;
}

export async function listStageAgents(
  supabase: SupabaseClient,
  orgId: number,
  pipelineId?: string
): Promise<StageAgent[]> {
  let query = supabase.from('stage_agents').select('*').eq('organization_id', orgId);
  if (pipelineId) {
    const stages = unwrap(
      'listStageAgents.stages',
      await supabase.from('stages').select('id').eq('pipeline_id', pipelineId)
    ) as Array<{ id: string }> | null;
    const ids = (stages || []).map((s) => s.id);
    if (ids.length === 0) return [];
    query = query.in('stage_id', ids);
  }
  const data = unwrap('listStageAgents', await query);
  return (data || []) as StageAgent[];
}

/** Alta o actualización de la configuración de una etapa (una por etapa y canal). */
export async function upsertStageAgent(
  supabase: SupabaseClient,
  orgId: number,
  input: StageAgentInput,
  createdBy?: string | null
): Promise<StageAgent> {
  if (!STAGE_AGENT_OBJECTIVES.includes(input.objective)) {
    throw new Error(`Objetivo inválido: ${input.objective}`);
  }
  const channel = input.channel ?? 'voice';
  if (!STAGE_AGENT_CHANNELS.includes(channel)) {
    throw new Error(`Canal inválido: ${channel}`);
  }
  if (input.objective === 'sell_product' && !input.product_id) {
    throw new Error('Para «Vender un producto» hay que elegir el producto');
  }
  if (input.objective === 'custom' && !input.objective_prompt?.trim()) {
    throw new Error('Para «Otra acción» hay que describir qué debe hacer el agente');
  }
  if (!(await stageBelongsToOrg(supabase, orgId, input.stage_id))) {
    throw new Error('La etapa no pertenece a esta organización');
  }

  const row: Record<string, unknown> = {
    organization_id: orgId,
    stage_id: input.stage_id,
    channel,
    objective: input.objective,
    voice_agent_id: input.voice_agent_id ?? null,
    objective_prompt: input.objective_prompt?.trim() || null,
    product_id: input.product_id ?? null,
    offer: input.offer ?? {},
    trigger_on: input.trigger_on ?? 'manual',
    trigger_config: input.trigger_config ?? {},
    allowed_tools: input.allowed_tools ?? defaultToolsForObjective(input.objective),
    action_policy: input.action_policy ?? 'suggest',
    max_attempts: input.max_attempts ?? 2,
    config: input.config ?? {},
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (createdBy) row.created_by = createdBy;

  const data = unwrap(
    'upsertStageAgent',
    await supabase
      .from('stage_agents')
      .upsert(row, { onConflict: 'stage_id,channel' })
      .select('*')
      .single()
  );
  return data as StageAgent;
}

export async function deleteStageAgent(
  supabase: SupabaseClient,
  orgId: number,
  id: string
): Promise<void> {
  unwrap(
    'deleteStageAgent',
    await supabase.from('stage_agents').delete().eq('id', id).eq('organization_id', orgId)
  );
}

/** Herramientas razonables por objetivo (el dueño puede ajustarlas). */
export function defaultToolsForObjective(objective: StageAgentObjective): string[] {
  const base = ['get_customer_context', 'log_consent_opt_out', 'end_call', 'transfer_to_human'];
  switch (objective) {
    case 'sell_product':
      return [...base, 'send_payment_link', 'log_objection', 'update_opportunity_field', 'move_opportunity_stage'];
    case 'recover_cart':
      return [...base, 'send_payment_link', 'log_objection', 'schedule_callback'];
    case 'book_meeting':
    case 'confirm_demo':
      return [...base, 'book_meeting', 'schedule_callback'];
    case 'qualify_lead':
      return [...base, 'update_opportunity_field', 'log_objection', 'create_task'];
    case 'collect_payment':
      return [...base, 'send_payment_link', 'schedule_callback'];
    default:
      return [...base, 'create_task', 'schedule_callback'];
  }
}

// ─── Puente entre la configuración y el comportamiento real de la llamada ───

export interface StageAgentContext {
  stageAgentId: string;
  stageName: string | null;
  objective: StageAgentObjective;
  objectiveLabel: string;
  playbook: string;
  objectivePrompt: string | null;
  productName: string | null;
  productPrice: number | null;
  offer: Record<string, unknown>;
  allowedTools: string[];
  actionPolicy: StageAgentActionPolicy;
}

/**
 * Resuelve la configuración de etapa que debe gobernar ESTA llamada.
 * Se usa desde el runtime del agente (`agentRuntime.buildRuntimeConfig`).
 */
export async function resolveStageAgentContext(
  supabase: SupabaseClient,
  orgId: number,
  opts: { stageAgentId?: string | null; opportunityId?: string | null }
): Promise<StageAgentContext | null> {
  let stageAgent: StageAgent | null = null;

  if (opts.stageAgentId) {
    stageAgent = unwrap(
      'resolveStageAgentContext.byId',
      await supabase
        .from('stage_agents')
        .select('*')
        .eq('id', opts.stageAgentId)
        .eq('organization_id', orgId)
        .maybeSingle()
    ) as StageAgent | null;
  }

  let stageId: string | null = stageAgent?.stage_id ?? null;

  if (!stageAgent && opts.opportunityId) {
    const opp = unwrap(
      'resolveStageAgentContext.opportunity',
      await supabase
        .from('opportunities')
        .select('stage_id')
        .eq('id', opts.opportunityId)
        .eq('organization_id', orgId)
        .maybeSingle()
    ) as { stage_id: string } | null;
    if (!opp?.stage_id) return null;
    stageId = opp.stage_id;
    stageAgent = await getStageAgent(supabase, orgId, opp.stage_id, 'voice');
  }

  if (!stageAgent || !stageAgent.is_active) return null;

  let stageName: string | null = null;
  if (stageId) {
    const st = unwrap(
      'resolveStageAgentContext.stage',
      await supabase.from('stages').select('name').eq('id', stageId).maybeSingle()
    ) as { name: string } | null;
    stageName = st?.name ?? null;
  }

  let productName: string | null = null;
  // `products` no tiene columna de precio (verificado 2026-09-09): el precio del guion
  // lo escribe el dueño en `stage_agents.offer.price`.
  const offer = (stageAgent.offer || {}) as { price?: number | string };
  const productPrice = offer.price != null ? Number(offer.price) : null;
  if (stageAgent.product_id) {
    const prod = unwrap(
      'resolveStageAgentContext.product',
      await supabase
        .from('products')
        .select('name, sku, description')
        .eq('id', stageAgent.product_id)
        .eq('organization_id', orgId)
        .maybeSingle()
    ) as { name: string } | null;
    productName = prod?.name ?? null;
  }

  return {
    stageAgentId: stageAgent.id,
    stageName,
    objective: stageAgent.objective,
    objectiveLabel: OBJECTIVE_LABELS[stageAgent.objective],
    playbook: OBJECTIVE_PLAYBOOKS[stageAgent.objective],
    objectivePrompt: stageAgent.objective_prompt,
    productName,
    productPrice: Number.isFinite(productPrice as number) ? (productPrice as number) : null,
    offer: (stageAgent.offer || {}) as Record<string, unknown>,
    allowedTools: stageAgent.allowed_tools || [],
    actionPolicy: stageAgent.action_policy,
  };
}
