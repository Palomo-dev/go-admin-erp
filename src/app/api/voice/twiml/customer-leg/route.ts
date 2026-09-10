/**
 * POST /api/voice/twiml/customer-leg?bridgeId=…&t=… — `action` del `<Gather>`.
 *
 * `Digits=1` → se marca al CLIENTE con el caller id de la organización:
 *   - `statusCallback` en el `<Number>` (TwiML NO lo soporta en `<Dial>`),
 *   - `action` en el `<Dial>` → `/api/voice/dial-complete?callId=…` (F3), que
 *     fija el desenlace y `duration_seconds = DialCallDuration`,
 *   - `url` en el `<Number>` → `/api/voice/twiml/consent-whisper?callId=…`
 *     (F3): el aviso de grabación lo oye EL CLIENTE y queda registrado en
 *     `call_consents` / `calls.consent_given` (Ley 1581, D9).
 * Cualquier otro dígito → cancelación explícita del vendedor.
 *
 * Seguridad (§7): firma Twilio + token HMAC + `accountSidMatchesOrg`; la org
 * sale de la fila del bridge y todas las escrituras van scoped.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError, getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { accountSidMatchesOrg, getTelephonySettings, pickCallerId } from '@/lib/services/crm/voiceContextService';
import { verifyBridgeToken, signBridgeToken } from '@/lib/services/crm/bridgeTokens';
import { buildCustomerLegTwiml, buildBridgeHangupTwiml } from '@/lib/services/crm/bridgeTwimlBuilders';
import { isTerminalBridgeStatus, type BridgeStatus } from '@/lib/services/crm/mobileBridgeService';
import { refundVoiceMinutes } from '@/lib/services/crm/callCreditsService';

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
      console.warn('[Customer Leg TwiML] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const search = new URL(request.url).searchParams;
    const bridgeId = search.get('bridgeId') || '';
    const token = search.get('t');
    const digits = params.Digits || '';

    if (!bridgeId || !verifyBridgeToken(bridgeId, token)) {
      console.warn('[Customer Leg TwiML] Token de bridge inválido');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const supabase = getServiceClient();
    const { data: bridge, error } = await supabase
      .from('mobile_call_bridges')
      .select('*')
      .eq('id', bridgeId)
      .maybeSingle();
    if (error) {
      console.error('[Customer Leg TwiML] lectura del bridge:', error.message);
      return xml(buildBridgeHangupTwiml('Ocurrió un error. Intenta más tarde.'));
    }
    if (!bridge) return xml(buildBridgeHangupTwiml('La llamada ya no está disponible.'));

    const orgId = bridge.organization_id as number;
    if (!(await accountSidMatchesOrg(orgId, accountSid, supabase))) {
      console.warn('[Customer Leg TwiML] AccountSid ajeno a la org del bridge', { org: orgId });
      return new NextResponse('Forbidden', { status: 403 });
    }

    const status = bridge.status as BridgeStatus;
    const callId = (bridge.call_id as string | null) ?? null;
    const nowIso = new Date().toISOString();

    if (isTerminalBridgeStatus(status)) {
      return xml(buildBridgeHangupTwiml('Esta llamada ya finalizó.'));
    }

    // El vendedor no confirmó (2 o cualquier otra tecla): cancelación explícita.
    if (digits !== '1') {
      const { error: updateError } = await supabase
        .from('mobile_call_bridges')
        .update({ status: 'agent_rejected' })
        .eq('id', bridgeId)
        .eq('organization_id', orgId);
      if (updateError) console.error('[Customer Leg TwiML] update agent_rejected:', updateError.message);

      if (callId) {
        const { error: callError } = await supabase
          .from('calls')
          .update({ status: 'canceled', ended_at: nowIso })
          .eq('id', callId)
          .eq('organization_id', orgId);
        if (callError) console.error('[Customer Leg TwiML] update calls canceled:', callError.message);
      }
      // El minuto del cliente reservado y nunca usado se devuelve (§8).
      await refundVoiceMinutes(orgId, 1, supabase);
      return xml(buildBridgeHangupTwiml('Llamada cancelada. Hasta luego.'));
    }

    const settings = await getTelephonySettings(orgId, supabase);
    const picked = await pickCallerId(orgId, settings, supabase);
    if (!picked.e164 || picked.source === 'platform') {
      console.error('[Customer Leg TwiML] sin caller id propio de la org', { org: orgId });
      return xml(buildBridgeHangupTwiml('La organización no tiene un número saliente configurado.'));
    }
    const recordingEnabled = Boolean(settings.voice_recording_enabled);

    // `customer_dialing` solo avanza desde los estados previos: un segundo POST
    // con el mismo dígito devuelve el MISMO TwiML sin re-escribir el estado.
    if (status === 'agent_answered' || status === 'agent_ringing' || status === 'initiating') {
      const { error: updateError } = await supabase
        .from('mobile_call_bridges')
        .update({ status: 'customer_dialing' })
        .eq('id', bridgeId)
        .eq('organization_id', orgId);
      if (updateError) console.error('[Customer Leg TwiML] update customer_dialing:', updateError.message);

      if (callId) {
        const { error: callError } = await supabase
          .from('calls')
          .update({ status: 'ringing' })
          .eq('id', callId)
          .eq('organization_id', orgId);
        if (callError) console.error('[Customer Leg TwiML] update calls ringing:', callError.message);
      }
    }

    const origin = getTwilioWebhookOrigin();
    const t = signBridgeToken(bridgeId);
    const q = `bridgeId=${encodeURIComponent(bridgeId)}&t=${t}`;

    return xml(
      buildCustomerLegTwiml({
        to: String(bridge.target_phone),
        callerId: picked.e164,
        recordingEnabled,
        recordingCallbackUrl: `${origin}/api/voice/recording`,
        statusCallbackUrl: `${origin}/api/voice/bridge/status?${q}&leg=customer`,
        consentUrl: callId ? `${origin}/api/voice/twiml/consent-whisper?callId=${encodeURIComponent(callId)}` : null,
        dialCompleteUrl: `${origin}/api/voice/dial-complete?callId=${encodeURIComponent(callId ?? '')}`,
        timeout: settings.voice_ring_timeout_seconds,
        agentNotice: recordingEnabled ? 'Conectando. Esta llamada se grabará.' : 'Conectando.',
      })
    );
  } catch (error) {
    console.error('[Customer Leg TwiML] Error:', error);
    return xml(buildBridgeHangupTwiml('Ocurrió un error. Intenta más tarde.'));
  }
}
