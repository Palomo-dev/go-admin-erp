/**
 * POST /api/voice/bridge/status?bridgeId=…&t=…&leg=agent|customer
 *
 * Status callback de cada pata del bridge (§4.3). Desde que el `statusCallback`
 * cuelga del `<Number>` (y no del `<Dial>`, donde TwiML lo ignora), la pata del
 * cliente SÍ notifica y la máquina de estados de §2.4 es alcanzable.
 *
 * Reglas:
 * - Firma Twilio fail-closed + token HMAC del bridge + `accountSidMatchesOrg`.
 * - La org sale de `mobile_call_bridges`; la fila `calls` se localiza por
 *   `bridge.call_id` (no por un `provider_call_sid` suelto).
 * - `SequenceNumber` por leg y terminales pegajosos (`callStateMachine`, F3).
 * - La duración conversada la fija `/api/voice/dial-complete` con
 *   `DialCallDuration`; el `CallDuration` del leg del VENDEDOR (timbre +
 *   whisper) solo se guarda en `metadata.agent_call_duration` para la
 *   liquidación de su pata.
 * - Un fallo inesperado responde 500 para que Twilio reintente (antes se
 *   respondía 200 y el evento se perdía en silencio).
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { verifyBridgeToken } from '@/lib/services/crm/bridgeTokens';
import { applyStatusEvent, isTerminalStatus } from '@/lib/services/crm/callStateMachine';
import { refundVoiceMinutes } from '@/lib/services/crm/callCreditsService';
import {
  applyAgentLegEvent,
  applyCustomerLegEvent,
  customerLegNeverDialed,
  isTerminalBridgeStatus,
  type BridgeStatus,
} from '@/lib/services/crm/mobileBridgeService';
import type { CallStatus } from '@/lib/crm/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CallRow {
  id: string;
  organization_id: number;
  status: CallStatus;
  answered_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
}

/** Estado de `calls` cuando el bridge muere antes de marcar al cliente. */
const CALL_STATUS_FOR_BRIDGE: Partial<Record<BridgeStatus, CallStatus>> = {
  agent_no_answer: 'no_answer',
  agent_rejected: 'canceled',
  failed: 'failed',
};

function lastSeq(meta: Record<string, unknown>, leg: string): number {
  const ls = (meta.last_seq ?? {}) as Record<string, unknown>;
  const n = Number(ls[leg]);
  return Number.isFinite(n) ? n : -1;
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Bridge Status] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const search = new URL(request.url).searchParams;
  const bridgeId = search.get('bridgeId') || '';
  const token = search.get('t');
  const leg: 'agent' | 'customer' = search.get('leg') === 'customer' ? 'customer' : 'agent';

  if (!bridgeId) {
    // Los callbacks del agente IA (F6) llegan sin `bridgeId` a su propia ruta;
    // aquí un callback sin bridge es un error de configuración, no un no-op.
    console.warn('[Bridge Status] callback sin bridgeId', { callSid: params.CallSid });
    return new NextResponse('Bad Request', { status: 400 });
  }
  if (!verifyBridgeToken(bridgeId, token)) {
    console.warn('[Bridge Status] Token de bridge inválido');
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const supabase = getServiceClient();
    const { data: bridge, error: bridgeReadError } = await supabase
      .from('mobile_call_bridges')
      .select('*')
      .eq('id', bridgeId)
      .maybeSingle();
    if (bridgeReadError) throw new Error(`bridge read: ${bridgeReadError.message}`);
    if (!bridge) {
      console.warn('[Bridge Status] Bridge no encontrado:', bridgeId);
      return new NextResponse('OK', { status: 200 });
    }

    const orgId = bridge.organization_id as number;
    if (!(await accountSidMatchesOrg(orgId, accountSid, supabase))) {
      console.warn('[Bridge Status] AccountSid ajeno a la org del bridge', { org: orgId });
      return new NextResponse('Forbidden', { status: 403 });
    }

    const callSid = params.CallSid || '';
    const callStatus = params.CallStatus || '';
    const previous = bridge.status as BridgeStatus;
    const nowIso = new Date().toISOString();

    // 1. Bridge
    const next =
      leg === 'agent'
        ? applyAgentLegEvent(previous, { CallStatus: callStatus, AnsweredBy: params.AnsweredBy })
        : applyCustomerLegEvent(previous, { CallStatus: callStatus });

    const bridgePatch: Record<string, unknown> = {};
    if (next) bridgePatch.status = next;
    if (callSid) {
      if (leg === 'agent' && !bridge.agent_leg_sid) bridgePatch.agent_leg_sid = callSid;
      if (leg === 'customer' && bridge.customer_leg_sid !== callSid) bridgePatch.customer_leg_sid = callSid;
    }
    if (Object.keys(bridgePatch).length) {
      const { error } = await supabase
        .from('mobile_call_bridges')
        .update(bridgePatch)
        .eq('id', bridgeId)
        .eq('organization_id', orgId);
      if (error) throw new Error(`bridge update: ${error.message}`);
    }

    // 2. Llamada (una sola fila, localizada por `call_id`)
    const callId = bridge.call_id as string | null;
    if (!callId) return new NextResponse('OK', { status: 200 });

    const { data: callData, error: callReadError } = await supabase
      .from('calls')
      .select('id, organization_id, status, answered_at, started_at, ended_at, duration_seconds, metadata')
      .eq('id', callId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (callReadError) throw new Error(`call read: ${callReadError.message}`);
    const call = callData as CallRow | null;
    if (!call) return new NextResponse('OK', { status: 200 });

    const meta: Record<string, unknown> = { ...(call.metadata ?? {}) };
    const seqRaw = params.SequenceNumber;
    const seq = seqRaw === undefined || seqRaw === '' ? null : Number(seqRaw);
    if (seq !== null && Number.isFinite(seq)) {
      if (seq <= lastSeq(meta, leg)) return new NextResponse('OK', { status: 200 }); // duplicado / fuera de orden
      meta.last_seq = { ...((meta.last_seq as Record<string, unknown>) ?? {}), [leg]: seq };
    }

    const callPatch: Record<string, unknown> = { metadata: meta };

    if (leg === 'customer') {
      // El leg del cliente es el "hijo": su duración y su respuesta son las de
      // la conversación. El desenlace final lo confirma `dial-complete`.
      const update = applyStatusEvent(
        {
          status: call.status,
          answered_at: call.answered_at,
          started_at: call.started_at,
          metadata: meta,
        },
        {
          CallStatus: callStatus,
          CallDuration: params.CallDuration ?? null,
          AnsweredBy: params.AnsweredBy ?? null,
        },
        'child'
      );
      if (update) {
        Object.assign(meta, update.metadata);
        if (update.status) callPatch.status = update.status;
        if (update.answered_at) callPatch.answered_at = update.answered_at;
        if (update.ring_seconds !== undefined) callPatch.ring_seconds = update.ring_seconds;
        if (update.ended_at && !call.ended_at) callPatch.ended_at = update.ended_at;
        if (update.duration_seconds !== undefined && update.duration_seconds > (call.duration_seconds ?? 0)) {
          callPatch.duration_seconds = update.duration_seconds;
          callPatch.duration_source = 'provider';
        }
      }
      if (callSid) callPatch.customer_leg_sid = callSid;
    } else {
      // Leg del vendedor: su `CallDuration` NO es la conversación.
      const agentDuration = Number(params.CallDuration);
      if (Number.isFinite(agentDuration) && agentDuration > 0) {
        meta.agent_call_duration = Math.round(agentDuration);
      }
      if (params.AnsweredBy) meta.agent_answered_by = params.AnsweredBy;
      const mapped = next ? CALL_STATUS_FOR_BRIDGE[next] : undefined;
      if (mapped && !isTerminalStatus(call.status)) {
        callPatch.status = mapped;
        callPatch.ended_at = call.ended_at ?? nowIso;
        meta.reason = next;
      }
    }

    const { error: callUpdateError } = await supabase
      .from('calls')
      .update(callPatch)
      .eq('id', call.id)
      .eq('organization_id', orgId);
    if (callUpdateError) throw new Error(`call update: ${callUpdateError.message}`);

    // 3. Reembolso del minuto del cliente si nunca se le marcó (§8)
    if (next && isTerminalBridgeStatus(next) && customerLegNeverDialed(previous, next) && !meta.credits_refunded) {
      const ok = await refundVoiceMinutes(orgId, 1, supabase);
      if (ok) {
        const { error } = await supabase
          .from('calls')
          .update({ metadata: { ...meta, credits_refunded: 1 } })
          .eq('id', call.id)
          .eq('organization_id', orgId);
        if (error) console.error('[Bridge Status] marca de reembolso:', error.message);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    // 500 (no 200): Twilio reintenta y el evento no se pierde en silencio.
    console.error('[Bridge Status] Error:', error instanceof Error ? error.message : error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
