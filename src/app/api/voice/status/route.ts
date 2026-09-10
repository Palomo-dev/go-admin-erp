import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { applyStatusEvent, isTerminalStatus, type CallLeg } from '@/lib/services/crm/callStateMachine';
import { upsertCallActivity, touchOpportunityAfterCall } from '@/lib/services/crm/callActivitySync';
import { settleVoiceCall } from '@/lib/services/crm/callCreditsService';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { EMPTY_TWIML, xmlResponse } from '@/lib/services/crm/twimlBuilders';
import type { CallStatus } from '@/lib/crm/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CallRow {
  id: string;
  organization_id: number;
  direction: 'inbound' | 'outbound';
  mode: 'browser' | 'bridge' | 'ai_agent' | 'manual' | 'inbound';
  status: CallStatus;
  from_number: string;
  to_number: string;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_enabled: boolean;
  customer_leg_sid: string | null;
  metadata: Record<string, unknown>;
}

/**
 * POST /api/voice/status — Status callback de Twilio (FASE-03 §4.3, §2.4).
 *
 * - Leg hijo (`ParentCallSid` presente): la fila es `calls.provider_call_sid = ParentCallSid`;
 *   mueve ringing → in_progress → terminal y guarda `customer_leg_sid`.
 * - Leg padre (sin `ParentCallSid`): `provider_call_sid = CallSid` (TwiML App /
 *   entrante); nunca escribe in_progress si ya hubo respuesta; `completed` sin
 *   respuesta → `canceled`.
 * - Idempotencia por `SequenceNumber` por leg; terminales pegajosos.
 * - Al llegar a terminal CON `ended_at`: actividad `call` + liquidación de
 *   créditos (si `dial-complete` no lo hizo antes; ambos son idempotentes).
 *   El buzón (`AnsweredBy=machine_*`) marca `voicemail` pero NO cierra la
 *   llamada: se liquida con la duración real cuando llega el cierre.
 *
 * Seguridad: firma fail-closed (SEC). Responde 200 vacío siempre tras validar.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Voice Status] Rechazado:', err.code);
      return new Response('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const callSid = params.CallSid || '';
  const parentSid = params.ParentCallSid || '';
  if (!callSid) return xmlResponse(EMPTY_TWIML);

  try {
    const sb = getServiceClient();
    const leg: CallLeg = parentSid ? 'child' : 'parent';
    const lookupSid = parentSid || callSid;

    let { data } = await sb.from('calls').select('*').eq('provider_call_sid', lookupSid).limit(1).maybeSingle();
    // Legs de bridge (F5) pueden identificarse por customer_leg_sid/agent_leg_sid
    if (!data && !parentSid) {
      ({ data } = await sb.from('calls').select('*').or(`customer_leg_sid.eq.${callSid},agent_leg_sid.eq.${callSid}`).limit(1).maybeSingle());
    }
    const call = data as CallRow | null;
    if (!call) {
      console.warn('[Voice Status] Llamada no encontrada para', lookupSid);
      return xmlResponse(EMPTY_TWIML);
    }
    // Aislamiento multi-tenant (M1): el `provider_call_sid` es único por org, no
    // globalmente; la firma solo prueba que el AccountSid es resoluble.
    if (!(await accountSidMatchesOrg(call.organization_id, accountSid, sb))) {
      console.warn('[Voice Status] AccountSid ajeno a la org de la llamada', { org: call.organization_id });
      return new Response('Forbidden', { status: 403 });
    }

    const update = applyStatusEvent(
      { status: call.status, answered_at: call.answered_at, started_at: call.started_at, metadata: call.metadata ?? {} },
      {
        CallStatus: params.CallStatus || '',
        SequenceNumber: params.SequenceNumber ?? null,
        CallDuration: params.CallDuration ?? null,
        AnsweredBy: params.AnsweredBy ?? null,
        SipResponseCode: params.SipResponseCode ?? null,
        Timestamp: params.Timestamp ?? null,
      },
      leg
    );
    if (!update) return xmlResponse(EMPTY_TWIML);

    const patch: Record<string, unknown> = { metadata: update.metadata };
    if (update.status) patch.status = update.status;
    if (update.answered_at) patch.answered_at = update.answered_at;
    if (update.ring_seconds !== undefined) patch.ring_seconds = update.ring_seconds;
    if (update.ended_at && !call.ended_at) patch.ended_at = update.ended_at;
    if (update.duration_seconds !== undefined && (call.duration_seconds === null || call.duration_seconds === undefined)) {
      patch.duration_seconds = update.duration_seconds;
      patch.duration_source = 'provider';
    }
    if (update.answered_by) patch.answered_by = update.answered_by;
    if (leg === 'child' && !call.customer_leg_sid && call.direction === 'outbound') patch.customer_leg_sid = callSid;

    const { data: saved, error } = await sb
      .from('calls')
      .update(patch)
      .eq('id', call.id)
      .eq('organization_id', call.organization_id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const final = saved as CallRow;

    // Se liquida cuando la llamada está terminal Y realmente ha terminado
    // (`ended_at`). El buzón detectado por AMD marca `voicemail` al contestar
    // pero la llamada sigue viva: liquidar ahí cobraba 0 minutos y, por
    // idempotencia, el cierre real ya no cobraba los minutos consumidos (A3).
    const settled = Boolean((final.metadata as Record<string, unknown> | null)?.settled_at);
    if (isTerminalStatus(final.status) && final.ended_at && !settled) {
      await settleVoiceCall(final, sb).catch((e) => console.warn('[Voice Status] settle:', e instanceof Error ? e.message : e));
      await upsertCallActivity(final, sb);
      await touchOpportunityAfterCall(final, sb);
    }
    return xmlResponse(EMPTY_TWIML);
  } catch (error: unknown) {
    console.error('[Voice Status] error:', error instanceof Error ? error.message : error);
    return xmlResponse(EMPTY_TWIML);
  }
}
