/**
 * POST /api/voice/bridge/status — Status callback del bridge.
 *
 * Twilio envía actualizaciones de estado de cada pata (agent/customer).
 * Este endpoint correlaciona ambas patas en mobile_call_bridges y calls.
 *
 * Sin autenticación de sesión — valida firma de Twilio en producción.
 * Query params: bridgeId, leg (agent|customer)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio';
import { getWebhookBaseUrl } from '@/lib/services/integrations/twilio/twilioConfig';
import type { BridgeStatus } from '@/lib/services/crm/mobileBridgeService';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales Supabase (service_role)');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const bridgeId = request.nextUrl.searchParams.get('bridgeId') || '';
    const leg = (request.nextUrl.searchParams.get('leg') || 'agent') as 'agent' | 'customer';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${getWebhookBaseUrl()}/api/voice/bridge/status?bridgeId=${bridgeId}&leg=${leg}`;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[Bridge Status] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, url, params)) {
      console.warn('[Bridge Status] Firma de Twilio inválida');
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!bridgeId) {
      return new NextResponse('OK', { status: 200 });
    }

    const supabase = getServiceSupabase();

    const callSid = params.CallSid || '';
    const callStatus = params.CallStatus || '';
    const callDuration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;

    // Mapear estado de Twilio a estado del bridge
    const newBridgeStatus = mapCallStatusToBridge(callStatus, leg);

    // Actualizar el bridge
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

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
      .eq('id', bridgeId);

    // Actualizar el registro en calls
    const callsUpdate: Record<string, unknown> = {
      status: callStatus,
    };

    if (callDuration !== null) {
      callsUpdate.duration_seconds = callDuration;
    }

    if (leg === 'agent') {
      await supabase
        .from('calls')
        .update(callsUpdate)
        .eq('provider_call_sid', callSid);
    } else {
      // Customer leg: actualizar por provider_call_sid o crear si no existe
      const { data: existingCall } = await supabase
        .from('calls')
        .select('id')
        .eq('provider_call_sid', callSid)
        .maybeSingle();

      if (existingCall) {
        await supabase
          .from('calls')
          .update(callsUpdate)
          .eq('provider_call_sid', callSid);
      } else {
        // El customer leg puede no tener registro previo — crearlo
        const { data: bridge } = await supabase
          .from('mobile_call_bridges')
          .select('organization_id, user_id, customer_id, opportunity_id, agent_leg_sid')
          .eq('id', bridgeId)
          .single();

        if (bridge) {
          await supabase.from('calls').insert({
            organization_id: bridge.organization_id,
            user_id: bridge.user_id,
            customer_id: bridge.customer_id,
            opportunity_id: bridge.opportunity_id,
            provider_call_sid: callSid,
            parent_call_sid: bridge.agent_leg_sid,
            direction: 'outbound',
            status: callStatus,
            bridge_mode: 'customer_leg',
            customer_leg_sid: callSid,
            agent_leg_sid: bridge.agent_leg_sid,
            duration_source: 'provider',
            duration_seconds: callDuration,
            phone_number: params.To || '',
          });
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[Bridge Status] Error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
