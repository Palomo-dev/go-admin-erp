/**
 * Voice Agent Service — FASE 6: Agente IA de voz
 * GO Admin ERP
 *
 * Gestiona agentes de voz, campañas y el despachador de llamadas.
 *
 * Reglas duras del despachador (ronda 1, tras TEST-F6-r1):
 *  - C-F6-01: la baja voluntaria se comprueba SIEMPRE con `fn_can_contact(...,'voice')`,
 *    que lee la columna real `customers.do_not_call`, el flag histórico
 *    `metadata->>'do_not_call'` y `contact_consents`. Fail-closed.
 *  - A-F6-22: NINGUNA lectura descarta `error`. Un 42703/42P01/RLS se propaga con su
 *    mensaje real; nunca se convierte en «Cliente no encontrado».
 *  - C-F6-06 / F-NEW-2 (ronda 2): el tope diario cuenta TODO intento REAL. Se cuenta
 *    sobre `voice_agent_call_attempts` (una fila inmutable por reserva), NO sobre
 *    `voice_agent_calls.claimed_at`: el reintento y el rechazo por franja horaria
 *    ponían esa marca a NULL y borraban el intento del conteo (3 filas producían 15
 *    marcaciones contadas como 3). Segunda barrera independiente: tope por hora +
 *    parada de emergencia de la campaña. El «día» es el de la organización, no UTC.
 *  - F-NEW-5 (ronda 2): el despacho puntual (`dispatchAgentCall`) pasa por LAS MISMAS
 *    barreras que la campaña: agente habilitado, canal habilitado en la organización,
 *    franja horaria, tope diario/horario, concurrencia y deduplicación por cliente.
 *  - C-F6-07: la fila se reserva con `fn_claim_voice_agent_calls` (FOR UPDATE SKIP LOCKED)
 *    ANTES de marcar.
 *  - C-F6-08: se reserva crédito de voz ANTES de llamar al proveedor y se reembolsa si falla.
 *  - C-F6-03/04: se inserta primero en `calls` (columnas y NOT NULL reales) y
 *    `voice_agent_calls.call_id` recibe el UUID de esa fila; el CallSid va en
 *    `voice_agent_calls.provider_call_sid`.
 *  - C-F6-09: la llamada graba en dual channel y el TwiML anuncia el consentimiento.
 *
 * Tablas: voice_agents, voice_agent_campaigns, voice_agent_calls, calls, stage_agents
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import {
  getMasterClient,
  getMasterPhoneNumber,
  formatE164,
  getWebhookBaseUrl,
} from '@/lib/services/integrations/twilio/twilioConfig';
import {
  VOICE_AGENT_PURPOSES,
  type VoiceAgentPurpose,
  type VoiceAgentEngine as EnumVoiceAgentEngine,
} from '@/lib/crm/enums';

// ─── Tipos: Voice Agents ─────────────────────────────────────────────────────

export type VoiceAgentEngine = EnumVoiceAgentEngine;

/** Literales EXACTOS del CHECK `voice_agents_purpose_type_check` (verificado 2026-09-09). */
export type PurposeType = VoiceAgentPurpose;

export const PURPOSE_TYPES = VOICE_AGENT_PURPOSES;

export interface VoiceAgent {
  id: string;
  organization_id: number;
  name: string;
  slug: string;
  description: string | null;
  engine: VoiceAgentEngine;
  purpose_type: PurposeType;
  system_prompt: string;
  first_message: string;
  voice_provider: string;
  voice_id: string | null;
  voice_settings: Record<string, unknown>;
  language: string;
  stt_provider: string;
  llm_provider: string;
  llm_model: string;
  temperature: number;
  max_turns: number;
  max_duration_seconds: number;
  allowed_tools: string[];
  guardrails: Record<string, unknown>;
  transfer_to_human_rules: Record<string, unknown>;
  business_hours: Record<string, unknown>;
  retry_policy: Record<string, unknown>;
  identity_disclosure: string | null;
  voice_ref_id: string | null;
  /** Topes propios del agente para el despacho puntual (sin campaña). */
  max_calls_per_day: number;
  max_calls_per_hour: number;
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
  identity_disclosure?: string;
  voice_ref_id?: string | null;
  max_calls_per_day?: number;
  max_calls_per_hour?: number;
  is_active?: boolean;
}

export type VoiceAgentUpdateInput = Partial<VoiceAgentInput>;

/** Defaults reales para las columnas NOT NULL sin DEFAULT (C-F6-02). */
export const DEFAULT_SYSTEM_PROMPT =
  'Eres un asistente virtual de ventas. Sé breve, cordial y natural. ' +
  'Haz una sola pregunta por turno y confirma lo que entiendes antes de avanzar.';
export const DEFAULT_FIRST_MESSAGE =
  'Hola, le saluda un asistente virtual. ¿Tiene un momento para hablar?';

// ─── Tipos: Campaigns ────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed';

/** Literales EXACTOS del CHECK `voice_agent_campaigns_target_source_check`. */
export type CampaignTargetSource =
  | 'segment'
  | 'pipeline_stage'
  | 'manual_list'
  | 'sequence_step'
  | 'followup_due';

export const CAMPAIGN_TARGET_SOURCES: CampaignTargetSource[] = [
  'segment',
  'pipeline_stage',
  'manual_list',
  'sequence_step',
  'followup_due',
];

export interface VoiceAgentCampaign {
  id: string;
  organization_id: number;
  voice_agent_id: string;
  name: string;
  objective: string | null;
  target_source: CampaignTargetSource;
  target_config: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  max_calls_per_day: number;
  max_calls_per_hour: number;
  max_concurrent: number;
  emergency_stop: boolean;
  stopped_reason: string | null;
  consecutive_failures: number;
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
  target_source?: CampaignTargetSource;
  target_config?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  max_calls_per_day?: number;
  max_calls_per_hour?: number;
  max_concurrent?: number;
  emergency_stop?: boolean;
  status?: CampaignStatus;
}

export type CampaignUpdateInput = Partial<CampaignInput>;

// ─── Tipos: Voice Agent Calls ────────────────────────────────────────────────

export type VoiceAgentCallStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'transferred'
  | 'no_answer'
  | 'voicemail'
  | 'canceled'
  | 'skipped';

export interface VoiceAgentCall {
  id: string;
  organization_id: number;
  voice_agent_id: string;
  campaign_id: string | null;
  call_id: string | null;
  provider_call_sid: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  stage_agent_id: string | null;
  status: VoiceAgentCallStatus;
  outcome: string | null;
  conversation_log: unknown;
  turns_count: number;
  duration_seconds: number | null;
  attempts: number;
  consent_given: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  last_error_code: string | null;
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

// ─── Utilidad: nunca tragarse un error de la base ────────────────────────────

export class VoiceAgentDbError extends Error {
  readonly code: string | undefined;
  readonly context: string;
  constructor(context: string, error: { message: string; code?: string; details?: string }) {
    super(`[${context}] ${error.message}${error.code ? ` (${error.code})` : ''}`);
    this.name = 'VoiceAgentDbError';
    this.code = error.code;
    this.context = context;
  }
}

/**
 * Desestructura y PROPAGA el error de PostgREST.
 * A-F6-22/I3: sin esto un 42703 se disfraza de «no hay filas».
 */
function unwrap<T>(
  context: string,
  res: { data: T; error: { message: string; code?: string } | null }
): T {
  if (res.error) throw new VoiceAgentDbError(context, res.error);
  return res.data;
}

// ─── Voice Agents CRUD ───────────────────────────────────────────────────────

const AGENT_COLUMNS = '*';

export async function getVoiceAgents(
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgent[]> {
  const data = unwrap(
    'getVoiceAgents',
    await supabase
      .from('voice_agents')
      .select(AGENT_COLUMNS)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
  );
  return (data || []) as VoiceAgent[];
}

export async function getVoiceAgent(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgent | null> {
  const data = unwrap(
    'getVoiceAgent',
    await supabase
      .from('voice_agents')
      .select(AGENT_COLUMNS)
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle()
  );
  return (data as VoiceAgent) || null;
}

/**
 * Crea un agente. C-F6-02: NUNCA se envía `null` explícito a una columna NOT NULL
 * (un null explícito anula el DEFAULT). Solo se envían las claves presentes.
 */
export async function createVoiceAgent(
  orgId: number,
  data: VoiceAgentInput,
  supabase: SupabaseClient,
  createdBy?: string | null
): Promise<VoiceAgent> {
  if (!data.name || !data.name.trim()) {
    throw new Error('El nombre del agente es obligatorio');
  }
  if (data.purpose_type && !PURPOSE_TYPES.includes(data.purpose_type)) {
    throw new Error(`purpose_type inválido: ${data.purpose_type}`);
  }

  const slug =
    (data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '').substring(0, 60) ||
    `agente-${Date.now().toString(36)}`;

  const row: Record<string, unknown> = {
    organization_id: orgId,
    name: data.name.trim(),
    slug,
    purpose_type: data.purpose_type ?? 'custom',
    // NOT NULL sin DEFAULT en la base: siempre con valor real.
    system_prompt: data.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT,
    first_message: data.first_message?.trim() || DEFAULT_FIRST_MESSAGE,
  };

  // El resto solo si viene definido: así manda el DEFAULT de la columna.
  const optional: (keyof VoiceAgentInput)[] = [
    'description', 'engine', 'voice_provider', 'voice_id', 'voice_settings', 'language',
    'stt_provider', 'llm_provider', 'llm_model', 'temperature', 'max_turns',
    'max_duration_seconds', 'allowed_tools', 'guardrails', 'transfer_to_human_rules',
    'business_hours', 'retry_policy', 'identity_disclosure', 'voice_ref_id',
    'max_calls_per_day', 'max_calls_per_hour', 'is_active',
  ];
  for (const key of optional) {
    if (data[key] !== undefined) row[key] = data[key];
  }
  if (createdBy) row.created_by = createdBy;

  const result = unwrap(
    'createVoiceAgent',
    await supabase.from('voice_agents').insert(row).select(AGENT_COLUMNS).single()
  );
  return result as VoiceAgent;
}

export async function updateVoiceAgent(
  id: string,
  orgId: number,
  data: VoiceAgentUpdateInput,
  supabase: SupabaseClient
): Promise<VoiceAgent | null> {
  if (data.purpose_type && !PURPOSE_TYPES.includes(data.purpose_type)) {
    throw new Error(`purpose_type inválido: ${data.purpose_type}`);
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: (keyof VoiceAgentInput)[] = [
    'name', 'slug', 'description', 'engine', 'purpose_type',
    'system_prompt', 'first_message', 'voice_provider', 'voice_id',
    'voice_settings', 'language', 'stt_provider', 'llm_provider',
    'llm_model', 'temperature', 'max_turns', 'max_duration_seconds',
    'allowed_tools', 'guardrails', 'transfer_to_human_rules',
    'business_hours', 'retry_policy', 'identity_disclosure', 'voice_ref_id',
    'max_calls_per_day', 'max_calls_per_hour', 'is_active',
  ];
  for (const field of fields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }
  // Nunca dejar en NULL una columna NOT NULL.
  if (updateData.system_prompt === '' || updateData.system_prompt === null) {
    updateData.system_prompt = DEFAULT_SYSTEM_PROMPT;
  }
  if (updateData.first_message === '' || updateData.first_message === null) {
    updateData.first_message = DEFAULT_FIRST_MESSAGE;
  }

  const result = unwrap(
    'updateVoiceAgent',
    await supabase
      .from('voice_agents')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select(AGENT_COLUMNS)
      .maybeSingle()
  );
  return (result as VoiceAgent) || null;
}

export async function deleteVoiceAgent(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  unwrap(
    'deleteVoiceAgent',
    await supabase.from('voice_agents').delete().eq('id', id).eq('organization_id', orgId)
  );
}

// ─── Campaigns CRUD ──────────────────────────────────────────────────────────

export async function getVoiceAgentCampaigns(
  orgId: number,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign[]> {
  const data = unwrap(
    'getVoiceAgentCampaigns',
    await supabase
      .from('voice_agent_campaigns')
      .select('*, voice_agents:voice_agent_id(id, name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
  );
  return (data || []) as VoiceAgentCampaign[];
}

export async function createCampaign(
  orgId: number,
  data: CampaignInput,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign> {
  const targetSource = data.target_source ?? 'manual_list';
  if (!CAMPAIGN_TARGET_SOURCES.includes(targetSource)) {
    throw new Error(`target_source inválido: ${targetSource}`);
  }
  const result = unwrap(
    'createCampaign',
    await supabase
      .from('voice_agent_campaigns')
      .insert({
        organization_id: orgId,
        voice_agent_id: data.voice_agent_id,
        name: data.name,
        objective: data.objective ?? null,
        target_source: targetSource,
        target_config: data.target_config ?? {},
        schedule: data.schedule ?? {},
        max_calls_per_day: data.max_calls_per_day ?? 50,
        max_calls_per_hour: data.max_calls_per_hour ?? 20,
        max_concurrent: data.max_concurrent ?? 3,
        status: data.status ?? 'draft',
        stats: {},
      })
      .select('*')
      .single()
  );
  return result as VoiceAgentCampaign;
}

export async function updateCampaign(
  id: string,
  orgId: number,
  data: CampaignUpdateInput,
  supabase: SupabaseClient
): Promise<VoiceAgentCampaign | null> {
  if (data.target_source && !CAMPAIGN_TARGET_SOURCES.includes(data.target_source)) {
    throw new Error(`target_source inválido: ${data.target_source}`);
  }
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: (keyof CampaignInput)[] = [
    'voice_agent_id', 'name', 'objective', 'target_source', 'target_config', 'schedule',
    'max_calls_per_day', 'max_calls_per_hour', 'max_concurrent', 'emergency_stop', 'status',
  ];
  for (const field of fields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }
  // Reanudar una campaña detenida limpia el motivo de parada.
  if (data.emergency_stop === false) {
    updateData.stopped_reason = null;
    updateData.stopped_at = null;
    updateData.consecutive_failures = 0;
  }

  const result = unwrap(
    'updateCampaign',
    await supabase
      .from('voice_agent_campaigns')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .maybeSingle()
  );
  return (result as VoiceAgentCampaign) || null;
}

export async function deleteCampaign(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  unwrap(
    'deleteCampaign',
    await supabase.from('voice_agent_campaigns').delete().eq('id', id).eq('organization_id', orgId)
  );
}

/** Parada de emergencia manual (UI) o automática (racha de fallos). */
export async function stopCampaign(
  orgId: number,
  campaignId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase.rpc('fn_stop_voice_campaign', {
    p_org: orgId,
    p_campaign: campaignId,
    p_reason: reason,
  });
  if (error) throw new VoiceAgentDbError('stopCampaign', error);
}

// ─── Voice Agent Calls ───────────────────────────────────────────────────────

export async function getVoiceAgentCalls(
  orgId: number,
  supabase: SupabaseClient,
  filters?: VoiceAgentCallFilters
): Promise<VoiceAgentCall[]> {
  let query = supabase
    .from('voice_agent_calls')
    .select('*, voice_agents:voice_agent_id(id, name), customers:customer_id(id, first_name, last_name)')
    .eq('organization_id', orgId);

  if (filters?.voice_agent_id) query = query.eq('voice_agent_id', filters.voice_agent_id);
  if (filters?.campaign_id) query = query.eq('campaign_id', filters.campaign_id);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);

  query = query.order('created_at', { ascending: false });
  if (filters?.limit) {
    query = query.limit(filters.limit);
    if (filters.offset) query = query.range(filters.offset, filters.offset + filters.limit - 1);
  }

  const data = unwrap('getVoiceAgentCalls', await query);
  return (data || []) as VoiceAgentCall[];
}

// ─── Horarios ────────────────────────────────────────────────────────────────

interface ScheduleConfig {
  days?: number[]; // 0=domingo, 6=sabado
  start_hour?: number;
  end_hour?: number;
  timezone?: string;
}

/** Hora y día locales de una zona horaria. Devuelve null si la zona es inválida. */
export function localHourAndDay(timezone: string, now = new Date()): { hour: number; day: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(now);
    const hourStr = parts.find((p) => p.type === 'hour')?.value;
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    if (hourStr === undefined || weekday === undefined) return null;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days.indexOf(weekday);
    if (day < 0) return null;
    return { hour: parseInt(hourStr, 10) % 24, day };
  } catch {
    return null;
  }
}

/** Zona horaria por defecto del CRM (D9, Colombia). */
export const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * Presupuesto por defecto del AGENTE cuando la columna viene nula (R3-5).
 * Coincide con el DEFAULT de `voice_agents.max_calls_per_day/hour` en la base.
 */
export const DEFAULT_AGENT_MAX_CALLS_PER_DAY = 50;
export const DEFAULT_AGENT_MAX_CALLS_PER_HOUR = 20;

/**
 * Ventana de la campaña. A-F6-22: si la zona horaria es inválida NO se cae a la hora
 * del servidor, se rechaza (fail-closed): no llamamos a ciegas.
 */
export function isWithinSchedule(schedule: ScheduleConfig | null, timezone?: string): boolean {
  if (!schedule || schedule.start_hour === undefined || schedule.end_hour === undefined) {
    return true; // Sin schedule configurado = sin restricción propia (queda la del cliente)
  }
  const tz = timezone || schedule.timezone || DEFAULT_TIMEZONE;
  const local = localHourAndDay(tz);
  if (!local) return false; // zona inválida → no marcar
  if (schedule.days && schedule.days.length > 0 && !schedule.days.includes(local.day)) return false;
  return local.hour >= schedule.start_hour && local.hour < schedule.end_hour;
}

/**
 * Franja legal de contacto del cliente (D9). Sin zona horaria se usa America/Bogota
 * (`customers.timezone` es NOT NULL DEFAULT 'America/Bogota'), nunca «permitir todo».
 */
export function isWithinCustomerHours(
  timezone?: string | null,
  window: { startHour: number; endHour: number; allowSunday: boolean } = {
    startHour: 8,
    endHour: 20,
    allowSunday: false,
  }
): boolean {
  const local = localHourAndDay(timezone || DEFAULT_TIMEZONE);
  if (!local) return false; // zona inválida → fail-closed
  if (!window.allowSunday && local.day === 0) return false;
  return local.hour >= window.startHour && local.hour < window.endHour;
}

// ─── Consentimiento y créditos ───────────────────────────────────────────────

/**
 * C-F6-01/C-F6-10: única puerta de la baja voluntaria. Fail-closed.
 * `fn_can_contact` lee `customers.do_not_call`, `metadata->>'do_not_call'`
 * y `contact_consents`.
 */
export async function canCallCustomer(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_can_contact', {
    p_org: orgId,
    p_customer: customerId,
    p_channel: 'voice',
    p_purpose: 'utility',
  });
  if (error) {
    console.warn('[voiceAgent] fn_can_contact falló, se bloquea la llamada:', error.message);
    return false;
  }
  return data === true;
}

/** Reserva de crédito de voz ANTES del proveedor (D6). Devuelve false si no alcanza. */
async function reserveVoiceCredits(
  orgId: number,
  minutes: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase.rpc('deduct_comm_credits', {
    p_org_id: orgId,
    p_channel: 'voice',
    p_amount: minutes,
  });
  if (error) {
    console.warn('[voiceAgent] deduct_comm_credits falló:', error.message);
    return false; // fail-closed
  }
  return data === true;
}

/** Devuelve la reserva si el proveedor rechazó la llamada. */
async function refundVoiceCredits(
  orgId: number,
  minutes: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase.rpc('deduct_comm_credits', {
    p_org_id: orgId,
    p_channel: 'voice',
    p_amount: -minutes,
  });
  if (error) console.warn('[voiceAgent] reembolso de créditos falló:', error.message);
}

// ─── Targets de campaña ──────────────────────────────────────────────────────

export interface CustomerTarget {
  customer_id: string;
  opportunity_id: string | null;
  stage_id: string | null;
}

/**
 * Construye los objetivos según `target_source` (literales del CHECK real).
 * A-F6-25: el llamador acota cuántos se encolan; aquí se aplica `limit`.
 */
export async function buildCampaignTargets(
  supabase: SupabaseClient,
  orgId: number,
  campaign: VoiceAgentCampaign,
  limit: number
): Promise<CustomerTarget[]> {
  if (limit <= 0) return [];
  const config = (campaign.target_config || {}) as Record<string, unknown>;
  const targets: CustomerTarget[] = [];

  const pushOpportunityRows = (rows: Array<Record<string, unknown>>) => {
    for (const opp of rows) {
      const customerId = opp.customer_id as string | null;
      if (!customerId) continue;
      targets.push({
        customer_id: customerId,
        opportunity_id: (opp.id as string) || null,
        stage_id: (opp.stage_id as string) || null,
      });
    }
  };

  if (campaign.target_source === 'pipeline_stage') {
    const stageId = config.stage_id as string | undefined;
    if (!stageId) return [];
    const rows = unwrap(
      'buildCampaignTargets.pipeline_stage',
      await supabase
        .from('opportunities')
        .select('id, customer_id, stage_id')
        .eq('organization_id', orgId)
        .eq('stage_id', stageId)
        .eq('status', 'open')
        .not('customer_id', 'is', null)
        .limit(limit)
    ) as Array<Record<string, unknown>> | null;
    pushOpportunityRows(rows || []);
  } else if (campaign.target_source === 'manual_list') {
    const customerIds = (config.customer_ids as string[] | undefined) || [];
    if (customerIds.length === 0) return [];
    const rows = unwrap(
      'buildCampaignTargets.manual_list',
      await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', orgId)
        .in('id', customerIds.slice(0, limit))
        .not('phone', 'is', null)
    ) as Array<{ id: string }> | null;
    for (const c of rows || []) {
      targets.push({ customer_id: c.id, opportunity_id: null, stage_id: null });
    }
  } else if (campaign.target_source === 'segment') {
    const segmentId = config.segment_id as string | undefined;
    if (!segmentId) return [];
    const rows = unwrap(
      'buildCampaignTargets.segment',
      await supabase
        .from('campaign_contacts')
        .select('customer_id')
        .eq('campaign_id', segmentId)
        .limit(limit)
    ) as Array<{ customer_id: string }> | null;
    // `segments.filter_json` es dinámico; sin materialización previa no hay objetivos.
    for (const r of rows || []) {
      targets.push({ customer_id: r.customer_id, opportunity_id: null, stage_id: null });
    }
  } else if (campaign.target_source === 'followup_due') {
    const rows = unwrap(
      'buildCampaignTargets.followup_due',
      await supabase
        .from('opportunities')
        .select('id, customer_id, stage_id')
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .not('customer_id', 'is', null)
        .not('next_contact_at', 'is', null)
        .lte('next_contact_at', new Date().toISOString())
        .order('next_contact_at', { ascending: true })
        .limit(limit)
    ) as Array<Record<string, unknown>> | null;
    pushOpportunityRows(rows || []);
  } else if (campaign.target_source === 'sequence_step') {
    const stepId = config.step_id as string | undefined;
    if (!stepId) return [];
    const rows = unwrap(
      'buildCampaignTargets.sequence_step',
      await supabase
        .from('sequence_step_runs')
        .select('enrollment_id, sequence_enrollments:enrollment_id(customer_id, opportunity_id)')
        .eq('step_id', stepId)
        .eq('status', 'pending')
        .limit(limit)
    ) as Array<Record<string, unknown>> | null;
    for (const r of rows || []) {
      const enr = r.sequence_enrollments as { customer_id?: string; opportunity_id?: string } | null;
      if (enr?.customer_id) {
        targets.push({
          customer_id: enr.customer_id,
          opportunity_id: enr.opportunity_id ?? null,
          stage_id: null,
        });
      }
    }
  }

  return targets.slice(0, limit);
}

// ─── Despachador ─────────────────────────────────────────────────────────────

export interface RunCampaignQueueResult {
  campaigns_processed: number;
  calls_initiated: number;
  calls_skipped: number;
  calls_enqueued: number;
  campaigns_stopped: string[];
  errors: string[];
}

/** Racha de fallos consecutivos que dispara la parada de emergencia. */
export const FAILURE_STREAK_TO_STOP = 5;

/** Minutos reservados por llamada antes de marcar (se ajusta al colgar). */
export const CREDITS_RESERVED_PER_CALL = 1;

/** Desfase en minutos de una zona horaria respecto a UTC en un instante dado. */
function tzOffsetMinutes(timezone: string, at: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(at)) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    if (!p.year || !p.month || !p.day) return null;
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return null;
  }
}

/**
 * Inicio del día EN LA ZONA DE LA ORGANIZACIÓN (F-NEW-12). Antes se usaba
 * `setUTCHours(0,0,0,0)`, con lo que en Colombia (UTC−5) la cuota diaria se
 * reiniciaba a las 19:00 locales.
 */
export function startOfDayIso(timezone: string = DEFAULT_TIMEZONE, now = new Date()): string {
  const offset = tzOffsetMinutes(timezone, now) ?? tzOffsetMinutes(DEFAULT_TIMEZONE, now) ?? 0;
  const local = new Date(now.getTime() + offset * 60000);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0, 0, 0, 0
  );
  return new Date(midnightLocal - offset * 60000).toISOString();
}

function oneHourAgoIso(): string {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

/**
 * Cuenta TODO intento REAL del periodo (C-F6-06 / F-NEW-2).
 *
 * El conteo va contra `voice_agent_call_attempts`, el libro de intentos que
 * escribe la propia RPC de reserva. Contarlo por `voice_agent_calls.claimed_at`
 * era burlable: el reintento tras un fallo del proveedor y el rechazo por franja
 * horaria ponen `claimed_at` a NULL, de modo que el intento desaparecía del
 * conteo y el techo real era `tope × max_attempts` (hasta 5×).
 */
async function countAttempts(
  supabase: SupabaseClient,
  campaignId: string,
  sinceIso: string
): Promise<number> {
  const res = await supabase
    .from('voice_agent_call_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .gte('attempted_at', sinceIso);
  if (res.error) throw new VoiceAgentDbError('countAttempts', res.error);
  return res.count ?? 0;
}

/** Intentos de un agente concreto (camino sin campaña: despacho puntual y cola). */
async function countAgentAttempts(
  supabase: SupabaseClient,
  orgId: number,
  agentId: string,
  sinceIso: string,
  customerId?: string
): Promise<number> {
  let query = supabase
    .from('voice_agent_call_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('voice_agent_id', agentId)
    .gte('attempted_at', sinceIso);
  if (customerId) query = query.eq('customer_id', customerId);
  const res = await query;
  if (res.error) throw new VoiceAgentDbError('countAgentAttempts', res.error);
  return res.count ?? 0;
}

/** Llamadas del agente en curso ahora mismo (barrera de concurrencia sin campaña). */
async function countAgentInProgress(
  supabase: SupabaseClient,
  orgId: number,
  agentId: string
): Promise<number> {
  const res = await supabase
    .from('voice_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('voice_agent_id', agentId)
    .eq('status', 'in_progress');
  if (res.error) throw new VoiceAgentDbError('countAgentInProgress', res.error);
  return res.count ?? 0;
}

async function countInProgress(supabase: SupabaseClient, campaignId: string): Promise<number> {
  const res = await supabase
    .from('voice_agent_calls')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'in_progress');
  if (res.error) throw new VoiceAgentDbError('countInProgress', res.error);
  return res.count ?? 0;
}

/**
 * Procesa la cola de llamadas de campañas activas de una organización.
 */
export async function runCampaignQueue(
  orgId: number,
  supabase: SupabaseClient,
  options: { worker?: string } = {}
): Promise<RunCampaignQueueResult> {
  const worker = options.worker || `dispatcher-${Math.random().toString(36).slice(2, 10)}`;
  const result: RunCampaignQueueResult = {
    campaigns_processed: 0,
    calls_initiated: 0,
    calls_skipped: 0,
    calls_enqueued: 0,
    campaigns_stopped: [],
    errors: [],
  };

  const campaigns = (unwrap(
    'runCampaignQueue.campaigns',
    await supabase
      .from('voice_agent_campaigns')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'running')
      .eq('emergency_stop', false)
  ) || []) as VoiceAgentCampaign[];

  if (campaigns.length === 0) return result;

  const orgSettings = await getOrgVoiceSettings(orgId, supabase);
  // F-NEW-11: si la organización tiene el agente de voz apagado, marcar significa
  // pagar el minuto de Twilio para que el ws-server cuelgue. No se marca.
  if (!orgSettings.agentEnabled) {
    result.errors.push('El agente de voz está desactivado para esta organización (comm_settings.voice_agent_enabled)');
    return result;
  }

  const { client: twilioClient, fromNumber } = await getTwilioClientForOrg(orgId, supabase);
  const webhookBase = getWebhookBaseUrl();
  const recordingSettings = orgSettings;

  for (const campaign of campaigns) {
    result.campaigns_processed++;

    // Barrera 0: parada de emergencia (independiente de cualquier conteo).
    if (campaign.emergency_stop) continue;

    // Barrera 0 bis: el agente de la campaña debe estar activo, y de paso se lee
    // su presupuesto diario/horario (R3-5: es el mismo saldo que gasta el
    // despacho puntual, no un cupo aparte).
    const agentCaps = await getAgentCaps(supabase, orgId, campaign.voice_agent_id);
    if (!agentCaps || !agentCaps.is_active) {
      result.errors.push(`Campaña ${campaign.id}: el agente está desactivado`);
      continue;
    }

    // Barrera 1: ventana horaria de la campaña.
    const schedule = (campaign.schedule as ScheduleConfig | null) ?? null;
    if (!isWithinSchedule(schedule, schedule?.timezone)) continue;

    // Barrera 2: concurrencia, tope diario (todo intento REAL) y tope horario.
    // El día es el de la organización (`schedule.timezone`), no el UTC.
    //
    // R3-5: se cuentan DOS saldos y manda el menor.
    //   · el de la campaña  → `campaign_id`   (sub-cupo de esta campaña)
    //   · el del AGENTE     → `voice_agent_id` (presupuesto ÚNICO: incluye los
    //     intentos del despacho puntual y los de las demás campañas del agente)
    // Antes solo se miraba el primero, así que campaña y despacho puntual sumaban
    // sus topes y el techo real doblaba al declarado.
    const dayStartIso = startOfDayIso(schedule?.timezone || DEFAULT_TIMEZONE);
    const hourAgoIso = oneHourAgoIso();
    const [inProgress, attemptsToday, attemptsHour, agentAttemptsToday, agentAttemptsHour] =
      await Promise.all([
        countInProgress(supabase, campaign.id),
        countAttempts(supabase, campaign.id, dayStartIso),
        countAttempts(supabase, campaign.id, hourAgoIso),
        countAgentAttempts(supabase, orgId, campaign.voice_agent_id, dayStartIso),
        countAgentAttempts(supabase, orgId, campaign.voice_agent_id, hourAgoIso),
      ]);

    const maxConcurrent = campaign.max_concurrent || 3;
    const maxPerDay = campaign.max_calls_per_day || 50;
    const maxPerHour = campaign.max_calls_per_hour || 20;

    /** Lo que aún cabe hoy sin pasarse de NINGUNO de los dos saldos. */
    const dayRoom = Math.min(
      maxPerDay - attemptsToday,
      agentCaps.max_calls_per_day - agentAttemptsToday
    );
    const hourRoom = Math.min(
      maxPerHour - attemptsHour,
      agentCaps.max_calls_per_hour - agentAttemptsHour
    );

    const slots = Math.min(maxConcurrent - inProgress, dayRoom, hourRoom);
    if (slots <= 0) continue;

    // Encolar objetivos solo hasta lo que cabe en la cuota diaria restante.
    const pendingRes = await supabase
      .from('voice_agent_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .in('status', ['pending', 'queued']);
    if (pendingRes.error) throw new VoiceAgentDbError('runCampaignQueue.pendingCount', pendingRes.error);
    const pendingCount = pendingRes.count ?? 0;

    if (pendingCount < slots) {
      // Se encola solo lo que cabe en el saldo MENOR (R3-5), no en el de la campaña.
      const room = Math.max(0, Math.min(dayRoom, 200) - pendingCount);
      result.calls_enqueued += await enqueueCampaignTargets(supabase, orgId, campaign, room);
    }

    // Barrera 3: reserva atómica (FOR UPDATE SKIP LOCKED) ANTES de marcar.
    const claimRes = await supabase.rpc('fn_claim_voice_agent_calls', {
      p_org: orgId,
      p_campaign: campaign.id,
      p_limit: slots,
      p_worker: worker,
    });
    if (claimRes.error) throw new VoiceAgentDbError('fn_claim_voice_agent_calls', claimRes.error);
    const claimed = (claimRes.data || []) as VoiceAgentCall[];
    if (claimed.length === 0) continue;

    let streak = campaign.consecutive_failures ?? 0;

    for (const vac of claimed) {
      try {
        const dialed = await dialClaimedCall({
          supabase,
          orgId,
          campaign,
          vac,
          twilioClient,
          fromNumber,
          webhookBase,
          recording: recordingSettings,
        });
        if (dialed.initiated) {
          result.calls_initiated++;
          streak = 0;
        } else {
          result.calls_skipped++;
          if (dialed.reason) result.errors.push(`Llamada ${vac.id}: ${dialed.reason}`);
          if (dialed.providerFailure) streak++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        result.calls_skipped++;
        streak++;
        result.errors.push(`Llamada ${vac.id}: ${message}`);
        await releaseCall(supabase, vac.id, 'failed', message, null);
      }

      if (streak >= FAILURE_STREAK_TO_STOP) {
        await stopCampaign(
          orgId,
          campaign.id,
          `Parada automática: ${streak} fallos consecutivos al marcar`,
          supabase
        );
        result.campaigns_stopped.push(campaign.id);
        break;
      }
    }

    if (!result.campaigns_stopped.includes(campaign.id)) {
      const upd = await supabase
        .from('voice_agent_campaigns')
        .update({ consecutive_failures: streak, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .eq('organization_id', orgId);
      if (upd.error) throw new VoiceAgentDbError('runCampaignQueue.streak', upd.error);
    }
  }

  return result;
}

/** Encola objetivos nuevos respetando la baja voluntaria y sin duplicar. */
async function enqueueCampaignTargets(
  supabase: SupabaseClient,
  orgId: number,
  campaign: VoiceAgentCampaign,
  room: number
): Promise<number> {
  if (room <= 0) return 0;
  const targets = await buildCampaignTargets(supabase, orgId, campaign, room);
  if (targets.length === 0) return 0;

  const customerIds = targets.map((t) => t.customer_id);
  // R3-6: el filtro iba por `campaign_id`, así que un cliente que ya tenía una
  // llamada viva de ESTE MISMO AGENTE por otra campaña o por despacho puntual no
  // se excluía: se le encolaba una segunda llamada. Ahora se mira por agente,
  // que es exactamente el alcance del índice único parcial
  // `voice_agent_calls_una_viva_por_cliente`.
  const existing = (unwrap(
    'enqueueCampaignTargets.existing',
    await supabase
      .from('voice_agent_calls')
      .select('customer_id')
      .eq('organization_id', orgId)
      .eq('voice_agent_id', campaign.voice_agent_id)
      .in('customer_id', customerIds)
      .in('status', ['pending', 'queued', 'in_progress'])
  ) || []) as Array<{ customer_id: string }>;
  const alreadyQueued = new Set(existing.map((r) => r.customer_id));

  const rows: Record<string, unknown>[] = [];
  for (const target of targets) {
    if (rows.length >= room) break;
    if (alreadyQueued.has(target.customer_id)) continue;
    // C-F6-10: baja voluntaria antes incluso de encolar.
    if (!(await canCallCustomer(orgId, target.customer_id, supabase))) continue;

    const stageAgentId = target.stage_id
      ? await findStageAgentId(supabase, orgId, target.stage_id)
      : null;

    rows.push({
      organization_id: orgId,
      voice_agent_id: campaign.voice_agent_id,
      campaign_id: campaign.id,
      customer_id: target.customer_id,
      opportunity_id: target.opportunity_id,
      stage_agent_id: stageAgentId,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return 0;

  // El índice único parcial hace atómica la deduplicación, pero convierte una
  // carrera entre dos workers en un 23505 que tumbaría TODO el lote. Si eso
  // pasa, se reintenta fila a fila y se saltan solo las que ya existen. El
  // error NO se traga: cualquier código distinto de 23505 se propaga.
  const insercion = await supabase.from('voice_agent_calls').insert(rows);
  if (!insercion.error) return rows.length;
  if (insercion.error.code !== '23505') {
    throw new VoiceAgentDbError('enqueueCampaignTargets.insert', insercion.error);
  }

  let encoladas = 0;
  for (const row of rows) {
    const una = await supabase.from('voice_agent_calls').insert(row);
    if (!una.error) { encoladas++; continue; }
    if (una.error.code === '23505') continue; // ya había una viva: es lo correcto
    throw new VoiceAgentDbError('enqueueCampaignTargets.insert', una.error);
  }
  return encoladas;
}

async function findStageAgentId(
  supabase: SupabaseClient,
  orgId: number,
  stageId: string
): Promise<string | null> {
  const data = unwrap(
    'findStageAgentId',
    await supabase
      .from('stage_agents')
      .select('id')
      .eq('organization_id', orgId)
      .eq('stage_id', stageId)
      .eq('channel', 'voice')
      .eq('is_active', true)
      .maybeSingle()
  ) as { id: string } | null;
  return data?.id ?? null;
}

/**
 * Estado y PRESUPUESTO del agente (F-NEW-11 + R3-5).
 *
 * F-NEW-11: no se marca con un agente desactivado (la llamada acabaría colgada).
 *
 * R3-5: `voice_agents.max_calls_per_day/hour` es el **único presupuesto** del
 * agente. Antes la campaña contaba por `campaign_id` y el despacho puntual por
 * `voice_agent_id`, así que los dos topes se SUMABAN: un agente con 50 en la
 * campaña y 50 en el agente marcaba 100 veces al día y el número que veía el
 * dueño no era el techo real. Ahora los dos caminos descuentan del mismo saldo.
 */
export interface AgentCaps {
  is_active: boolean;
  max_calls_per_day: number;
  max_calls_per_hour: number;
}

async function getAgentCaps(
  supabase: SupabaseClient,
  orgId: number,
  agentId: string
): Promise<AgentCaps | null> {
  const data = unwrap(
    'getAgentCaps',
    await supabase
      .from('voice_agents')
      .select('is_active, max_calls_per_day, max_calls_per_hour')
      .eq('id', agentId)
      .eq('organization_id', orgId)
      .maybeSingle()
  ) as { is_active: boolean; max_calls_per_day: number | null; max_calls_per_hour: number | null } | null;
  if (!data) return null;
  return {
    is_active: data.is_active === true,
    max_calls_per_day: data.max_calls_per_day ?? DEFAULT_AGENT_MAX_CALLS_PER_DAY,
    max_calls_per_hour: data.max_calls_per_hour ?? DEFAULT_AGENT_MAX_CALLS_PER_HOUR,
  };
}

interface RecordingSettings {
  enabled: boolean;
  consentMessage: string;
}

/** Ajustes de voz de la organización que gobiernan la marcación. */
export interface OrgVoiceSettings extends RecordingSettings {
  /** F-NEW-11: si el canal está apagado, el ws-server cuelga. No hay que marcar. */
  agentEnabled: boolean;
  maxConcurrentCalls: number;
}

async function getOrgVoiceSettings(
  orgId: number,
  supabase: SupabaseClient
): Promise<OrgVoiceSettings> {
  const data = unwrap(
    'getOrgVoiceSettings',
    await supabase
      .from('comm_settings')
      .select('voice_recording_enabled, voice_consent_message, voice_agent_enabled, is_active, voice_max_concurrent_calls')
      .eq('organization_id', orgId)
      .maybeSingle()
  ) as {
    voice_recording_enabled?: boolean;
    voice_consent_message?: string;
    voice_agent_enabled?: boolean;
    is_active?: boolean;
    voice_max_concurrent_calls?: number;
  } | null;

  return {
    enabled: data?.voice_recording_enabled !== false,
    consentMessage:
      data?.voice_consent_message ||
      'Esta llamada será grabada con fines de calidad y quedará registrada en nuestro sistema.',
    // Sin fila de `comm_settings` no hay canal configurado: fail-closed.
    agentEnabled: data ? data.voice_agent_enabled !== false && data.is_active !== false : false,
    maxConcurrentCalls: Number(data?.voice_max_concurrent_calls) > 0 ? Number(data?.voice_max_concurrent_calls) : 3,
  };
}

/** Libera/cierra una fila reclamada sin dejar el estado colgado. */
async function releaseCall(
  supabase: SupabaseClient,
  vacId: string,
  status: VoiceAgentCallStatus,
  errorMessage: string | null,
  errorCode: string | null
): Promise<void> {
  const res = await supabase
    .from('voice_agent_calls')
    .update({
      status,
      error_message: errorMessage,
      last_error_code: errorCode,
      completed_at: new Date().toISOString(),
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vacId);
  if (res.error) throw new VoiceAgentDbError('releaseCall', res.error);
}

interface DialParams {
  supabase: SupabaseClient;
  orgId: number;
  campaign: VoiceAgentCampaign;
  vac: VoiceAgentCall;
  twilioClient: { calls: { create: (opts: Record<string, unknown>) => Promise<{ sid: string }> } };
  fromNumber: string;
  webhookBase: string;
  recording: RecordingSettings;
}

interface DialOutcome {
  initiated: boolean;
  reason?: string;
  providerFailure?: boolean;
}

/**
 * Marca una fila ya reclamada. Orden: cliente → consentimiento → franja → crédito →
 * fila en `calls` → proveedor → correlación.
 */
async function dialClaimedCall(p: DialParams): Promise<DialOutcome> {
  const { supabase, orgId, campaign, vac, twilioClient, fromNumber, webhookBase, recording } = p;

  if (!vac.customer_id) {
    await releaseCall(supabase, vac.id, 'skipped', 'La llamada no tiene cliente asociado', null);
    return { initiated: false, reason: 'sin cliente' };
  }

  // I3/A-F6-22: se desestructura el error y se PROPAGA con su código real.
  const customerRes = await supabase
    .from('customers')
    .select('id, phone, timezone')
    .eq('id', vac.customer_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (customerRes.error) {
    throw new VoiceAgentDbError('dialClaimedCall.customers', customerRes.error);
  }
  const customer = customerRes.data as { id: string; phone: string | null; timezone: string | null } | null;
  if (!customer) {
    await releaseCall(supabase, vac.id, 'skipped', 'Cliente no encontrado', null);
    return { initiated: false, reason: 'cliente no encontrado' };
  }

  if (!(await canCallCustomer(orgId, vac.customer_id, supabase))) {
    await releaseCall(supabase, vac.id, 'skipped', 'Cliente con baja voluntaria de llamadas (do_not_call)', null);
    return { initiated: false, reason: 'baja voluntaria' };
  }

  if (!isWithinCustomerHours(customer.timezone)) {
    // Vuelve a la cola: no es un fallo, es «ahora no».
    // `claimed_at` se anula a propósito para que la fila vuelva a poder reclamarse;
    // el intento YA quedó contado en `voice_agent_call_attempts` (F-NEW-2), así que
    // esta anulación no lo borra del tope.
    const res = await supabase
      .from('voice_agent_calls')
      .update({
        status: 'pending',
        claimed_at: null,
        locked_by: null,
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vac.id);
    if (res.error) throw new VoiceAgentDbError('dialClaimedCall.reschedule', res.error);
    return { initiated: false, reason: 'fuera de la franja horaria del cliente' };
  }

  if (!customer.phone) {
    await releaseCall(supabase, vac.id, 'skipped', 'Cliente sin teléfono', null);
    return { initiated: false, reason: 'sin teléfono' };
  }

  // D6: crédito reservado ANTES de gastar en el proveedor.
  const reserved = await reserveVoiceCredits(orgId, CREDITS_RESERVED_PER_CALL, supabase);
  if (!reserved) {
    await releaseCall(supabase, vac.id, 'skipped', 'Sin minutos de voz disponibles', null);
    return { initiated: false, reason: 'sin créditos' };
  }
  // F-NEW-6: la reserva queda anotada en la fila para que al colgar se cobre
  // SOLO la diferencia (antes se cobraban los minutos completos encima).
  unwrap(
    'dialClaimedCall.reserveCredits',
    await supabase
      .from('voice_agent_calls')
      .update({ credits_reserved: CREDITS_RESERVED_PER_CALL, credits_settled_at: null, updated_at: new Date().toISOString() })
      .eq('id', vac.id)
      .eq('organization_id', orgId)
  );

  const toNumber = formatE164(customer.phone);
  const startedAt = new Date().toISOString();

  // C-F6-03: fila en `calls` con las columnas reales y todos los NOT NULL.
  const callRow = unwrap(
    'dialClaimedCall.calls.insert',
    await supabase
      .from('calls')
      .insert({
        organization_id: orgId,
        provider: 'twilio',
        direction: 'outbound',
        mode: 'ai_agent',
        from_number: fromNumber,
        to_number: toNumber,
        status: 'dialing',
        started_at: startedAt,
        customer_id: vac.customer_id,
        opportunity_id: vac.opportunity_id,
        voice_agent_id: vac.voice_agent_id,
        recording_enabled: recording.enabled,
        consent_given: false,
        duration_source: 'provider',
        metadata: {
          source: 'voice_agent_campaign',
          campaign_id: campaign.id,
          voice_agent_call_id: vac.id,
        },
      })
      .select('id')
      .single()
  ) as { id: string };

  // C-F6-04: el UUID de `calls` va en call_id; el CallSid, en provider_call_sid.
  unwrap(
    'dialClaimedCall.link',
    await supabase
      .from('voice_agent_calls')
      .update({ call_id: callRow.id, updated_at: new Date().toISOString() })
      .eq('id', vac.id)
      .eq('organization_id', orgId)
  );

  const agentTwimlUrl =
    `${webhookBase}/api/voice/twiml/ai-agent` +
    `?agentId=${encodeURIComponent(vac.voice_agent_id)}&callId=${encodeURIComponent(vac.id)}`;
  const statusUrl = `${webhookBase}/api/voice/ai-agent/status?callId=${encodeURIComponent(vac.id)}`;

  try {
    const call = await twilioClient.calls.create({
      to: toNumber,
      from: fromNumber,
      url: agentTwimlUrl,
      statusCallback: statusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 30,
      machineDetection: 'Enable',
      // C-F6-09: grabación dual-channel (el aviso de consentimiento lo emite el TwiML).
      ...(recording.enabled
        ? { record: true, recordingChannels: 'dual', recordingStatusCallback: `${webhookBase}/api/voice/recording` }
        : {}),
    });

    unwrap(
      'dialClaimedCall.correlate',
      await supabase
        .from('voice_agent_calls')
        .update({
          provider_call_sid: call.sid,
          started_at: startedAt,
          error_message: null,
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vac.id)
        .eq('organization_id', orgId)
    );
    unwrap(
      'dialClaimedCall.calls.sid',
      await supabase
        .from('calls')
        .update({ provider_call_sid: call.sid, updated_at: new Date().toISOString() })
        .eq('id', callRow.id)
        .eq('organization_id', orgId)
    );

    return { initiated: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    const code = (err as { code?: number | string })?.code;
    await refundVoiceCredits(orgId, CREDITS_RESERVED_PER_CALL, supabase);
    // La reserva se devolvió: la fila deja de tener crédito pendiente de conciliar.
    unwrap(
      'dialClaimedCall.releaseReserve',
      await supabase
        .from('voice_agent_calls')
        .update({ credits_reserved: 0, credits_settled_at: new Date().toISOString() })
        .eq('id', vac.id)
        .eq('organization_id', orgId)
    );

    const failRes = await supabase
      .from('calls')
      .update({
        status: 'failed',
        ended_at: new Date().toISOString(),
        metadata: { source: 'voice_agent_campaign', error: message },
        updated_at: new Date().toISOString(),
      })
      .eq('id', callRow.id)
      .eq('organization_id', orgId);
    if (failRes.error) throw new VoiceAgentDbError('dialClaimedCall.callsFail', failRes.error);

    // A-F6-23: reintento según `retry_policy` del agente.
    const retry = await getRetryPolicy(supabase, orgId, vac.voice_agent_id);
    const attempts = vac.attempts ?? 1;
    if (attempts < retry.maxAttempts) {
      const res = await supabase
        .from('voice_agent_calls')
        .update({
          status: 'pending',
          claimed_at: null,
          locked_by: null,
          error_message: message,
          last_error_code: code != null ? String(code) : null,
          scheduled_at: new Date(Date.now() + retry.backoffMinutes * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', vac.id);
      if (res.error) throw new VoiceAgentDbError('dialClaimedCall.retry', res.error);
    } else {
      await releaseCall(supabase, vac.id, 'failed', message, code != null ? String(code) : null);
    }

    return { initiated: false, reason: message, providerFailure: true };
  }
}

interface RetryPolicy {
  maxAttempts: number;
  backoffMinutes: number;
}

async function getRetryPolicy(
  supabase: SupabaseClient,
  orgId: number,
  agentId: string
): Promise<RetryPolicy> {
  const data = unwrap(
    'getRetryPolicy',
    await supabase
      .from('voice_agents')
      .select('retry_policy')
      .eq('id', agentId)
      .eq('organization_id', orgId)
      .maybeSingle()
  ) as { retry_policy?: Record<string, unknown> } | null;

  const rp = (data?.retry_policy || {}) as { max_attempts?: number; backoff_minutes?: number };
  return {
    maxAttempts: Math.min(Math.max(Number(rp.max_attempts) || 1, 1), 5),
    backoffMinutes: Math.min(Math.max(Number(rp.backoff_minutes) || 60, 5), 24 * 60),
  };
}

// ─── Llamada puntual del agente (desde el pipeline / ficha 360) ──────────────

export interface DispatchAgentCallInput {
  voiceAgentId: string;
  opportunityId?: string | null;
  customerId?: string | null;
  /** `true` marca ya; `false` deja la llamada en cola para el despachador. */
  dialNow?: boolean;
}

export interface DispatchAgentCallResult {
  voice_agent_call_id: string;
  dialed: boolean;
  reason?: string;
}

/** Máximo de intentos al MISMO cliente por agente y día (deduplicación, F-NEW-5). */
export const MAX_ATTEMPTS_PER_CUSTOMER_PER_DAY = 2;

export class VoiceDispatchBlocked extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'VoiceDispatchBlocked';
    this.reason = reason;
  }
}

/**
 * Lanza una llamada del agente IA para una oportunidad o cliente concretos.
 * La configuración de la ETAPA del embudo se resuelve aquí y viaja en la fila
 * (`stage_agent_id`), de modo que llega al runtime de la llamada.
 *
 * F-NEW-5 (ronda 2): este camino ya NO es un atajo sin frenos. Aplica las mismas
 * barreras que la cola de campañas — canal habilitado, agente activo, franja
 * horaria del agente y del cliente, tope diario y horario contra el libro de
 * intentos, concurrencia y deduplicación por cliente — y reserva la fila con una
 * RPC atómica que deja constancia del intento.
 */
export async function dispatchAgentCall(
  orgId: number,
  supabase: SupabaseClient,
  input: DispatchAgentCallInput
): Promise<DispatchAgentCallResult> {
  const agent = await getVoiceAgent(input.voiceAgentId, orgId, supabase);
  if (!agent) throw new Error('Agente no encontrado');
  if (!agent.is_active) throw new Error('El agente está desactivado');

  const orgSettings = await getOrgVoiceSettings(orgId, supabase);
  if (!orgSettings.agentEnabled) {
    throw new VoiceDispatchBlocked(
      'channel_disabled',
      'El agente de voz está desactivado para esta organización. Actívalo en Configuración → CRM → Telefonía.'
    );
  }

  let customerId = input.customerId ?? null;
  let stageId: string | null = null;

  if (input.opportunityId) {
    const opp = unwrap(
      'dispatchAgentCall.opportunity',
      await supabase
        .from('opportunities')
        .select('id, customer_id, stage_id')
        .eq('id', input.opportunityId)
        .eq('organization_id', orgId)
        .maybeSingle()
    ) as { id: string; customer_id: string | null; stage_id: string } | null;
    if (!opp) throw new Error('Oportunidad no encontrada');
    customerId = customerId ?? opp.customer_id;
    stageId = opp.stage_id;
  }

  if (!customerId) throw new Error('Se requiere un cliente o una oportunidad con cliente');
  if (!(await canCallCustomer(orgId, customerId, supabase))) {
    throw new Error('El cliente pidió no recibir llamadas (do_not_call). No se marca.');
  }

  // ── Barreras del despacho puntual (las mismas que las de la campaña) ──
  const businessHours = (agent.business_hours as ScheduleConfig | null) ?? null;
  const agentTimezone = businessHours?.timezone || DEFAULT_TIMEZONE;
  const dayStart = startOfDayIso(agentTimezone);

  // Deduplicación: si ya hay una llamada viva para este agente y cliente, se
  // devuelve esa. N peticiones dejan de ser N llamadas al mismo cliente.
  const live = (unwrap(
    'dispatchAgentCall.dedupe',
    await supabase
      .from('voice_agent_calls')
      .select('id, status')
      .eq('organization_id', orgId)
      .eq('voice_agent_id', input.voiceAgentId)
      .eq('customer_id', customerId)
      .in('status', ['pending', 'queued', 'in_progress'])
      .limit(1)
  ) || []) as Array<{ id: string; status: string }>;
  // R3-9: una fila `pending` SIN campaña no la reclama nadie —
  // `fn_claim_voice_agent_calls` filtra por `campaign_id`—, así que las que
  // dejaba `dial_now: false` se quedaban muertas para siempre. En vez de crear
  // otra fila, este despacho REUTILIZA la que ya está esperando y la marca.
  // Con `queued`/`in_progress` sí hay una llamada viva de verdad y se devuelve
  // tal cual: la deduplicación de F-NEW-5 se mantiene intacta.
  const reutilizable = live.find((l) => l.status === 'pending') ?? null;
  if (live.length > 0 && !(reutilizable && input.dialNow !== false)) {
    return {
      voice_agent_call_id: live[0].id,
      dialed: false,
      reason: `ya hay una llamada de este agente para el cliente (${live[0].status})`,
    };
  }

  const [attemptsToday, attemptsHour, attemptsCustomer, inProgressNow] = await Promise.all([
    countAgentAttempts(supabase, orgId, input.voiceAgentId, dayStart),
    countAgentAttempts(supabase, orgId, input.voiceAgentId, oneHourAgoIso()),
    countAgentAttempts(supabase, orgId, input.voiceAgentId, dayStart, customerId),
    countAgentInProgress(supabase, orgId, input.voiceAgentId),
  ]);

  // R3-5: el mismo presupuesto que descuenta la campaña. `countAgentAttempts`
  // cuenta TODO el libro del agente (filas de campaña incluidas, porque la RPC
  // de reserva graba `voice_agent_id` también en el camino de campaña).
  const maxPerDay = agent.max_calls_per_day ?? DEFAULT_AGENT_MAX_CALLS_PER_DAY;
  const maxPerHour = agent.max_calls_per_hour ?? DEFAULT_AGENT_MAX_CALLS_PER_HOUR;
  if (attemptsToday >= maxPerDay) {
    throw new VoiceDispatchBlocked('daily_cap', `Tope diario del agente alcanzado (${maxPerDay} llamadas).`);
  }
  if (attemptsHour >= maxPerHour) {
    throw new VoiceDispatchBlocked('hourly_cap', `Tope por hora del agente alcanzado (${maxPerHour} llamadas).`);
  }
  if (attemptsCustomer >= MAX_ATTEMPTS_PER_CUSTOMER_PER_DAY) {
    throw new VoiceDispatchBlocked(
      'customer_cap',
      `Ya se intentó llamar a este cliente ${attemptsCustomer} veces hoy con este agente.`
    );
  }
  if (inProgressNow >= orgSettings.maxConcurrentCalls) {
    throw new VoiceDispatchBlocked(
      'concurrency',
      `Hay ${inProgressNow} llamadas del agente en curso (máximo ${orgSettings.maxConcurrentCalls}).`
    );
  }
  if (!isWithinSchedule(businessHours, agentTimezone)) {
    throw new VoiceDispatchBlocked('agent_schedule', 'Fuera del horario configurado para este agente.');
  }

  const stageAgentId = stageId ? await findStageAgentId(supabase, orgId, stageId) : null;

  // R3-9: si ya había una fila `pending` esperando (la que dejó un `dial_now:
  // false` anterior), se marca ESA. Solo se crea fila nueva si no hay ninguna.
  const created = reutilizable
    ? ({ id: reutilizable.id } as VoiceAgentCall)
    : (unwrap(
        'dispatchAgentCall.insert',
        await supabase
          .from('voice_agent_calls')
          .insert({
            organization_id: orgId,
            voice_agent_id: input.voiceAgentId,
            customer_id: customerId,
            opportunity_id: input.opportunityId ?? null,
            stage_agent_id: stageAgentId,
            status: 'pending',
            scheduled_at: new Date().toISOString(),
          })
          .select('*')
          .single()
      ) as VoiceAgentCall);

  if (input.dialNow === false) {
    // Queda `pending`: la reclama y la marca el siguiente despacho de este
    // agente para este cliente (manual o el job `ai_call` del disparo por
    // etapa), que la REUTILIZA en vez de crear otra.
    return { voice_agent_call_id: created.id, dialed: false, reason: 'en cola' };
  }

  const { client, fromNumber } = await getTwilioClientForOrg(orgId, supabase);
  const recording = orgSettings;

  // Reserva ATÓMICA de la fila suelta con la misma semántica que la cola de
  // campañas (`FOR UPDATE SKIP LOCKED` + `attempts+1` + fila en el libro de
  // intentos). Antes era un UPDATE condicional que no dejaba rastro del intento.
  const claimRes = await supabase.rpc('fn_claim_voice_agent_call_one', {
    p_org: orgId,
    p_call: created.id,
    p_worker: 'manual-dispatch',
  });
  if (claimRes.error) throw new VoiceAgentDbError('fn_claim_voice_agent_call_one', claimRes.error);
  const reserved = ((claimRes.data || []) as VoiceAgentCall[])[0] ?? null;

  if (!reserved) return { voice_agent_call_id: created.id, dialed: false, reason: 'ya reservada' };

  const outcome = await dialClaimedCall({
    supabase,
    orgId,
    campaign: {
      id: '',
      organization_id: orgId,
      voice_agent_id: input.voiceAgentId,
    } as VoiceAgentCampaign,
    vac: reserved,
    twilioClient: client,
    fromNumber,
    webhookBase: getWebhookBaseUrl(),
    recording,
  });

  return { voice_agent_call_id: created.id, dialed: outcome.initiated, reason: outcome.reason };
}

// ─── Helper: Twilio client ───────────────────────────────────────────────────

async function getTwilioClientForOrg(
  orgId: number,
  supabase: SupabaseClient
): Promise<{
  client: { calls: { create: (opts: Record<string, unknown>) => Promise<{ sid: string }> } };
  fromNumber: string;
}> {
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
    const fromNumber = provider.credentials.TWILIO_PHONE_NUMBER || getMasterPhoneNumber();
    return {
      client: client as unknown as DialParams['twilioClient'],
      fromNumber,
    };
  }

  const client = getMasterClient();
  const fromNumber = (provider.credentials.TWILIO_PHONE_NUMBER as string) || getMasterPhoneNumber();
  return { client: client as unknown as DialParams['twilioClient'], fromNumber };
}
