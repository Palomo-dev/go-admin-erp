/**
 * POST /api/voice/ai-agent/status — cierre de la llamada del agente IA.
 *
 * Cierra C-F6-18: antes el `statusCallback` apuntaba a `/api/voice/bridge/status`
 * sin `bridgeId`, que devolvía 200 y no escribía nada, así que `voice_agent_calls`
 * nunca salía de `in_progress`.
 *
 * Atiende dos cosas del mismo `<Connect>`:
 *  - `statusCallback` de la llamada (CallStatus, CallDuration, AnsweredBy).
 *  - `action` de `<Connect>` (SessionStatus, SessionDuration, HandoffData).
 *
 * Seguridad: firma de Twilio verificada SIEMPRE y antes de tocar la base.
 * La organización se resuelve SOLO desde la fila ya guardada (callId de la query o
 * `provider_call_sid`), nunca del cuerpo de la petición.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import {
  mapTwilioCallStatus,
  mapTwilioToCallsStatus,
  TERMINAL_VAC_STATUSES,
  ENDED_CALL_STATUSES,
  type VoiceAgentCallLiveStatus,
} from '@/lib/services/crm/voiceAgent/callStatusMap';

export const runtime = 'nodejs';

/**
 * F-NEW-13: esta ruta también es la `action` de `<Connect>`, y ahí Twilio espera
 * TwiML. Devolver `OK` en texto plano hacía que lo registrara como error (12200).
 * Un `<Response/>` vacío es válido para las dos entradas (la `action` y el
 * `statusCallback`, al que el cuerpo le da igual).
 */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
const XML_HEADERS = { 'Content-Type': 'text/xml' };

export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[AI Agent status] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const supabase = getServiceClient();
    const callId = new URL(request.url).searchParams.get('callId') || '';
    const callSid = params.CallSid || '';

    // La org sale de la fila persistida, jamás del cuerpo.
    let query = supabase
      .from('voice_agent_calls')
      .select(
        'id, organization_id, call_id, status, started_at, outcome, customer_id, opportunity_id, credits_reserved, credits_settled_at'
      );
    query = callId ? query.eq('id', callId) : query.eq('provider_call_sid', callSid);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    const vac = data as {
      id: string;
      organization_id: number;
      call_id: string | null;
      status: VoiceAgentCallLiveStatus;
      started_at: string | null;
      outcome: string | null;
      credits_reserved: number | null;
      credits_settled_at: string | null;
    } | null;

    if (!vac) {
      console.warn('[AI Agent status] Sin correlación para', callId || callSid);
      return new NextResponse(EMPTY_TWIML, { status: 200, headers: XML_HEADERS });
    }

    // Aislamiento multi-tenant (M1, gemelo N-2): la firma solo prueba que el
    // AccountSid es resoluble (master o subcuenta de CUALQUIER org). El id de
    // la query es adivinable, así que quien firma debe ser la cuenta de ESTA org.
    if (!(await accountSidMatchesOrg(vac.organization_id, accountSid, supabase))) {
      console.warn('[AI Agent status] AccountSid ajeno a la org de la llamada', { org: vac.organization_id });
      return new NextResponse('Forbidden', { status: 403 });
    }

    const callStatus = params.CallStatus || params.SessionStatus || '';
    const answeredBy = params.AnsweredBy || null;
    const durationSeconds =
      parseInt(params.CallDuration || params.SessionDuration || '0', 10) || null;

    const nextStatus = mapTwilioCallStatus(callStatus, answeredBy);
    // Una llamada transferida no vuelve atrás cuando llega el `completed` del tramo.
    const keepTransferred = vac.status === 'transferred';

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (nextStatus && !keepTransferred) patch.status = nextStatus;
    if (nextStatus && TERMINAL_VAC_STATUSES.includes(nextStatus)) {
      patch.completed_at = new Date().toISOString();
      patch.locked_by = null;
      if (durationSeconds) patch.duration_seconds = durationSeconds;
      if (!vac.outcome) patch.outcome = answeredBy ? `answered_by_${answeredBy}` : callStatus;
    }
    if (params.HandoffData) {
      patch.outcome = String(params.HandoffData).slice(0, 500);
    }

    // F-NEW-6: si la llamada no llegó a hablar (nadie contestó, comunicaba, falló o
    // se canceló), el ws-server nunca concilia y la reserva de crédito se quedaba
    // cobrada. Aquí se devuelve, una sola vez (`credits_settled_at`).
    const NO_CONVERSATION: string[] = ['no_answer', 'failed', 'canceled'];
    const reserved = vac.credits_reserved ?? 0;
    if (
      nextStatus &&
      NO_CONVERSATION.includes(nextStatus) &&
      reserved > 0 &&
      !vac.credits_settled_at
    ) {
      const { error: refundError } = await supabase.rpc('deduct_comm_credits', {
        p_org_id: vac.organization_id,
        p_channel: 'voice',
        p_amount: -reserved,
      });
      if (refundError) throw refundError;
      patch.credits_reserved = 0;
      patch.credits_settled_at = new Date().toISOString();
    }

    const { error: updError } = await supabase
      .from('voice_agent_calls')
      .update(patch)
      .eq('id', vac.id)
      .eq('organization_id', vac.organization_id);
    if (updError) throw updError;

    // Espejo en `calls` para que la llamada del agente entre en el timeline,
    // en la grabación y en el pipeline de transcripción/análisis de F4.
    if (vac.call_id) {
      const callsStatus = mapTwilioToCallsStatus(callStatus, answeredBy);
      const callsPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (callsStatus) callsPatch.status = callsStatus;
      if (answeredBy) callsPatch.answered_by = answeredBy;
      if (durationSeconds) callsPatch.duration_seconds = durationSeconds;
      if (callsStatus && ENDED_CALL_STATUSES.includes(callsStatus)) {
        callsPatch.ended_at = new Date().toISOString();
      }
      const { error: callErr } = await supabase
        .from('calls')
        .update(callsPatch)
        .eq('id', vac.call_id)
        .eq('organization_id', vac.organization_id);
      if (callErr) throw callErr;
    }

    return new NextResponse(EMPTY_TWIML, { status: 200, headers: XML_HEADERS });
  } catch (error) {
    console.error('[AI Agent status] Error:', error instanceof Error ? error.message : error);
    // Twilio reintenta ante 5xx: no se traga el fallo con un 200 mentiroso.
    return new NextResponse('Error', { status: 500 });
  }
}
