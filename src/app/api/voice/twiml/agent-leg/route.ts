/**
 * POST /api/voice/twiml/agent-leg?bridgeId=…&t=… — TwiML del leg del VENDEDOR.
 *
 * Twilio llama al celular verificado del vendedor y pide este TwiML. Reproduce
 * el whisper (cliente + oportunidad) y ofrece "1 conectar / 2 cancelar".
 *
 * Seguridad (§7): firma Twilio fail-closed + token HMAC del bridge + la
 * (sub)cuenta firmante debe ser la de la organización del bridge
 * (`accountSidMatchesOrg`, el patrón que F3 aplica en sus otras cinco rutas).
 * La org SIEMPRE sale de la fila persistida y todas las lecturas/escrituras
 * posteriores llevan `eq('organization_id', …)`.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { accountSidMatchesOrg, getTelephonySettings, pickCallerId } from '@/lib/services/crm/voiceContextService';
import { verifyBridgeToken, signBridgeToken } from '@/lib/services/crm/bridgeTokens';
import { buildAgentLegTwiml, buildCustomerLegTwiml, buildBridgeHangupTwiml } from '@/lib/services/crm/bridgeTwimlBuilders';
import { buildWhisper, isTerminalBridgeStatus, type BridgeStatus } from '@/lib/services/crm/mobileBridgeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XML_HEADERS = { 'Content-Type': 'text/xml' };

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: XML_HEADERS });
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Agent Leg TwiML] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const search = new URL(request.url).searchParams;
    const bridgeId = search.get('bridgeId') || '';
    const token = search.get('t');

    if (!bridgeId || !verifyBridgeToken(bridgeId, token)) {
      console.warn('[Agent Leg TwiML] Token de bridge inválido');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const supabase = getServiceClient();
    const { data: bridge, error } = await supabase
      .from('mobile_call_bridges')
      .select('*')
      .eq('id', bridgeId)
      .maybeSingle();
    if (error) {
      console.error('[Agent Leg TwiML] lectura del bridge:', error.message);
      return xml(buildBridgeHangupTwiml('Ocurrió un error. Intenta más tarde.'));
    }
    if (!bridge) return xml(buildBridgeHangupTwiml('La llamada ya no está disponible.'));

    const orgId = bridge.organization_id as number;
    if (!(await accountSidMatchesOrg(orgId, accountSid, supabase))) {
      console.warn('[Agent Leg TwiML] AccountSid ajeno a la org del bridge', { org: orgId });
      return new NextResponse('Forbidden', { status: 403 });
    }

    const status = bridge.status as BridgeStatus;
    if (isTerminalBridgeStatus(status)) {
      return xml(buildBridgeHangupTwiml('Esta llamada ya finalizó.'));
    }

    // Buzón de voz del propio vendedor (AMD): no se le habla al contestador.
    if (String(params.AnsweredBy || '').startsWith('machine')) {
      await supabase
        .from('mobile_call_bridges')
        .update({ status: 'agent_no_answer', last_error: 'agent_voicemail' })
        .eq('id', bridgeId)
        .eq('organization_id', orgId);
      if (bridge.call_id) {
        await supabase
          .from('calls')
          .update({ status: 'no_answer', ended_at: new Date().toISOString(), answered_by: 'machine' })
          .eq('id', bridge.call_id)
          .eq('organization_id', orgId);
      }
      return xml(buildBridgeHangupTwiml());
    }

    // `agent_answered` solo desde los estados previos (una repetición del
    // webhook no revive un bridge que ya avanzó).
    if (status === 'initiating' || status === 'agent_ringing') {
      const { error: updateError } = await supabase
        .from('mobile_call_bridges')
        .update({
          status: 'agent_answered',
          ...(bridge.agent_leg_sid ? {} : { agent_leg_sid: params.CallSid || null }),
        })
        .eq('id', bridgeId)
        .eq('organization_id', orgId);
      if (updateError) console.error('[Agent Leg TwiML] update agent_answered:', updateError.message);
    }

    // Contexto del whisper (siempre scoped por organización)
    let customerName = 'un cliente';
    if (bridge.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, company_name')
        .eq('id', bridge.customer_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      const c = customer as { first_name?: string; last_name?: string; company_name?: string } | null;
      if (c) customerName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || customerName;
    }
    let opportunityName: string | null = null;
    if (bridge.opportunity_id) {
      const { data: opp } = await supabase
        .from('opportunities')
        .select('name')
        .eq('id', bridge.opportunity_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      opportunityName = (opp as { name?: string } | null)?.name ?? null;
    }

    const confirmDigit = Boolean(bridge.confirm_digit_required);
    const whisper =
      (bridge.whisper_text as string | null) ||
      buildWhisper({ customerName, opportunityName, confirmDigit });

    const origin = getTwilioWebhookOrigin();
    const t = signBridgeToken(bridgeId);
    const q = `bridgeId=${encodeURIComponent(bridgeId)}&t=${t}`;

    if (confirmDigit) {
      return xml(
        buildAgentLegTwiml({
          whisper,
          actionUrl: `${origin}/api/voice/twiml/customer-leg?${q}`,
          confirmDigit: true,
          timeout: 8,
        })
      );
    }

    // Sin confirmación: se marca al cliente inmediatamente después del whisper.
    const settings = await getTelephonySettings(orgId, supabase);
    const picked = await pickCallerId(orgId, settings, supabase);
    if (!picked.e164 || picked.source === 'platform') {
      return xml(buildBridgeHangupTwiml('La organización no tiene un número saliente configurado.'));
    }
    const recordingEnabled = Boolean(settings.voice_recording_enabled);
    const callId = bridge.call_id as string | null;

    await supabase
      .from('mobile_call_bridges')
      .update({ status: 'customer_dialing' })
      .eq('id', bridgeId)
      .eq('organization_id', orgId);

    const directDial = buildCustomerLegTwiml({
      to: String(bridge.target_phone),
      callerId: picked.e164,
      recordingEnabled,
      recordingCallbackUrl: `${origin}/api/voice/recording`,
      statusCallbackUrl: `${origin}/api/voice/bridge/status?${q}&leg=customer`,
      consentUrl: callId ? `${origin}/api/voice/twiml/consent-whisper?callId=${encodeURIComponent(callId)}` : null,
      dialCompleteUrl: `${origin}/api/voice/dial-complete?callId=${encodeURIComponent(callId ?? '')}`,
      timeout: settings.voice_ring_timeout_seconds,
    });

    return xml(buildAgentLegTwiml({ whisper, actionUrl: '', confirmDigit: false, directDial }));
  } catch (error) {
    console.error('[Agent Leg TwiML] Error:', error);
    return xml(buildBridgeHangupTwiml('Ocurrió un error. Intenta más tarde.'));
  }
}
