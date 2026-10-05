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
  type VoiceAgentCallLiveStatus,
} from '@/lib/services/crm/voiceAgent/callStatusMap';
import { devolverReservaSinConversacion, sinConversacion } from '@/lib/services/crm/voiceAgent/reservaCreditos';
import { aplicarCallbackVoz, buscarReservaVoz } from '@/lib/services/crm/voiceAgent/creditosVoz';
import { mutateCallFromSnapshot } from '@/lib/services/crm/callMutationService';
import { mergeTerminalOutcome, isTerminalStatus } from '@/lib/services/crm/callStateMachine';
import { upsertCallActivity, type CallForActivity } from '@/lib/services/crm/callActivitySync';
import { CrmHttpError } from '@/lib/services/crm/crmErrors';

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
    const search = new URL(request.url).searchParams;
    const callId = search.get('callId') || '';
    const reservationId = search.get('reservationId');
    const callSid = params.CallSid || '';

    // La org sale de la fila persistida, jamás del cuerpo.
    let query = supabase
      .from('voice_agent_calls')
      .select(
        'id, organization_id, call_id, provider_call_sid, status, started_at, completed_at, outcome, customer_id, opportunity_id, credits_reserved, credits_settled_at'
      );
    query = callId ? query.eq('id', callId) : query.eq('provider_call_sid', callSid);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    const vac = data as {
      id: string;
      organization_id: number;
      call_id: string | null;
      provider_call_sid: string | null;
      status: VoiceAgentCallLiveStatus;
      started_at: string | null;
      completed_at: string | null;
      outcome: string | null;
      credits_reserved: number | null;
      credits_settled_at: string | null;
    } | null;

    if (!vac) {
      if (reservationId) return new NextResponse('Forbidden', { status: 403 });
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
    const reservation = await buscarReservaVoz(supabase, vac.organization_id, vac.id, reservationId, callSid);
    if (reservation) {
      if (nextStatus) await aplicarCallbackVoz(
        supabase, vac.organization_id, reservation.id, callSid, nextStatus, durationSeconds,
        params.HandoffData ? String(params.HandoffData).slice(0, 500) : answeredBy ? `answered_by_${answeredBy}` : callStatus
      );
      await syncAgentCallActivity(supabase, vac.organization_id, vac.call_id);
      return new NextResponse(EMPTY_TWIML, { status: 200, headers: XML_HEADERS });
    }
    // El escritor de compatibilidad solo admite un SID ya correlacionado.
    if (!callSid || vac.provider_call_sid !== callSid) return new NextResponse('Forbidden', { status: 403 });
    // Una llamada transferida no vuelve atrás cuando llega el `completed` del
    // tramo, y una que el TwiML ya cerró como buzón (AMD) tampoco: el
    // `completed` posterior puede llegar sin `AnsweredBy` y la convertiría en
    // un contacto efectivo que nunca existió.
    const keepTerminal = vac.status === 'transferred' || vac.status === 'voicemail';

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (nextStatus && !keepTerminal) patch.status = nextStatus;
    if (nextStatus && TERMINAL_VAC_STATUSES.includes(nextStatus)) {
      if (!vac.completed_at) patch.completed_at = new Date().toISOString();
      patch.locked_by = null;
      if (durationSeconds) patch.duration_seconds = durationSeconds;
      if (!vac.outcome) patch.outcome = answeredBy ? `answered_by_${answeredBy}` : callStatus;
    }
    if (params.HandoffData) {
      patch.outcome = String(params.HandoffData).slice(0, 500);
    }

    // Compatibilidad: una reserva antigua sin prueba privada no se devuelve
    // desde banderas públicas. El helper exige conciliación antes de escribir.
    const efectivo = keepTerminal ? vac.status : nextStatus;
    if (sinConversacion(efectivo)) {
      const devolucion = await devolverReservaSinConversacion(supabase, vac);
      if (devolucion) Object.assign(patch, devolucion);
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
      const { data: stored, error: readError } = await supabase.from('calls').select('*')
        .eq('id', vac.call_id).eq('organization_id', vac.organization_id).maybeSingle();
      if (readError) throw readError;
      if (!stored) throw new Error('Llamada del agente no encontrada');
      const eventTime = new Date().toISOString();
      const final = await mutateCallFromSnapshot(supabase, stored as AgentCallSnapshot, (fresh) => {
        const incoming = mapTwilioToCallsStatus(callStatus, answeredBy);
        if (!incoming) return null;
        const merged = mergeTerminalOutcome({
          currentStatus: fresh.status, currentDuration: fresh.duration_seconds,
          currentAnsweredAt: fresh.answered_at, incomingStatus: incoming,
          incomingDuration: durationSeconds ?? 0,
        });
        const callsPatch: Record<string, unknown> = {};
        if (merged.status) callsPatch.status = merged.status;
        if (answeredBy && !fresh.answered_by) callsPatch.answered_by = answeredBy;
        if (merged.duration_seconds !== undefined) callsPatch.duration_seconds = merged.duration_seconds;
        // AMD por sí solo no prueba que haya terminado la conversación.
        if (isTerminalStatus(incoming) && !fresh.ended_at && ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)) callsPatch.ended_at = eventTime;
        return callsPatch;
      });
      if (isTerminalStatus(final.status) && final.ended_at) await upsertCallActivity(final, supabase);
    }

    return new NextResponse(EMPTY_TWIML, { status: 200, headers: XML_HEADERS });
  } catch (error) {
    if (error instanceof CrmHttpError && error.status === 403) return new NextResponse('Forbidden', { status: 403 });
    console.error('[AI Agent status] Error:', error instanceof Error ? error.message : error);
    // Twilio reintenta ante 5xx: no se traga el fallo con un 200 mentiroso.
    return new NextResponse('Error', { status: 500 });
  }
}

interface AgentCallSnapshot extends CallForActivity {
  status: import('@/lib/crm/enums').CallStatus;
  answered_at: string | null;
}

async function syncAgentCallActivity(client: ReturnType<typeof getServiceClient>, orgId: number, callId: string | null): Promise<void> {
  if (!callId) return;
  const { data, error } = await client.from('calls').select('*').eq('id', callId).eq('organization_id', orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Llamada del agente no encontrada');
  const call = data as AgentCallSnapshot;
  if (isTerminalStatus(call.status) && call.ended_at) await upsertCallActivity(call, client);
}
