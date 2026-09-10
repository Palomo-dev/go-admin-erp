/**
 * POST /api/voice/bridge/status — Status callback del bridge.
 *
 * Twilio envía actualizaciones de estado de cada pata (agent/customer).
 * Este endpoint correlaciona ambas patas en mobile_call_bridges y calls.
 *
 * Seguridad (F0, C12/C14/C3/C4):
 * - Firma verificada SIEMPRE (token por AccountSid).
 * - La org se toma de la fila `mobile_call_bridges`; todas las escrituras en
 *   `calls` se filtran por `organization_id`.
 * - `calls.status` se mapea con `twilioCallStatusToDb` (CHECK).
 * - El insert del customer leg usa `from_number`/`to_number` (la columna
 *   `phone_number` no existe) y `mode: 'bridge'`.
 * Query params: bridgeId, leg (agent|customer)
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { twilioCallStatusToDb } from '@/lib/crm/enums';
import type { BridgeStatus } from '@/lib/services/crm/mobileBridgeService';

export const runtime = 'nodejs';

/** Mapea el CallStatus de Twilio al estado del bridge */
function mapCallStatusToBridge(
  callStatus: string,
  leg: 'agent' | 'customer'
): BridgeStatus | null {
  switch (callStatus) {
    case 'initiated':
      return leg === 'agent' ? 'agent_ringing' : null;
    case 'ringing':
      return leg === 'agent' ? 'agent_ringing' : null;
    case 'in-progress':
      return 'in_progress';
    case 'answered':
      return leg === 'agent' ? 'agent_answered' : 'in_progress';
    case 'completed':
      return 'completed';
    case 'busy':
    case 'no-answer':
      return leg === 'agent' ? 'agent_no_answer' : 'failed';
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return null;
  }
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    ({ params } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Bridge Status] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const search = new URL(request.url).searchParams;
    const bridgeId = search.get('bridgeId') || '';
    const legParam = search.get('leg') || 'agent';
    const leg: 'agent' | 'customer' = legParam === 'customer' ? 'customer' : 'agent';

    if (!bridgeId) {
      // NOTA (C-9/C18): el status callback del agente IA llega sin bridgeId;
      // F6 lo enruta a voice_agent_calls. Aquí solo se ignora.
      return new NextResponse('OK', { status: 200 });
    }

    const supabase = getServiceClient();

    // La org sale de la fila del bridge
    const { data: bridge } = await supabase
      .from('mobile_call_bridges')
      .select('id, organization_id, user_id, customer_id, opportunity_id, agent_leg_sid, agent_phone, target_phone')
      .eq('id', bridgeId)
      .maybeSingle();

    if (!bridge) {
      console.warn('[Bridge Status] Bridge no encontrado:', bridgeId);
      return new NextResponse('OK', { status: 200 });
    }

    const orgId = bridge.organization_id as number;
    const callSid = params.CallSid || '';
    const callStatus = params.CallStatus || '';
    const callDuration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;
    const now = new Date().toISOString();

    // Mapear estado de Twilio a estado del bridge
    const newBridgeStatus = mapCallStatusToBridge(callStatus, leg);

    const updateData: Record<string, unknown> = { updated_at: now };
    if (leg === 'agent') {
      updateData.agent_leg_sid = callSid;
    } else {
      updateData.customer_leg_sid = callSid;
    }
    if (newBridgeStatus) {
      updateData.status = newBridgeStatus;
    }

    await supabase
      .from('mobile_call_bridges')
      .update(updateData)
      .eq('id', bridgeId)
      .eq('organization_id', orgId);

    // Actualizar el registro en calls (estado mapeado al CHECK)
    const dbStatus = twilioCallStatusToDb(callStatus);
    const callsUpdate: Record<string, unknown> = {
      status: dbStatus,
      updated_at: now,
    };
    if (callDuration !== null && !Number.isNaN(callDuration)) {
      callsUpdate.duration_seconds = callDuration;
      callsUpdate.duration_source = 'provider';
    }
    if (callStatus === 'in-progress' || callStatus === 'answered') {
      callsUpdate.answered_at = now;
    }
    if (['completed', 'failed', 'no-answer', 'busy', 'canceled'].includes(callStatus)) {
      callsUpdate.ended_at = now;
    }

    if (!callSid) {
      return new NextResponse('OK', { status: 200 });
    }

    const { data: existingCall } = await supabase
      .from('calls')
      .select('id')
      .eq('provider_call_sid', callSid)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (existingCall) {
      await supabase
        .from('calls')
        .update(callsUpdate)
        .eq('id', existingCall.id)
        .eq('organization_id', orgId);
    } else if (leg === 'customer') {
      // El customer leg puede no tener registro previo — crearlo (scoped)
      await supabase.from('calls').insert({
        organization_id: orgId,
        user_id: bridge.user_id,
        customer_id: bridge.customer_id,
        opportunity_id: bridge.opportunity_id,
        provider: 'twilio',
        provider_call_sid: callSid,
        parent_call_sid: bridge.agent_leg_sid,
        direction: 'outbound',
        mode: 'bridge',
        from_number: params.From || bridge.agent_phone || '',
        to_number: params.To || bridge.target_phone || '',
        status: dbStatus,
        bridge_mode: 'customer_leg',
        customer_leg_sid: callSid,
        agent_leg_sid: bridge.agent_leg_sid,
        duration_source: 'provider',
        duration_seconds: callDuration,
        started_at: now,
        recording_enabled: true,
        metadata: { bridge_id: bridgeId, leg },
      });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[Bridge Status] Error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
