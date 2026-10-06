/**
 * Call Management Service — CRUD para llamadas, grabaciones y números telefónicos.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Tablas: calls, call_recordings, phone_numbers
 * Todas las funciones reciben `supabase` y `organizationId` para garantizar
 * aislamiento por organización (multi-tenant).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Tipos: calls ────────────────────────────────────────────────────────────
// F3: uniones alineadas con los CHECK de BD (C3) — fuente única `@/lib/crm/enums`.

import {
  type CallDirection,
  type CallMode,
  type CallStatus,
  type BridgeMode,
  type DurationSource,
  type RecordingStatus,
} from '@/lib/crm/enums';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';

export type { CallDirection, CallMode, CallStatus, BridgeMode, DurationSource, RecordingStatus };
export type AnsweredBy = 'human' | 'machine' | 'fax' | 'unknown';

export interface CallRecord {
  id: string;
  organization_id: number;
  provider: string;
  provider_call_sid: string | null;
  parent_call_sid: string | null;
  direction: CallDirection;
  mode: CallMode;
  from_number: string;
  to_number: string;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  voice_agent_id: string | null;
  status: CallStatus;
  answered_by: AnsweredBy | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ring_seconds: number | null;
  recording_enabled: boolean;
  consent_given: boolean;
  cost_amount: number | null;
  cost_currency: string | null;
  metadata: Record<string, unknown>;
  bridge_mode: BridgeMode | null;
  agent_leg_sid: string | null;
  customer_leg_sid: string | null;
  duration_source: DurationSource;
  created_at: string;
  updated_at: string;
}

export interface CallCreateInput {
  provider: string;
  provider_call_sid?: string | null;
  parent_call_sid?: string | null;
  direction: CallDirection;
  mode?: CallMode;
  from_number: string;
  to_number: string;
  customer_id?: string | null;
  opportunity_id?: string | null;
  user_id?: string | null;
  voice_agent_id?: string | null;
  status?: CallStatus;
  answered_by?: AnsweredBy | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  ring_seconds?: number | null;
  recording_enabled?: boolean;
  consent_given?: boolean;
  cost_amount?: number | null;
  cost_currency?: string | null;
  metadata?: Record<string, unknown>;
  bridge_mode?: BridgeMode | null;
  agent_leg_sid?: string | null;
  customer_leg_sid?: string | null;
  duration_source?: DurationSource | null;
}

export interface CallUpdateInput {
  status?: CallStatus;
  answered_by?: AnsweredBy | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  ring_seconds?: number | null;
  recording_enabled?: boolean;
  consent_given?: boolean;
  cost_amount?: number | null;
  cost_currency?: string | null;
  metadata?: Record<string, unknown>;
  bridge_mode?: BridgeMode | null;
  agent_leg_sid?: string | null;
  customer_leg_sid?: string | null;
  duration_source?: DurationSource | null;
}

export interface CallFilters {
  status?: CallStatus;
  direction?: CallDirection;
  mode?: CallMode;
  customer_id?: string;
  user_id?: string;
  opportunity_id?: string;
  provider_call_sid?: string;
  /** metadata.disposition_outcome */
  outcome?: string;
  has_recording?: boolean;
  /**
   * Búsqueda en número, nombre del cliente y TRANSCRIPCIÓN completada
   * (`crm_calls_list`: `websearch_to_tsquery` sobre `call_transcripts.full_text`).
   */
  q?: string;
  from_date?: string;
  to_date?: string;
  /** `to_date` es el inicio del día siguiente (lo pone `normalizarFechasLlamadas`). */
  to_date_exclusive?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Tipos: call_recordings ──────────────────────────────────────────────────

export interface CallRecording {
  id: string;
  organization_id: number;
  call_id: string;
  provider_recording_sid: string | null;
  /** Texto en BD ('1' | '2'). */
  channels: string;
  duration_seconds: number | null;
  storage_path: string;
  storage_provider: string;
  size_bytes: number | null;
  status: RecordingStatus;
  retention_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRecordingCreateInput {
  call_id: string;
  provider_recording_sid?: string | null;
  channels?: string | number | null;
  duration_seconds?: number | null;
  storage_path: string;
  storage_provider?: string | null;
  size_bytes?: number | null;
  status?: RecordingStatus;
  retention_until?: string | null;
}

export interface CallRecordingUpdateInput {
  provider_recording_sid?: string | null;
  channels?: string | number | null;
  duration_seconds?: number | null;
  storage_path?: string | null;
  storage_provider?: string | null;
  size_bytes?: number | null;
  status?: RecordingStatus;
  retention_until?: string | null;
}

// ─── Tipos: phone_numbers ────────────────────────────────────────────────────

export interface PhoneNumber {
  id: string;
  organization_id: number;
  e164: string;
  provider: string;
  provider_sid: string | null;
  capabilities: Record<string, unknown>;
  assigned_user_id: string | null;
  label: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PhoneNumberCreateInput {
  e164: string;
  provider: string;
  provider_sid?: string | null;
  capabilities?: Record<string, unknown>;
  assigned_user_id?: string | null;
  label?: string | null;
  is_primary?: boolean;
  is_active?: boolean;
}

export interface PhoneNumberUpdateInput {
  e164?: string;
  provider?: string;
  provider_sid?: string | null;
  capabilities?: Record<string, unknown>;
  assigned_user_id?: string | null;
  label?: string | null;
  is_primary?: boolean;
  is_active?: boolean;
}

// ─── Funciones: calls ────────────────────────────────────────────────────────

/**
 * Lista llamadas de una organización con filtros opcionales.
 */
export async function getCalls(
  organizationId: number,
  supabase: SupabaseClient,
  filters?: CallFilters
): Promise<{ data: CallRecord[]; count: number }> {
  let query = supabase
    .from('calls')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false, nullsFirst: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.direction) {
    query = query.eq('direction', filters.direction);
  }
  if (filters?.customer_id) {
    query = query.eq('customer_id', filters.customer_id);
  }
  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters?.opportunity_id) {
    query = query.eq('opportunity_id', filters.opportunity_id);
  }
  if (filters?.mode) {
    query = query.eq('mode', filters.mode);
  }
  if (filters?.provider_call_sid) {
    query = query.eq('provider_call_sid', filters.provider_call_sid);
  }
  if (filters?.outcome) {
    query = query.eq('metadata->>disposition_outcome', filters.outcome);
  }
  if (filters?.q) {
    const filter = ilikeAnyOf(['to_number', 'from_number'], filters.q);
    if (filter) query = query.or(filter);
  }
  if (filters?.from_date) {
    query = query.gte('started_at', filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte('started_at', filters.to_date);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[callManagementService.getCalls] error:', error.message);
    return { data: [], count: 0 };
  }

  return {
    data: (data || []) as CallRecord[],
    count: count || 0,
  };
}

/**
 * Obtiene una llamada por ID verificando que pertenezca a la organización.
 */
export async function getCall(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<CallRecord | null> {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[callManagementService.getCall] error:', error.message);
    return null;
  }

  return data as CallRecord | null;
}

/**
 * Crea un registro de llamada.
 */
export async function createCall(
  organizationId: number,
  data: CallCreateInput,
  supabase: SupabaseClient
): Promise<CallRecord | null> {
  const { data: record, error } = await supabase
    .from('calls')
    .insert({
      organization_id: organizationId,
      provider: data.provider,
      provider_call_sid: data.provider_call_sid ?? null,
      parent_call_sid: data.parent_call_sid ?? null,
      direction: data.direction,
      mode: data.mode ?? 'browser',
      from_number: data.from_number,
      to_number: data.to_number,
      customer_id: data.customer_id ?? null,
      opportunity_id: data.opportunity_id ?? null,
      user_id: data.user_id ?? null,
      voice_agent_id: data.voice_agent_id ?? null,
      status: data.status ?? 'dialing',
      answered_by: data.answered_by ?? null,
      started_at: data.started_at ?? new Date().toISOString(),
      answered_at: data.answered_at ?? null,
      ended_at: data.ended_at ?? null,
      duration_seconds: data.duration_seconds ?? null,
      ring_seconds: data.ring_seconds ?? null,
      recording_enabled: data.recording_enabled ?? false,
      consent_given: data.consent_given ?? false,
      cost_amount: data.cost_amount ?? null,
      cost_currency: data.cost_currency ?? 'USD',
      metadata: data.metadata ?? {},
      bridge_mode: data.bridge_mode ?? null,
      agent_leg_sid: data.agent_leg_sid ?? null,
      customer_leg_sid: data.customer_leg_sid ?? null,
      duration_source: data.duration_source ?? 'provider',
    })
    .select()
    .single();

  if (error) {
    console.error('[callManagementService.createCall] error:', error.message);
    throw error;
  }

  return record as CallRecord;
}

/**
 * Actualiza una llamada existente (status, duration, etc.).
 */
export async function updateCall(
  id: string,
  organizationId: number,
  data: CallUpdateInput,
  supabase: SupabaseClient
): Promise<CallRecord | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.status !== undefined) updateData.status = data.status;
  if (data.answered_by !== undefined) updateData.answered_by = data.answered_by;
  if (data.started_at !== undefined) updateData.started_at = data.started_at;
  if (data.answered_at !== undefined) updateData.answered_at = data.answered_at;
  if (data.ended_at !== undefined) updateData.ended_at = data.ended_at;
  if (data.duration_seconds !== undefined) updateData.duration_seconds = data.duration_seconds;
  if (data.ring_seconds !== undefined) updateData.ring_seconds = data.ring_seconds;
  if (data.recording_enabled !== undefined) updateData.recording_enabled = data.recording_enabled;
  if (data.consent_given !== undefined) updateData.consent_given = data.consent_given;
  if (data.cost_amount !== undefined) updateData.cost_amount = data.cost_amount;
  if (data.cost_currency !== undefined) updateData.cost_currency = data.cost_currency;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;
  if (data.bridge_mode !== undefined) updateData.bridge_mode = data.bridge_mode;
  if (data.agent_leg_sid !== undefined) updateData.agent_leg_sid = data.agent_leg_sid;
  if (data.customer_leg_sid !== undefined) updateData.customer_leg_sid = data.customer_leg_sid;
  if (data.duration_source !== undefined) updateData.duration_source = data.duration_source;

  const { data: record, error } = await supabase
    .from('calls')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[callManagementService.updateCall] error:', error.message);
    throw error;
  }

  return record as CallRecord | null;
}

// ─── Funciones: call_recordings ──────────────────────────────────────────────

/**
 * Lista las grabaciones de una llamada específica.
 */
export async function getCallRecordings(
  callId: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<CallRecording[]> {
  const { data, error } = await supabase
    .from('call_recordings')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[callManagementService.getCallRecordings] error:', error.message);
    return [];
  }

  return (data || []) as CallRecording[];
}

/**
 * Crea un registro de grabación asociado a una llamada.
 */
export async function createCallRecording(
  organizationId: number,
  data: CallRecordingCreateInput,
  supabase: SupabaseClient
): Promise<CallRecording | null> {
  const { data: record, error } = await supabase
    .from('call_recordings')
    .insert({
      organization_id: organizationId,
      call_id: data.call_id,
      provider_recording_sid: data.provider_recording_sid ?? null,
      channels: data.channels === null || data.channels === undefined ? '1' : String(data.channels),
      duration_seconds: data.duration_seconds ?? null,
      storage_path: data.storage_path,
      storage_provider: data.storage_provider ?? 'twilio',
      size_bytes: data.size_bytes ?? null,
      status: data.status ?? 'processing',
      retention_until: data.retention_until ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[callManagementService.createCallRecording] error:', error.message);
    throw error;
  }

  return record as CallRecording;
}

/**
 * Actualiza el estado o metadatos de una grabación.
 */
export async function updateCallRecording(
  id: string,
  organizationId: number,
  data: CallRecordingUpdateInput,
  supabase: SupabaseClient
): Promise<CallRecording | null> {
  // F3 (C5): `updated_at` lo pone el trigger `set_call_recordings_updated_at`; no se escribe a mano.
  const updateData: Record<string, unknown> = {};

  if (data.provider_recording_sid !== undefined) updateData.provider_recording_sid = data.provider_recording_sid;
  if (data.channels !== undefined && data.channels !== null) updateData.channels = String(data.channels);
  if (data.duration_seconds !== undefined) updateData.duration_seconds = data.duration_seconds;
  if (data.storage_path !== undefined) updateData.storage_path = data.storage_path;
  if (data.storage_provider !== undefined) updateData.storage_provider = data.storage_provider;
  if (data.size_bytes !== undefined) updateData.size_bytes = data.size_bytes;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.retention_until !== undefined) updateData.retention_until = data.retention_until;

  const { data: record, error } = await supabase
    .from('call_recordings')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[callManagementService.updateCallRecording] error:', error.message);
    throw error;
  }

  return record as CallRecording | null;
}

// ─── Funciones: phone_numbers ────────────────────────────────────────────────

/**
 * Lista los números telefónicos de una organización.
 */
export async function getPhoneNumbers(
  organizationId: number,
  supabase: SupabaseClient
): Promise<PhoneNumber[]> {
  const { data, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('is_primary', { ascending: false })
    .order('label', { ascending: true });

  if (error) {
    console.error('[callManagementService.getPhoneNumbers] error:', error.message);
    return [];
  }

  return (data || []) as PhoneNumber[];
}

/**
 * Registra un número telefónico para una organización.
 */
export async function createPhoneNumber(
  organizationId: number,
  data: PhoneNumberCreateInput,
  supabase: SupabaseClient
): Promise<PhoneNumber | null> {
  const { data: record, error } = await supabase
    .from('phone_numbers')
    .insert({
      organization_id: organizationId,
      e164: data.e164,
      provider: data.provider,
      provider_sid: data.provider_sid ?? null,
      capabilities: data.capabilities ?? {},
      assigned_user_id: data.assigned_user_id ?? null,
      label: data.label ?? null,
      is_primary: data.is_primary ?? false,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('[callManagementService.createPhoneNumber] error:', error.message);
    throw error;
  }

  return record as PhoneNumber;
}

/**
 * Actualiza un número telefónico existente.
 */
export async function updatePhoneNumber(
  id: string,
  organizationId: number,
  data: PhoneNumberUpdateInput,
  supabase: SupabaseClient
): Promise<PhoneNumber | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.e164 !== undefined) updateData.e164 = data.e164;
  if (data.provider !== undefined) updateData.provider = data.provider;
  if (data.provider_sid !== undefined) updateData.provider_sid = data.provider_sid;
  if (data.capabilities !== undefined) updateData.capabilities = data.capabilities;
  if (data.assigned_user_id !== undefined) updateData.assigned_user_id = data.assigned_user_id;
  if (data.label !== undefined) updateData.label = data.label;
  if (data.is_primary !== undefined) updateData.is_primary = data.is_primary;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: record, error } = await supabase
    .from('phone_numbers')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[callManagementService.updatePhoneNumber] error:', error.message);
    throw error;
  }

  return record as PhoneNumber | null;
}

/**
 * Elimina un número telefónico de una organización.
 */
export async function deletePhoneNumber(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('phone_numbers')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) {
    console.error('[callManagementService.deletePhoneNumber] error:', error.message);
    throw error;
  }
}

// ─── F3: listado con relaciones (tabla de llamadas) ──────────────────────────

export interface CallListRow extends CallRecord {
  customer: { id: string; full_name: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
  opportunity: { id: string; name: string } | null;
  user: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
  recordings: { id: string; status: RecordingStatus; duration_seconds: number | null; channels: string }[];
  disposition_outcome: string | null;
  /**
   * `call_consents.method` de la acta de grabación (F-4, ronda 7 de voz):
   * `unverified_announcement` = grabación sin aviso acreditado; la UI la marca.
   * `null` sin acta.
   */
  consent_method: string | null;
  /**
   * Sentimiento del análisis IA más reciente (`call_analyses.sentiment`:
   * positive · neutral · negative · mixed), columna «Sentimiento» del Figma
   * 1351:18. `null` sin análisis.
   */
  sentiment: CallSentiment | null;
}

export type CallSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

/** El análisis más reciente de una llamada (una llamada puede re-analizarse). */
export function sentimientoReciente(analisis: readonly { sentiment: string | null; created_at: string | null }[] | null | undefined): CallSentiment | null {
  let mejor: { sentiment: string | null; created_at: string | null } | null = null;
  for (const a of analisis ?? []) {
    if (!a.sentiment) continue;
    if (!mejor || (a.created_at ?? '') > (mejor.created_at ?? '')) mejor = a;
  }
  const s = mejor?.sentiment;
  return s === 'positive' || s === 'neutral' || s === 'negative' || s === 'mixed' ? s : null;
}

/** Cifras del MISMO ámbito que el listado (filtros, permiso y sucursal), calculadas en la base. */
export interface CallsListStats {
  /** Llamadas en el ámbito filtrado (el nombre viene de la RPC; no es solo «hoy»). */
  totalToday: number;
  /** Duración media (s) de las contestadas por una persona. */
  avgDuration: number;
  missed: number;
  /** Contestadas por una persona (`answered_by = 'human'`). */
  answered: number;
  /** Segundos de voz de las completadas que no son registro manual. */
  voiceSeconds: number;
  /** `comm_settings.voice_minutes_remaining`; `null` = ilimitado. */
  remainingVoiceMinutes: number | null;
  voiceConfigured: boolean;
}

export interface CallsListResult {
  data: CallListRow[];
  count: number;
  stats: CallsListStats;
  /** El servidor resolvió `crm.calls.view_all`: sin él solo ves las tuyas. */
  canViewAll: boolean;
}

type FilaRpcLlamada = CallRecord & {
  customer?: CallListRow['customer'];
  opportunity?: CallListRow['opportunity'];
  user?: CallListRow['user'];
  recordings?: CallListRow['recordings'] | null;
  analysis?: { sentiment?: string | null } | null;
  consent_method?: string | null;
  disposition_outcome?: string | null;
};

/** Fila de `crm_calls_list` → `CallListRow` (sin grabaciones borradas). */
export function filaDeListadoLlamadas(r: FilaRpcLlamada): CallListRow {
  const { customer, opportunity, user, recordings, analysis, consent_method, disposition_outcome, ...rest } = r;
  return {
    ...(rest as CallRecord),
    customer: customer ?? null,
    opportunity: opportunity ?? null,
    user: user ?? null,
    recordings: (recordings ?? []).filter((x) => x.status !== 'deleted'),
    disposition_outcome: disposition_outcome ?? (r.metadata?.disposition_outcome as string | undefined) ?? null,
    consent_method: consent_method ?? null,
    sentiment: sentimientoReciente(analysis ? [{ sentiment: analysis.sentiment ?? null, created_at: null }] : null),
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Lista llamadas con cliente, oportunidad, usuario, grabaciones, sentimiento y
 * cifras, en UNA consulta: la RPC `crm_calls_list` (migraciones
 * 20260930220920 y 20261002152633, aplicadas). Ella resuelve en la base:
 *  - la organización (`fn_assert_acceso_org`) y la pertenencia activa;
 *  - `crm.calls.view_all`: sin ese permiso solo devuelve las del usuario y
 *    rechaza con 42501 si se pide la de otro (`sin_permiso`);
 *  - el alcance por sucursal del cliente y de la oportunidad;
 *  - la búsqueda `q` en número, nombre del cliente y TRANSCRIPCIÓN.
 * Lanza el error de PostgREST tal cual: la ruta lo traduce con `respuestaErrorCrm`.
 */
export async function listCallsWithRelations(
  organizationId: number,
  supabase: SupabaseClient,
  filters?: CallFilters
): Promise<CallsListResult> {
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters ?? {})) if (v !== undefined && v !== null && v !== '') p[k] = v;
  const { data, error } = await supabase.rpc('crm_calls_list', { p_org: organizationId, p_filters: p });
  if (error) throw error;
  const raw = (data ?? {}) as { data?: FilaRpcLlamada[]; count?: number; stats?: Partial<CallsListStats>; canViewAll?: boolean };
  const s = raw.stats ?? {};
  return {
    data: (raw.data ?? []).map(filaDeListadoLlamadas),
    count: num(raw.count),
    stats: {
      totalToday: num(s.totalToday),
      avgDuration: num(s.avgDuration),
      missed: num(s.missed),
      answered: num(s.answered),
      voiceSeconds: num(s.voiceSeconds),
      remainingVoiceMinutes: s.remainingVoiceMinutes === null || s.remainingVoiceMinutes === undefined ? null : num(s.remainingVoiceMinutes),
      voiceConfigured: s.voiceConfigured === true,
    },
    canViewAll: raw.canViewAll === true,
  };
}
