import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { applyDialComplete, mergeTerminalOutcome } from '@/lib/services/crm/callStateMachine';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { mutateCallFromSnapshot } from '@/lib/services/crm/callMutationService';
import { settleVoiceCall } from '@/lib/services/crm/callCreditsService';
import { upsertCallActivity } from '@/lib/services/crm/callActivitySync';
import { buildHangupTwiml, xmlResponse } from '@/lib/services/crm/twimlBuilders';
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
  metadata: Record<string, unknown>;
}

/**
 * POST /api/voice/dial-complete?callId=… — `action` del `<Dial>` (FASE-03 §4.3).
 *
 * `DialCallStatus/DialCallSid/DialCallDuration/DialBridged` → estado final
 * (pegajoso), `duration_seconds = DialCallDuration` (fuente `provider`),
 * `customer_leg_sid`, `ended_at`; liquida créditos y crea/actualiza la
 * actividad de la llamada. Responde `<Hangup/>` (saliente) o mensaje de
 * "no disponible" + `<Hangup/>` (entrante sin respuesta).
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) return new Response('Forbidden', { status: err.statusCode });
    throw err;
  }

  const callId = new URL(request.url).searchParams.get('callId') || '';
  const sb = getServiceClient();
  const { data, error: readError } = await sb.from('calls').select('*').eq('id', callId).maybeSingle();
  if (readError) return new Response('Error', { status: 500 });
  const call = data as CallRow | null;
  if (!call) return xmlResponse(buildHangupTwiml());
  // Aislamiento multi-tenant (M1): la firma solo prueba que el AccountSid es
  // resoluble, no que sea el de ESTA organización.
  if (!(await accountSidMatchesOrg(call.organization_id, accountSid, sb))) {
    console.warn('[dial-complete] AccountSid ajeno a la org de la llamada', { org: call.organization_id });
    return new Response('Forbidden', { status: 403 });
  }

  const dialStatus = String(params.DialCallStatus || '').toLowerCase();
  const answeredInbound = call.direction === 'inbound' && (dialStatus === 'completed' || dialStatus === 'answered');

  try {
    const eventTime = new Date();
    const final = await mutateCallFromSnapshot(sb, call, (fresh) => {
      const update = applyDialComplete(
        { status: fresh.status, answered_at: fresh.answered_at, started_at: fresh.started_at, metadata: fresh.metadata ?? {} },
        {
          DialCallStatus: params.DialCallStatus || '',
          DialCallSid: params.DialCallSid || null,
          DialCallDuration: params.DialCallDuration ?? null,
          DialBridged: params.DialBridged ?? null,
        }, eventTime
      );
      // Terminal pegajoso + duración que no se pisa con 0 (A1): `DialCallDuration`
      // ausente significa "no sé", no "duró 0 s".
      const merged = mergeTerminalOutcome({
        currentStatus: fresh.status,
        currentDuration: fresh.duration_seconds,
        currentAnsweredAt: fresh.answered_at,
        incomingStatus: update.status,
        incomingDuration: update.duration_seconds,
      });
      const patch: Record<string, unknown> = { metadata: update.metadata };
      if (merged.status) patch.status = merged.status;
      if (!fresh.ended_at) patch.ended_at = update.ended_at;
      if (merged.duration_seconds !== undefined) {
        patch.duration_seconds = merged.duration_seconds;
        patch.duration_source = update.duration_source;
      }
      if (update.customer_leg_sid) patch.customer_leg_sid = update.customer_leg_sid;
      const finalStatus = (merged.status ?? fresh.status) as CallStatus;
      if (finalStatus === 'completed' && !fresh.answered_at) patch.answered_at = fresh.started_at ?? update.ended_at;

      return patch;
    });

    // Concilia el cobro si el desenlace final cambió la duración facturable
    // (buzón liquidado con 0, o duración corregida por el `<Dial>`).
    await settleVoiceCall(final, sb, { reconcile: true }).catch((e) => console.warn('[dial-complete] settle:', e instanceof Error ? e.message : e));
    await upsertCallActivity(final, sb);
  } catch (err) {
    console.error('[dial-complete] error:', err instanceof Error ? err.message : err);
    return new Response('Error', { status: 500 });
  }

  if (call.direction === 'inbound' && !answeredInbound) {
    return xmlResponse(buildHangupTwiml('En este momento no podemos atender su llamada. Por favor intente más tarde.'));
  }
  return xmlResponse(buildHangupTwiml());
}
