/**
 * Voice Agent Service — FASE 6: Agente IA de voz
 * GO Admin ERP
 *
 * Gestiona agentes de voz, campañas y llamadas del agente.
 * El despachador (runCampaignQueue) respeta schedule, max_concurrent,
 * max_calls_per_day, saldo de créditos, horario local del cliente y
 * do_not_call list.
 *
 * Tablas: voice_agents, voice_agent_campaigns, voice_agent_calls, calls
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import {
  getMasterClient,
  getMasterPhoneNumber,
  formatE164,
  getWebhookBaseUrl,
} from '@/lib/services/integrations/twilio/twilioConfig';

// ─── Tipos: Voice Agents ─────────────────────────────────────────────────────

export type VoiceAgentEngine =
  | 'conversation_relay'
  | 'elevenlabs_agent'
  | 'openai_realtime'
  | 'gemini_live';

export type PurposeType =
  | 'confirm_demo'
  | 'reactivate_cold'
  | 'collect_payment'
  | 'qualify_lead'
  | 'follow_up'
  | 'survey'
  | 'custom';

export interface VoiceAgent {
  id: string;
  organization_id: number;
  name: string;
  slug: string;
  description: string | null;
  engine: VoiceAgentEngine;
  purpose_type: PurposeType;
  system_prompt: string | null;
  first_message: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  voice_settings: Record<string, unknown> | null;
  language: string;
  stt_provider: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  temperature: number;
  max_turns: number;
  max_duration_seconds: number;
  allowed_tools: string[];
  guardrails: Record<string, unknown> | null;
  transfer_to_human_rules: Record<string, unknown> | null;
  business_hours: Record<string, unknown> | null;
  retry_policy: Record<string, unknown> | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentInput {
  name: string;
  slug?: string;
  description?: string;
  engine?: VoiceAgentEngine;
  purpose_type?: PurposeType;
  system_prompt?: string;
  first_message?: string;
  voice_provider?: string;
  voice_id?: string;
  voice_settings?: Record<string, unknown>;
  language?: string;
  stt_provider?: string;
  llm_provider?: string;
  llm_model?: string;
  temperature?: number;
  max_turns?: number;
  max_duration_seconds?: number;
  allowed_tools?: string[];
  guardrails?: Record<string, unknown>;
  transfer_to_human_rules?: Record<string, unknown>;
  business_hours?: Record<string, unknown>;
  retry_policy?: Record<string, unknown>;
  is_active?: boolean;
}

export interface VoiceAgentUpdateInput extends Partial<VoiceAgentInput> {}

// ─── Tipos: Campaigns ────────────────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed';

export interface VoiceAgentCampaign {
  id: string;
  organization_id: number;
  voice_agent_id: string;
  name: string;
  objective: string | null;
  target_source: string;
  target_config: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  max_calls_per_day: number;
  max_concurrent: number;
  status: CampaignStatus;
  stats: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  voice_agents?: { id: string; name: string } | null;
}

export interface CampaignInput {
  voice_agent_id: string;
  name: string;
  objective?: string;
  target_source?: string;
  target_config?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  max_calls_per_day?: number;
  max_concurrent?: number;
  status?: CampaignStatus;
}

export interface CampaignUpdateInput extends Partial<CampaignInput> {}

// ─── Tipos: Voice Agent Calls ────────────────────────────────────────────────

export type VoiceAgentCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'transferred';

export interface VoiceAgentCall {
  id: string;
  organization_id: number;
  voice_agent_id: string;
  campaign_id: string | null;
  call_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  status: VoiceAgentCallStatus;
  outcome: string | null;
  conversation_log: Record<string, unknown> | null;
  turns_count: number;
  duration_seconds: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  voice_agents?: { id: string; name: string } | null;
  customers?: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface VoiceAgentCallFilters {
  voice_agent_id?: string;
  campaign_id?: string;
  status?: VoiceAgentCallStatus;
  customer_id?: string;
  limit?: number;
  offset?: number;
}

// ─── Voice Agents CRUD ───────────────────────────────────────────────────────

export async function getVoiceAgents(
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgent[]> {
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('voiceAgentService.getVoiceAgents - error:', error.message);
    return [];
  }

  return (data || []) as VoiceAgent[];
}

export async function getVoiceAgent(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgent | null> {
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('voiceAgentService.getVoiceAgent - error:', error.message);
    return null;
  }

  return (data as VoiceAgent) || null;
}

export async function createVoiceAgent(
  orgId: number,
  data: VoiceAgentInput,
  supabase: SupabaseClient
): Promise<VoiceAgent | null> {
  const slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-').substring(0, 60);

  const { data: result, error } = await supabase
    .from('voice_agents')
    .insert({
      organization_id: orgId,
      name: data.name,
      slug,
      description: data.description ?? null,
      engine: data.engine ?? 'conversation_relay',
      purpose_type: data.purpose_type ?? 'custom',
      system_prompt: data.system_prompt ?? null,
      first_message: data.first_message ?? null,
      voice_provider: data.voice_provider ?? null,
      voice_id: data.voice_id ?? null,
      voice_settings: data.voice_settings ?? null,
      language: data.language ?? 'es-CO',
      stt_provider: data.stt_provider ?? null,
      llm_provider: data.llm_provider ?? null,
      llm_model: data.llm_model ?? null,
      temperature: data.temperature ?? 0.7,
      max_turns: data.max_turns ?? 20,
      max_duration_seconds: data.max_duration_seconds ?? 300,
      allowed_tools: data.allowed_tools ?? [],
      guardrails: data.guardrails ?? null,
      transfer_to_human_rules: data.transfer_to_human_rules ?? null,
      business_hours: data.business_hours ?? null,
      retry_policy: data.retry_policy ?? null,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return result as VoiceAgent;
}

export async function updateVoiceAgent(
  id: string,
  orgId: number,
  data: VoiceAgentUpdateInput,
  supabase: SupabaseClient
): Promise<VoiceAgent | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const fields: (keyof VoiceAgentInput)[] = [
    'name', 'slug', 'description', 'engine', 'purpose_type',
    'system_prompt', 'first_message', 'voice_provider', 'voice_id',
    'voice_settings', 'language', 'stt_provider', 'llm_provider',
    'llm_model', 'temperature', 'max_turns', 'max_duration_seconds',
    'allowed_tools', 'guardrails', 'transfer_to_human_rules',
    'business_hours', 'retry_policy', 'is_active',
  ];

  for (const field of fields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  const { data: result, error } = await supabase
    .from('voice_agents')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return (result as VoiceAgent) || null;
}

export async function deleteVoiceAgent(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('voice_agents')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Campaigns CRUD ──────────────────────────────────────────────────────────

export async function getVoiceAgentCampaigns(
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign[]> {
  const { data, error } = await supabase
    .from('voice_agent_campaigns')
    .select(`
      *,
      voice_agents:voice_agent_id(id, name)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('voiceAgentService.getVoiceAgentCampaigns - error:', error.message);
    return [];
  }

  return (data || []) as VoiceAgentCampaign[];
}

export async function createCampaign(
  orgId: number,
  data: CampaignInput,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign | null> {
  const { data: result, error } = await supabase
    .from('voice_agent_campaigns')
    .insert({
      organization_id: orgId,
      voice_agent_id: data.voice_agent_id,
      name: data.name,
      objective: data.objective ?? null,
      target_source: data.target_source ?? 'manual',
      target_config: data.target_config ?? null,
      schedule: data.schedule ?? null,
      max_calls_per_day: data.max_calls_per_day ?? 50,
      max_concurrent: data.max_concurrent ?? 3,
      status: data.status ?? 'draft',
      stats: {},
    })
    .select()
    .single();

  if (error) throw error;
  return result as VoiceAgentCampaign;
}

export async function updateCampaign(
  id: string,
  orgId: number,
  data: CampaignUpdateInput,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const fields: (keyof CampaignInput)[] = [
    'voice_agent_id', 'name', 'objective', 'target_source',
    'target_config', 'schedule', 'max_calls_per_day',
    'max_concurrent', 'status',
  ];

  for (const field of fields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  const { data: result, error } = await supabase
    .from('voice_agent_campaigns')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return (result as VoiceAgentCampaign) || null;
}

export async function deleteCampaign(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('voice_agent_campaigns')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

// ─── Voice Agent Calls ───────────────────────────────────────────────────────

export async function getVoiceAgentCalls(
  orgId: number,
  supabase: SupabaseClient,
  filters?: VoiceAgentCallFilters
): Promise<VoiceAgentCall[]> {
  let query = supabase
    .from('voice_agent_calls')
    .select(`
      *,
      voice_agents:voice_agent_id(id, name),
      customers:customer_id(id, first_name, last_name)
    `)
    .eq('organization_id', orgId);

  if (filters?.voice_agent_id) {
    query = query.eq('voice_agent_id', filters.voice_agent_id);
  }
  if (filters?.campaign_id) {
    query = query.eq('campaign_id', filters.campaign_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.customer_id) {
    query = query.eq('customer_id', filters.customer_id);
  }

  query = query.order('created_at', { ascending: false });

  if (filters?.limit) {
    query = query.limit(filters.limit);
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + filters.limit - 1);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.warn('voiceAgentService.getVoiceAgentCalls - error:', error.message);
    return [];
  }

  return (data || []) as VoiceAgentCall[];
}

// ─── Despachador (runCampaignQueue) ──────────────────────────────────────────

interface ScheduleConfig {
  days?: number[]; // 0=domingo, 6=sabado
  start_hour?: number;
  end_hour?: number;
  timezone?: string;
}

/**
 * Verifica si la hora actual está dentro del horario permitido.
 */
function isWithinSchedule(schedule: ScheduleConfig | null, timezone?: string): boolean {
  if (!schedule || schedule.start_hour === undefined || schedule.end_hour === undefined) {
    return true; // Sin schedule = siempre permitido
  }

  const now = new Date();
  let hour: number;
  let day: number;

  if (timezone) {
    try {
      const localStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: false });
      const localDate = new Date(localStr);
      hour = localDate.getHours();
      day = localDate.getDay();
    } catch {
      hour = now.getHours();
      day = now.getDay();
    }
  } else {
    hour = now.getHours();
    day = now.getDay();
  }

  // Verificar día
  if (schedule.days && schedule.days.length > 0) {
    if (!schedule.days.includes(day)) return false;
  }

  // Verificar hora
  if (hour < schedule.start_hour || hour >= schedule.end_hour) {
    return false;
  }

  return true;
}

/**
 * Verifica si un cliente está en la do_not_call list.
 */
async function isDoNotCall(
  supabase: SupabaseClient,
  orgId: number,
  customerId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('do_not_call_list')
    .select('id')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .maybeSingle();

  return !!data;
}

/**
 * Verifica el saldo de créditos de IA de la organización.
 */
async function hasAICredits(
  supabase: SupabaseClient,
  orgId: number
): Promise<boolean> {
  const { data } = await supabase
    .from('ai_settings')
    .select('credits_remaining')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!data) return true; // Si no hay config, permitir
  return (data as { credits_remaining: number }).credits_remaining > 0;
}

/**
 * Verifica el horario local del cliente.
 */
function isWithinCustomerHours(timezone?: string): boolean {
  if (!timezone) return true;

  const now = new Date();
  try {
    const localStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: false });
    const localDate = new Date(localStr);
    const hour = localDate.getHours();
    const day = localDate.getDay();

    // Lunes a sábado, 8am a 8pm por defecto
    if (day === 0) return false; // Domingo
    return hour >= 8 && hour < 20;
  } catch {
    return true;
  }
}

/**
 * Obtiene el cliente con su teléfono y timezone.
 */
interface CustomerTarget {
  customer_id: string;
  phone: string;
  timezone: string | null;
  opportunity_id: string | null;
}

/**
 * Construye la lista de targets según el target_source y target_config.
 */
async function buildCampaignTargets(
  supabase: SupabaseClient,
  orgId: number,
  campaign: VoiceAgentCampaign
): Promise<CustomerTarget[]> {
  const config = campaign.target_config || {};
  const targets: CustomerTarget[] = [];

  if (campaign.target_source === 'pipeline_stage') {
    // Clientes con oportunidades en una etapa específica
    const stageId = (config as { stage_id?: string }).stage_id;
    if (!stageId) return [];

    const { data: opps } = await supabase
      .from('opportunities')
      .select('id, customer_id, customers:customer_id(id, phone, timezone)')
      .eq('organization_id', orgId)
      .eq('stage_id', stageId);

    if (!opps) return [];

    for (const opp of opps as Array<Record<string, unknown>>) {
      const customer = opp.customers as { id: string; phone: string; timezone: string | null } | null;
      if (customer && customer.phone) {
        targets.push({
          customer_id: customer.id,
          phone: customer.phone,
          timezone: customer.timezone,
          opportunity_id: (opp.id as string) || null,
        });
      }
    }
  } else if (campaign.target_source === 'customer_list') {
    // Lista manual de customer_ids
    const customerIds = (config as { customer_ids?: string[] }).customer_ids;
    if (!customerIds || customerIds.length === 0) return [];

    const { data: customers } = await supabase
      .from('customers')
      .select('id, phone, timezone')
      .in('id', customerIds)
      .eq('organization_id', orgId)
      .not('phone', 'is', null);

    if (!customers) return [];

    for (const c of customers as Array<{ id: string; phone: string; timezone: string | null }>) {
      targets.push({
        customer_id: c.id,
        phone: c.phone,
        timezone: c.timezone,
        opportunity_id: null,
      });
    }
  }

  return targets;
}

/**
 * Procesa la cola de llamadas de campañas activas.
 * Para cada campaña en estado 'running':
 * - Respeta schedule, max_concurrent, max_calls_per_day
 * - Respeta saldo de créditos
 * - Respeta horario local del cliente
 * - Respeta do_not_call list
 */
export async function runCampaignQueue(
  orgId: number,
  supabase: SupabaseClient
): Promise<{
  campaigns_processed: number;
  calls_initiated: number;
  calls_skipped: number;
  errors: string[];
}> {
  const result = {
    campaigns_processed: 0,
    calls_initiated: 0,
    calls_skipped: 0,
    errors: [] as string[],
  };

  // 1. Obtener campañas activas (running)
  const { data: campaigns } = await supabase
    .from('voice_agent_campaigns')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'running');

  if (!campaigns || campaigns.length === 0) {
    return result;
  }

  // 2. Verificar saldo de créditos
  const hasCredits = await hasAICredits(supabase, orgId);
  if (!hasCredits) {
    result.errors.push('Sin créditos de IA disponibles');
    return result;
  }

  const { client: twilioClient, fromNumber } = await getTwilioClientForOrg(orgId, supabase);
  const webhookBase = getWebhookBaseUrl();

  for (const campaignRow of campaigns as VoiceAgentCampaign[]) {
    result.campaigns_processed++;

    const schedule = (campaignRow.schedule as ScheduleConfig | null) ?? null;

    // 3. Verificar schedule de la campaña
    if (!isWithinSchedule(schedule, schedule?.timezone)) {
      continue;
    }

    // 4. Contar llamadas en progreso y hechas hoy
    const today = new Date().toISOString().split('T')[0];
    const { count: inProgress } = await supabase
      .from('voice_agent_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignRow.id)
      .eq('status', 'in_progress');

    const { count: callsToday } = await supabase
      .from('voice_agent_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignRow.id)
      .in('status', ['completed', 'in_progress', 'transferred'])
      .gte('created_at', today);

    const maxConcurrent = campaignRow.max_concurrent || 3;
    const maxPerDay = campaignRow.max_calls_per_day || 50;

    if ((inProgress ?? 0) >= maxConcurrent) continue;
    if ((callsToday ?? 0) >= maxPerDay) continue;

    // 5. Obtener llamadas pendientes en cola
    const slotsAvailable = maxConcurrent - (inProgress ?? 0);
    const { data: queued } = await supabase
      .from('voice_agent_calls')
      .select('*')
      .eq('campaign_id', campaignRow.id)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(slotsAvailable);

    if (!queued || queued.length === 0) {
      // Si no hay llamadas en cola pero la campaña tiene targets, encolar más
      const targets = await buildCampaignTargets(supabase, orgId, campaignRow);
      for (const target of targets) {
        // Verificar do_not_call
        if (await isDoNotCall(supabase, orgId, target.customer_id)) {
          continue;
        }

        // Verificar que no haya ya una llamada pendiente para este cliente
        const { data: existing } = await supabase
          .from('voice_agent_calls')
          .select('id')
          .eq('campaign_id', campaignRow.id)
          .eq('customer_id', target.customer_id)
          .in('status', ['pending', 'in_progress'])
          .maybeSingle();

        if (existing) continue;

        // Crear llamada pendiente
        await supabase.from('voice_agent_calls').insert({
          organization_id: orgId,
          voice_agent_id: campaignRow.voice_agent_id,
          campaign_id: campaignRow.id,
          customer_id: target.customer_id,
          opportunity_id: target.opportunity_id,
          status: 'pending',
          scheduled_at: new Date().toISOString(),
        });
      }

      // Volver a leer la cola
      const { data: newQueued } = await supabase
        .from('voice_agent_calls')
        .select('*')
        .eq('campaign_id', campaignRow.id)
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(slotsAvailable);

      if (!newQueued || newQueued.length === 0) continue;

      (queued as VoiceAgentCall[]).push(...(newQueued as VoiceAgentCall[]));
    }

    // 6. Procesar cada llamada en cola
    for (const vacRow of queued as VoiceAgentCall[]) {
      // Verificar créditos
      if (!await hasAICredits(supabase, orgId)) {
        result.errors.push('Créditos agotados durante el procesamiento');
        break;
      }

      // Obtener info del cliente
      const { data: customer } = await supabase
        .from('customers')
        .select('phone, timezone, do_not_call')
        .eq('id', vacRow.customer_id)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!customer) {
        result.calls_skipped++;
        await supabase
          .from('voice_agent_calls')
          .update({
            status: 'failed',
            error_message: 'Cliente no encontrado',
            updated_at: new Date().toISOString(),
          })
          .eq('id', vacRow.id);
        continue;
      }

      const c = customer as { phone: string; timezone: string | null; do_not_call?: boolean };

      // Verificar do_not_call
      if (c.do_not_call || (vacRow.customer_id && await isDoNotCall(supabase, orgId, vacRow.customer_id))) {
        result.calls_skipped++;
        await supabase
          .from('voice_agent_calls')
          .update({
            status: 'failed',
            error_message: 'Cliente en do_not_call list',
            updated_at: new Date().toISOString(),
          })
          .eq('id', vacRow.id);
        continue;
      }

      // Verificar horario local del cliente
      if (!isWithinCustomerHours(c.timezone ?? undefined)) {
        result.calls_skipped++;
        continue;
      }

      if (!c.phone) {
        result.calls_skipped++;
        await supabase
          .from('voice_agent_calls')
          .update({
            status: 'failed',
            error_message: 'Cliente sin teléfono',
            updated_at: new Date().toISOString(),
          })
          .eq('id', vacRow.id);
        continue;
      }

      // 7. Iniciar llamada saliente
      try {
        const formattedPhone = formatE164(c.phone);
        const agentTwimlUrl = `${webhookBase}/api/voice/twiml/ai-agent?agentId=${campaignRow.voice_agent_id}&callId=${vacRow.id}`;

        const call = await twilioClient.calls.create({
          to: formattedPhone,
          from: fromNumber,
          url: agentTwimlUrl,
          statusCallback: `${webhookBase}/api/voice/bridge/status?leg=ai_agent&callId=${vacRow.id}`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          timeout: 30,
          machineDetection: 'Enable',
        });

        // Actualizar voice_agent_calls
        await supabase
          .from('voice_agent_calls')
          .update({
            status: 'in_progress',
            call_id: call.sid,
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', vacRow.id);

        // Crear registro en calls
        await supabase.from('calls').insert({
          organization_id: orgId,
          customer_id: vacRow.customer_id,
          opportunity_id: vacRow.opportunity_id,
          provider_call_sid: call.sid,
          direction: 'outbound',
          status: 'dialing',
          bridge_mode: 'full_bridge',
          duration_source: 'provider',
          phone_number: formattedPhone,
        });

        result.calls_initiated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        result.errors.push(`Llamada ${vacRow.id}: ${message}`);
        result.calls_skipped++;

        await supabase
          .from('voice_agent_calls')
          .update({
            status: 'failed',
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', vacRow.id);
      }
    }
  }

  return result;
}

// ─── Helper: Twilio client ───────────────────────────────────────────────────

async function getTwilioClientForOrg(
  orgId: number,
  supabase: SupabaseClient
): Promise<{ client: ReturnType<typeof getMasterClient>; fromNumber: string }> {
  const provider = await getActiveProvider(orgId, 'voice', supabase);

  if (
    provider.credentials.TWILIO_SUBACCOUNT_SID &&
    provider.credentials.TWILIO_SUBACCOUNT_AUTH_TOKEN
  ) {
    const Twilio = (await import('twilio')).default;
    const client = Twilio(
      provider.credentials.TWILIO_SUBACCOUNT_SID,
      provider.credentials.TWILIO_SUBACCOUNT_AUTH_TOKEN
    );
    const fromNumber =
      provider.credentials.TWILIO_PHONE_NUMBER || getMasterPhoneNumber();
    return { client, fromNumber };
  }

  const client = getMasterClient();
  const fromNumber =
    (provider.credentials.TWILIO_PHONE_NUMBER as string) ||
    getMasterPhoneNumber();
  return { client, fromNumber };
}
