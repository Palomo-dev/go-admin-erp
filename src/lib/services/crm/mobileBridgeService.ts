/**
 * Mobile Bridge Service — FASE 5: Llamadas móvil personal
 * GO Admin ERP
 *
 * Orquesta el click-to-call de 2 patas (Twilio):
 * 1. Twilio llama al móvil personal del agente (agent leg)
 * 2. El agente contesta, escucha whisper y pulsa 1
 * 3. TwiML hace <Dial> al cliente (customer leg)
 * 4. StatusCallback correlaciona ambas patas en mobile_call_bridges + calls
 *
 * Tablas: mobile_call_bridges, calls
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import {
  getMasterClient,
  getMasterPhoneNumber,
  formatE164,
  getWebhookBaseUrl,
} from '@/lib/services/integrations/twilio/twilioConfig';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type BridgeStatus =
  | 'initiating'
  | 'agent_ringing'
  | 'agent_answered'
  | 'customer_dialing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'agent_no_answer'
  | 'agent_rejected';

export interface MobileCallBridge {
  id: string;
  organization_id: number;
  user_id: string;
  agent_phone: string;
  target_phone: string;
  customer_id: string | null;
  opportunity_id: string | null;
  agent_leg_sid: string | null;
  customer_leg_sid: string | null;
  status: BridgeStatus;
  confirm_digit_required: boolean;
  whisper_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiateBridgeInput {
  agent_phone: string;
  target_phone: string;
  customer_id?: string | null;
  opportunity_id?: string | null;
  whisper_text?: string;
  confirm_digit_required?: boolean;
}

export interface InitiateBridgeResult {
  bridge: MobileCallBridge;
  agentLegSid: string;
}

export interface BridgeFilters {
  status?: BridgeStatus;
  user_id?: string;
  customer_id?: string;
  limit?: number;
  offset?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Obtiene un cliente Twilio para la organización.
 * Usa subcuenta si está configurada, sino master.
 */
async function getTwilioClient(
  orgId: number,
  supabase: SupabaseClient
): Promise<{ client: ReturnType<typeof getMasterClient>; fromNumber: string }> {
  const provider = await getActiveProvider(orgId, 'voice', supabase);

  // Si hay subcuenta configurada con credenciales, usarla
  if (
    provider.credentials.TWILIO_SUBACCOUNT_SID &&
    provider.credentials.TWILIO_SUBACCOUNT_AUTH_TOKEN
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Twilio = (await import('twilio')).default;
    const client = Twilio(
      provider.credentials.TWILIO_SUBACCOUNT_SID,
      provider.credentials.TWILIO_SUBACCOUNT_AUTH_TOKEN
    );
    const fromNumber =
      provider.credentials.TWILIO_PHONE_NUMBER || getMasterPhoneNumber();
    return { client, fromNumber };
  }

  // Master por defecto
  const client = getMasterClient();
  const fromNumber =
    (provider.credentials.TWILIO_PHONE_NUMBER as string) ||
    getMasterPhoneNumber();
  return { client, fromNumber };
}

// ─── Servicio ────────────────────────────────────────────────────────────────

/**
 * Inicia un bridge móvil de 2 patas.
 * 1. Crea el registro en mobile_call_bridges
 * 2. Llama a Twilio para conectar al agente primero
 * 3. El agente contesta → TwiML hace Dial al cliente
 */
export async function initiateBridge(
  orgId: number,
  userId: string,
  data: InitiateBridgeInput,
  supabase: SupabaseClient
): Promise<InitiateBridgeResult> {
  const agentPhone = formatE164(data.agent_phone);
  const targetPhone = formatE164(data.target_phone);
  const webhookBase = getWebhookBaseUrl();

  // 1. Crear registro del bridge
  const { data: bridge, error: bridgeError } = await supabase
    .from('mobile_call_bridges')
    .insert({
      organization_id: orgId,
      user_id: userId,
      agent_phone: agentPhone,
      target_phone: targetPhone,
      customer_id: data.customer_id ?? null,
      opportunity_id: data.opportunity_id ?? null,
      status: 'initiating',
      confirm_digit_required: data.confirm_digit_required ?? true,
      whisper_text: data.whisper_text ?? null,
    })
    .select()
    .single();

  if (bridgeError || !bridge) {
    throw new Error(
      `Error creando bridge: ${bridgeError?.message || 'unknown'}`
    );
  }

  const bridgeRow = bridge as MobileCallBridge;

  // 2. Obtener cliente Twilio y número de origen
  const { client, fromNumber } = await getTwilioClient(orgId, supabase);

  // 3. Llamar al agente primero (agent leg)
  // El TwiML del agent-leg reproducirá el whisper y pedirá confirmación
  const agentLegUrl = `${webhookBase}/api/voice/twiml/agent-leg?bridgeId=${bridgeRow.id}`;
  const statusCallbackUrl = `${webhookBase}/api/voice/bridge/status?bridgeId=${bridgeRow.id}&leg=agent`;

  try {
    const call = await client.calls.create({
      to: agentPhone,
      from: fromNumber,
      url: agentLegUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 30,
    });

    // 4. Actualizar bridge con el agent_leg_sid
    await supabase
      .from('mobile_call_bridges')
      .update({
        agent_leg_sid: call.sid,
        status: 'agent_ringing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeRow.id);

    // 5. Crear registro en calls (agent leg)
    await supabase.from('calls').insert({
      organization_id: orgId,
      user_id: userId,
      customer_id: data.customer_id ?? null,
      opportunity_id: data.opportunity_id ?? null,
      provider_call_sid: call.sid,
      direction: 'outbound',
      status: 'dialing',
      bridge_mode: 'agent_leg',
      agent_leg_sid: call.sid,
      duration_source: 'provider',
      phone_number: agentPhone,
    });

    bridgeRow.agent_leg_sid = call.sid;
    bridgeRow.status = 'agent_ringing';

    return { bridge: bridgeRow, agentLegSid: call.sid };
  } catch (err) {
    // Marcar bridge como fallido
    await supabase
      .from('mobile_call_bridges')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeRow.id);

    const message = err instanceof Error ? err.message : 'Error desconocido';
    throw new Error(`Error iniciando llamada al agente: ${message}`);
  }
}

/**
 * Lista los bridges de la organización con filtros opcionales.
 */
export async function getBridges(
  orgId: number,
  supabase: SupabaseClient,
  filters?: BridgeFilters
): Promise<MobileCallBridge[]> {
  let query = supabase
    .from('mobile_call_bridges')
    .select('*')
    .eq('organization_id', orgId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters?.customer_id) {
    query = query.eq('customer_id', filters.customer_id);
  }

  query = query.order('created_at', { ascending: false });

  if (filters?.limit) {
    query = query.limit(filters.limit);
    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + filters.limit - 1
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    console.warn('mobileBridgeService.getBridges - error:', error.message);
    return [];
  }

  return (data || []) as MobileCallBridge[];
}

/**
 * Obtiene un bridge por ID.
 */
export async function getBridge(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<MobileCallBridge | null> {
  const { data, error } = await supabase
    .from('mobile_call_bridges')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('mobileBridgeService.getBridge - error:', error.message);
    return null;
  }

  return (data as MobileCallBridge) || null;
}

/**
 * Actualiza el estado de un bridge.
 */
export async function updateBridgeStatus(
  id: string,
  orgId: number,
  status: BridgeStatus,
  supabase: SupabaseClient
): Promise<MobileCallBridge | null> {
  const { data, error } = await supabase
    .from('mobile_call_bridges')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) {
    console.warn('mobileBridgeService.updateBridgeStatus - error:', error.message);
    return null;
  }

  return (data as MobileCallBridge) || null;
}

/**
 * Cancela un bridge en curso.
 * Si el agente ya contestó, termina la llamada.
 */
export async function cancelBridge(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const bridge = await getBridge(id, orgId, supabase);
  if (!bridge) {
    throw new Error('Bridge no encontrado');
  }

  // Solo se puede cancelar si no está completed o failed
  if (bridge.status === 'completed' || bridge.status === 'failed') {
    throw new Error(`No se puede cancelar un bridge en estado ${bridge.status}`);
  }

  // Intentar terminar las llamadas en Twilio
  try {
    const { client } = await getTwilioClient(orgId, supabase);

    if (bridge.agent_leg_sid) {
      await client.calls(bridge.agent_leg_sid).update({ status: 'canceled' });
    }
    if (bridge.customer_leg_sid) {
      await client.calls(bridge.customer_leg_sid).update({ status: 'canceled' });
    }
  } catch (err) {
    console.warn('mobileBridgeService.cancelBridge - Twilio error:', err);
  }

  // Actualizar estado
  await supabase
    .from('mobile_call_bridges')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId);
}

/**
 * Correlaciona las dos patas del bridge cuando llegan los status callbacks.
 * Busca por agent_leg_sid o customer_leg_sid y actualiza lo que falte.
 */
export async function correlateBridgeLegs(
  supabase: SupabaseClient,
  callSid: string,
  legType: 'agent' | 'customer',
  orgId: number,
  bridgeId?: string
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (legType === 'agent') {
    updateData.agent_leg_sid = callSid;
  } else {
    updateData.customer_leg_sid = callSid;
  }

  if (bridgeId) {
    await supabase
      .from('mobile_call_bridges')
      .update(updateData)
      .eq('id', bridgeId)
      .eq('organization_id', orgId);
  } else {
    // Buscar por el SID de la otra pata
    const column = legType === 'agent' ? 'agent_leg_sid' : 'customer_leg_sid';
    await supabase
      .from('mobile_call_bridges')
      .update(updateData)
      .eq(column, callSid)
      .eq('organization_id', orgId);
  }
}
