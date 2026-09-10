/**
 * Mobile Bridge Service — FASE-05: "Llamar desde mi celular" (bridge de 2 patas).
 * GO Admin ERP
 *
 * Flujo (ruta A, §2.1):
 *   1. `initiateBridge` reserva créditos, crea UNA fila `calls` (`mode='bridge'`)
 *      y su `mobile_call_bridges` enlazado por `call_id`, y pide a Twilio que
 *      llame al celular VERIFICADO del vendedor.
 *   2. `twiml/agent-leg` reproduce el whisper y ofrece 1 conectar / 2 cancelar.
 *   3. `twiml/customer-leg` marca al cliente con `<Dial action=dial-complete>` y
 *      `<Number statusCallback url=consent-whisper>`.
 *   4. `bridge/status` correlaciona ambas patas; `/api/voice/dial-complete` (F3)
 *      fija el desenlace, la duración conversada, los créditos y la actividad.
 *
 * Invariantes (ronda 1, defectos B1/B2/A2/A4 del informe TEST-F5):
 * - El celular del vendedor NUNCA llega en el body: sale de
 *   `user_comm_preferences.mobile_phone_e164` con `mobile_verified_at`.
 * - NINGÚN `{error}` de Supabase se ignora: si el INSERT de `calls` falla, el
 *   bridge no se inicia y los créditos se devuelven.
 * - Los créditos se reservan ANTES de llamar al proveedor (D6) y se reembolsan
 *   si la llamada nunca llega a marcar al cliente.
 * - `customer_id`/`opportunity_id` se validan contra la organización.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getTelephonySettings,
  getTwilioClientForOrg,
  pickCallerId,
  filterOrgOwnedRefs,
  VoiceNotConfiguredError,
} from './voiceContextService';
import { reserveVoiceMinutes, refundVoiceMinutes } from './callCreditsService';
import { isBridgeSigningConfigured, signBridgeToken } from './bridgeTokens';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import type { CallStatus } from '@/lib/crm/enums';
import {
  ACTIVE_BRIDGE_STATUSES,
  BRIDGE_RESERVED_MINUTES,
  BridgeError,
  customerLegNeverDialed,
  isTerminalBridgeStatus,
  maskPhone,
  normalizeE164,
  type BridgeStatus,
  type BridgeFilters,
  type InitiateBridgeInput,
  type InitiateBridgeResult,
  type MobileCallBridge,
} from './bridgeState';

// ─── Tipos y máquina de estados (puros, en `bridgeState.ts`) ────────────────

export type {
  BridgeStatus,
  MobileCallBridge,
  InitiateBridgeInput,
  InitiateBridgeResult,
  BridgeFilters,
  WhisperParams,
  BridgeLegEvent,
} from './bridgeState';
export {
  TERMINAL_BRIDGE_STATUSES,
  ACTIVE_BRIDGE_STATUSES,
  isTerminalBridgeStatus,
  BridgeError,
  BRIDGE_RESERVED_MINUTES,
  normalizeE164,
  maskPhone,
  buildWhisper,
  applyAgentLegEvent,
  applyCustomerLegEvent,
  customerLegNeverDialed,
} from './bridgeState';

export interface BridgeContext {
  organizationId: number;
  userId: string;
  supabase: SupabaseClient;
}

const MAX_WHISPER_LENGTH = 200;

// ─── Lecturas ────────────────────────────────────────────────────────────────

export interface BridgeSettings {
  /** `comm_settings.voice_bridge_confirm_digit` (por defecto true). */
  confirmDigit: boolean;
  /** `comm_settings.voice_bridge_agent_timeout` (10–60 s, 25 por defecto). */
  agentTimeout: number;
  /** `comm_settings.voice_mobile_ivr_enabled` (variante §2.3, apagada por defecto). */
  ivrEnabled: boolean;
}

/**
 * Ajustes del bridge por organización (migración `crm_v4_f05_bridges_call_link`).
 * Se leen aquí y no en `getTelephonySettings` (F3) para no tocar un archivo de
 * otra fase; si la fila no existe se usan los valores por defecto del CHECK.
 */
export async function getBridgeSettings(orgId: number, client: SupabaseClient): Promise<BridgeSettings> {
  const { data, error } = await client
    .from('comm_settings')
    .select('voice_bridge_confirm_digit, voice_bridge_agent_timeout, voice_mobile_ivr_enabled')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();
  if (error) console.error('[mobileBridge] getBridgeSettings:', error.message);
  const row = (data ?? {}) as {
    voice_bridge_confirm_digit?: boolean | null;
    voice_bridge_agent_timeout?: number | null;
    voice_mobile_ivr_enabled?: boolean | null;
  };
  return {
    confirmDigit: row.voice_bridge_confirm_digit ?? true,
    agentTimeout: clampAgentTimeout(row.voice_bridge_agent_timeout),
    ivrEnabled: row.voice_mobile_ivr_enabled ?? false,
  };
}

/** Celular del vendedor: solo si está verificado por OTP y es de ESTA org (§0.2). */
export async function getVerifiedMobile(
  userId: string,
  orgId: number,
  client: SupabaseClient
): Promise<string | null> {
  const { data, error } = await client
    .from('user_comm_preferences')
    .select('mobile_phone_e164, mobile_verified_at')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) {
    console.error('[mobileBridge] getVerifiedMobile:', error.message);
    return null; // fail-closed
  }
  const row = data as { mobile_phone_e164?: string | null; mobile_verified_at?: string | null } | null;
  if (!row?.mobile_phone_e164 || !row.mobile_verified_at) return null;
  return normalizeE164(row.mobile_phone_e164);
}

/** Bridge activo del usuario (1 por vendedor, §8). */
export async function getActiveBridgeForUser(
  orgId: number,
  userId: string,
  client: SupabaseClient
): Promise<MobileCallBridge | null> {
  const { data, error } = await client
    .from('mobile_call_bridges')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .in('status', ACTIVE_BRIDGE_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[mobileBridge] getActiveBridgeForUser:', error.message);
    throw new BridgeError('BRIDGE_LOOKUP_FAILED', 500, error.message);
  }
  return (data as MobileCallBridge) || null;
}

export async function getBridge(
  id: string,
  orgId: number,
  client: SupabaseClient
): Promise<MobileCallBridge | null> {
  const { data, error } = await client
    .from('mobile_call_bridges')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) {
    console.error('[mobileBridge] getBridge:', error.message);
    return null;
  }
  return (data as MobileCallBridge) || null;
}

export async function getBridges(
  orgId: number,
  client: SupabaseClient,
  filters?: BridgeFilters
): Promise<MobileCallBridge[]> {
  let query = client.from('mobile_call_bridges').select('*').eq('organization_id', orgId);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.user_id) query = query.eq('user_id', filters.user_id);
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id);
  query = query.order('created_at', { ascending: false });
  if (filters?.limit) {
    query = query.limit(filters.limit);
    if (filters.offset) query = query.range(filters.offset, filters.offset + filters.limit - 1);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[mobileBridge] getBridges:', error.message);
    throw new BridgeError('BRIDGE_LOOKUP_FAILED', 500, error.message);
  }
  return (data || []) as MobileCallBridge[];
}

// ─── Inicio del bridge ───────────────────────────────────────────────────────

export async function initiateBridge(
  ctx: BridgeContext,
  input: InitiateBridgeInput
): Promise<InitiateBridgeResult> {
  const { organizationId: orgId, userId, supabase } = ctx;

  // 1. Destino válido (nunca se "adivina" un E.164)
  const targetPhone = normalizeE164(input.to);
  if (!targetPhone) throw new BridgeError('INVALID_PHONE', 400, 'Número de destino inválido (formato E.164)');

  // 2. Celular del vendedor: SOLO desde user_comm_preferences verificado
  const agentPhone = await getVerifiedMobile(userId, orgId, supabase);
  if (!agentPhone) {
    throw new BridgeError('MOBILE_NOT_VERIFIED', 409, 'Verifica tu celular antes de llamar desde él');
  }
  if (agentPhone === targetPhone) {
    throw new BridgeError('SAME_NUMBER', 400, 'El número del cliente es tu propio celular');
  }

  // 3. Un solo bridge activo por vendedor
  const active = await getActiveBridgeForUser(orgId, userId, supabase);
  if (active) {
    throw new BridgeError('BRIDGE_IN_PROGRESS', 409, 'Ya tienes una llamada en curso desde tu celular');
  }

  // 4. Los ids ajenos a la organización no entran en la fila (M3)
  const refs = await filterOrgOwnedRefs(
    orgId,
    { customerId: input.customerId ?? null, opportunityId: input.opportunityId ?? null },
    supabase
  );

  // 5. Contexto de telefonía de la org (nunca el número global de la plataforma)
  const settings = await getTelephonySettings(orgId);
  const bridgeSettings = await getBridgeSettings(orgId, supabase);
  const picked = await pickCallerId(orgId, settings);
  if (!picked.e164 || picked.source === 'platform') {
    throw new BridgeError(
      'CALLER_ID_NOT_CONFIGURED',
      409,
      'Configura el caller id de la organización antes de llamar'
    );
  }
  const callerId = picked.e164;

  // 6. Sin secreto de firma no se marca (los callbacks serían inverificables)
  if (!isBridgeSigningConfigured()) {
    throw new BridgeError('VOICE_CALLBACK_SECRET_MISSING', 503, 'Falta configurar VOICE_CALLBACK_SECRET');
  }
  const origin = getTwilioWebhookOrigin();

  // 7. Créditos ANTES del proveedor (D6): 1 minuto por pata
  const reserved = await reserveVoiceMinutes(orgId, BRIDGE_RESERVED_MINUTES, supabase);
  if (!reserved) throw new BridgeError('NO_CREDITS', 402, 'Sin minutos de voz disponibles');

  const nowIso = new Date().toISOString();
  const recordingEnabled = Boolean(settings.voice_recording_enabled);
  const confirmDigit = bridgeSettings.confirmDigit;

  // 8. UNA fila `calls` por conversación (§0.4). Columnas verificadas contra el
  //    esquema real: `phone_number` NO existe; `mode/from_number/to_number` son
  //    NOT NULL sin default.
  const { data: callRow, error: callError } = await supabase
    .from('calls')
    .insert({
      organization_id: orgId,
      user_id: userId,
      customer_id: refs.customerId,
      opportunity_id: refs.opportunityId,
      provider: 'twilio',
      direction: 'outbound',
      mode: 'bridge',
      bridge_mode: 'agent_leg',
      status: 'dialing' as CallStatus,
      from_number: callerId,
      to_number: targetPhone,
      started_at: nowIso,
      recording_enabled: recordingEnabled,
      consent_given: false,
      duration_source: 'provider',
      metadata: {
        agent_phone_masked: maskPhone(agentPhone),
        caller_id_source: picked.source,
        credits_reserved_min: BRIDGE_RESERVED_MINUTES,
        ...(refs.rejected.length ? { rejected_refs: refs.rejected } : {}),
      },
    })
    .select('id')
    .single();

  if (callError || !callRow) {
    // El error del cliente de Supabase NO se ignora: sin fila `calls` no hay
    // grabación, ni transcripción, ni actividad en la oportunidad.
    await refundVoiceMinutes(orgId, BRIDGE_RESERVED_MINUTES, supabase);
    throw new BridgeError('CALL_INSERT_FAILED', 500, `No se pudo registrar la llamada: ${callError?.message ?? 'desconocido'}`);
  }
  const callId = (callRow as { id: string }).id;

  // 9. Bridge enlazado a esa fila
  const whisperText = (input.whisper ?? '').trim().slice(0, MAX_WHISPER_LENGTH) || null;
  const { data: bridgeRow, error: bridgeError } = await supabase
    .from('mobile_call_bridges')
    .insert({
      organization_id: orgId,
      user_id: userId,
      agent_phone: agentPhone,
      target_phone: targetPhone,
      customer_id: refs.customerId,
      opportunity_id: refs.opportunityId,
      call_id: callId,
      status: 'initiating' as BridgeStatus,
      confirm_digit_required: confirmDigit,
      whisper_text: whisperText,
    })
    .select('*')
    .single();

  if (bridgeError || !bridgeRow) {
    await markCallFailed(supabase, orgId, callId, `bridge_insert: ${bridgeError?.message ?? 'desconocido'}`);
    await refundVoiceMinutes(orgId, BRIDGE_RESERVED_MINUTES, supabase);
    throw new BridgeError('BRIDGE_INSERT_FAILED', 500, `No se pudo crear el bridge: ${bridgeError?.message ?? 'desconocido'}`);
  }
  const bridge = bridgeRow as MobileCallBridge;

  // 10. Consentimiento: el texto exacto que oirá el cliente queda registrado
  //     ANTES de marcar (D9); `twiml/consent-whisper` (F3) lo lee y marca
  //     `calls.consent_given`.
  if (recordingEnabled) {
    const { error: consentError } = await supabase.from('call_consents').insert({
      organization_id: orgId,
      call_id: callId,
      consent_type: 'recording',
      method: 'voice_announcement',
      locale: 'es-MX',
      recorded_announcement_text: settings.voice_consent_message,
    });
    if (consentError) console.error('[mobileBridge] call_consents insert:', consentError.message);
  }

  // 11. Llamada al vendedor
  const token = signBridgeToken(bridge.id);
  const q = `bridgeId=${encodeURIComponent(bridge.id)}&t=${token}`;
  let agentLegSid: string;
  try {
    const { client } = await getTwilioClientForOrg(orgId);
    const call = await client.calls.create({
      to: agentPhone,
      from: callerId,
      url: `${origin}/api/voice/twiml/agent-leg?${q}`,
      method: 'POST',
      statusCallback: `${origin}/api/voice/bridge/status?${q}&leg=agent`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: bridgeSettings.agentTimeout,
    });
    agentLegSid = call.sid;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    await updateBridgeRow(supabase, orgId, bridge.id, { status: 'failed', last_error: message.slice(0, 500) });
    await markCallFailed(supabase, orgId, callId, message);
    await refundVoiceMinutes(orgId, BRIDGE_RESERVED_MINUTES, supabase);
    if (err instanceof VoiceNotConfiguredError) {
      throw new BridgeError('VOICE_NOT_CONFIGURED', 409, err.message);
    }
    throw new BridgeError('PROVIDER_ERROR', 502, `No se pudo llamar a tu celular: ${message}`);
  }

  // 12. Correlación: sin `provider_call_sid` la grabación de F3 no encuentra la
  //     llamada, así que un fallo aquí se registra (no se traga) en `last_error`.
  const { error: callUpdateError } = await supabase
    .from('calls')
    .update({ provider_call_sid: agentLegSid, agent_leg_sid: agentLegSid })
    .eq('id', callId)
    .eq('organization_id', orgId);
  if (callUpdateError) {
    console.error('[mobileBridge] calls.provider_call_sid:', callUpdateError.message);
  }

  const { error: bridgeUpdateError } = await updateBridgeRow(supabase, orgId, bridge.id, {
    agent_leg_sid: agentLegSid,
    status: 'agent_ringing',
    ...(callUpdateError ? { last_error: `calls_update: ${callUpdateError.message}`.slice(0, 500) } : {}),
  });
  if (bridgeUpdateError) console.error('[mobileBridge] bridge agent_leg_sid:', bridgeUpdateError.message);

  bridge.agent_leg_sid = agentLegSid;
  bridge.status = 'agent_ringing';
  bridge.call_id = callId;

  return { bridge, callId, agentLegSid, agentPhoneMasked: maskPhone(agentPhone) };
}

function clampAgentTimeout(seconds: number | null | undefined): number {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 25;
  return Math.min(60, Math.max(10, Math.round(n)));
}

async function updateBridgeRow(
  client: SupabaseClient,
  orgId: number,
  bridgeId: string,
  patch: Record<string, unknown>
): Promise<{ error: { message: string } | null }> {
  const { error } = await client
    .from('mobile_call_bridges')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', bridgeId)
    .eq('organization_id', orgId);
  return { error: error ? { message: error.message } : null };
}

async function markCallFailed(
  client: SupabaseClient,
  orgId: number,
  callId: string,
  reason: string
): Promise<void> {
  const { error } = await client
    .from('calls')
    .update({ status: 'failed' as CallStatus, ended_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('organization_id', orgId);
  if (error) console.error('[mobileBridge] markCallFailed:', error.message, reason);
}

// ─── Cancelación ─────────────────────────────────────────────────────────────

export interface CancelBridgeResult {
  status: BridgeStatus;
  canceledLegs: string[];
}

/**
 * Cancela un bridge en curso (§4.5.5).
 *
 * - Solo el DUEÑO (o un admin de la org) puede cancelar: la RLS `mcb_update` ya
 *   es por dueño, y aquí se comprueba igual porque el servidor usa service role.
 * - El verbo depende del estado REAL de cada pata en Twilio: `canceled` solo se
 *   acepta en `queued|ringing`; una llamada `in-progress` se termina con
 *   `completed` (error 21220 en caso contrario).
 * - Si Twilio rechaza la cancelación NO se marca el bridge como terminado: la
 *   llamada sigue viva y la BD tiene que decir la verdad.
 */
export async function cancelBridge(
  bridgeId: string,
  orgId: number,
  userId: string,
  isAdmin: boolean,
  client: SupabaseClient
): Promise<CancelBridgeResult> {
  const bridge = await getBridge(bridgeId, orgId, client);
  if (!bridge) throw new BridgeError('BRIDGE_NOT_FOUND', 404, 'Bridge no encontrado');
  if (bridge.user_id !== userId && !isAdmin) {
    throw new BridgeError('FORBIDDEN', 403, 'Solo el dueño de la llamada puede cancelarla');
  }
  if (isTerminalBridgeStatus(bridge.status)) {
    throw new BridgeError('BRIDGE_TERMINAL', 409, `El bridge ya está en estado ${bridge.status}`);
  }

  // Se guarda el estado ANTES de escribir: es el que decide si el minuto del
  // cliente se devuelve.
  const previousStatus = bridge.status;
  const nowIso = new Date().toISOString();
  await updateBridgeRow(client, orgId, bridgeId, { cancel_requested_at: nowIso });

  const legs = [bridge.agent_leg_sid, bridge.customer_leg_sid].filter(Boolean) as string[];
  const canceledLegs: string[] = [];
  const errors: string[] = [];

  if (legs.length) {
    try {
      const { client: twilio } = await getTwilioClientForOrg(orgId);
      for (const sid of legs) {
        try {
          const live = await twilio.calls(sid).fetch();
          const liveStatus = String(live?.status ?? '');
          if (liveStatus === 'queued' || liveStatus === 'ringing') {
            await twilio.calls(sid).update({ status: 'canceled' });
            canceledLegs.push(sid);
          } else if (liveStatus === 'in-progress') {
            await twilio.calls(sid).update({ status: 'completed' });
            canceledLegs.push(sid);
          }
          // Cualquier otro estado ya es terminal en Twilio: nada que cortar.
        } catch (err) {
          errors.push(`${sid}: ${err instanceof Error ? err.message : 'error'}`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'twilio_client');
    }
  }

  if (errors.length) {
    const detail = errors.join(' | ').slice(0, 500);
    // No se miente: el bridge sigue activo porque la llamada sigue viva.
    await updateBridgeRow(client, orgId, bridgeId, { last_error: `cancel: ${detail}` });
    console.error('[mobileBridge] cancelBridge:', detail);
    throw new BridgeError('CANCEL_FAILED', 502, `No se pudo cortar la llamada en el proveedor: ${detail}`);
  }

  const { error } = await updateBridgeRow(client, orgId, bridgeId, {
    status: 'failed',
    last_error: 'canceled_by_user',
  });
  if (error) throw new BridgeError('BRIDGE_UPDATE_FAILED', 500, error.message);

  if (bridge.call_id) {
    const { error: callError } = await client
      .from('calls')
      .update({ status: 'canceled' as CallStatus, ended_at: nowIso })
      .eq('id', bridge.call_id)
      .eq('organization_id', orgId);
    if (callError) console.error('[mobileBridge] cancel calls update:', callError.message);
  }

  // El minuto del cliente reservado y no usado se devuelve (§8).
  if (customerLegNeverDialed(previousStatus, 'failed')) {
    await refundVoiceMinutes(orgId, 1, client);
  }

  return { status: 'failed', canceledLegs };
}
