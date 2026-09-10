import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { buildStoragePath } from '@/lib/services/crm/recordingStorageService';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { EMPTY_TWIML, xmlResponse } from '@/lib/services/crm/twimlBuilders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/recording — recordingStatusCallback de Twilio (FASE-03 §4.3).
 *
 * `RecordingStatus=completed` → upsert `call_recordings` por `provider_recording_sid`
 * (índice único `idx_recordings_sid`): `channels = RecordingChannels` (texto),
 * `status='processing'`, `storage_path` provisional (`org_{id}/{yyyy}/{mm}/{callId}.mp3`),
 * `storage_provider='twilio'` (transitorio) y encola el job `recording_fetch`
 * `{call_id, recording_id, recording_url, recording_sid}` con dedupe
 * `recording_fetch:{RecordingSid}` (Twilio reintenta el callback → 1 fila, 1 job).
 * `absent` → sin cambios (no hubo audio). `in-progress` no está suscrito.
 *
 * Seguridad: firma fail-closed (SEC); la org se resuelve por la fila `calls`.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  let accountSid: string;
  try {
    ({ params, accountSid } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Voice Recording] Rechazado:', err.code);
      return new Response('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  const recordingSid = params.RecordingSid || '';
  const callSid = params.CallSid || '';
  const status = params.RecordingStatus || '';
  const recordingUrl = params.RecordingUrl || '';
  if (!callSid || !recordingSid || status !== 'completed' || !recordingUrl) {
    return xmlResponse(EMPTY_TWIML);
  }

  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from('calls')
      .select('id, organization_id, started_at')
      .eq('provider_call_sid', callSid)
      .limit(1)
      .maybeSingle();
    const call = data as { id: string; organization_id: number; started_at: string | null } | null;
    if (!call) {
      console.warn('[Voice Recording] Llamada no encontrada para CallSid', callSid);
      return xmlResponse(EMPTY_TWIML);
    }
    // Aislamiento multi-tenant (M1): `provider_call_sid` es único por org.
    if (!(await accountSidMatchesOrg(call.organization_id, accountSid, sb))) {
      console.warn('[Voice Recording] AccountSid ajeno a la org de la llamada', { org: call.organization_id });
      return new Response('Forbidden', { status: 403 });
    }

    const channels = String(params.RecordingChannels || '1');
    const duration = params.RecordingDuration ? parseInt(params.RecordingDuration, 10) : null;
    const startedAt = call.started_at ? new Date(call.started_at) : new Date();

    const { data: existing } = await sb
      .from('call_recordings')
      .select('id, status')
      .eq('provider_recording_sid', recordingSid)
      .limit(1)
      .maybeSingle();

    let recordingId: string;
    if (existing) {
      recordingId = (existing as { id: string }).id;
      if ((existing as { status: string }).status === 'ready') return xmlResponse(EMPTY_TWIML);
    } else {
      const { data: created, error } = await sb
        .from('call_recordings')
        .insert({
          organization_id: call.organization_id,
          call_id: call.id,
          provider_recording_sid: recordingSid,
          channels,
          duration_seconds: Number.isFinite(duration) ? duration : null,
          storage_path: buildStoragePath(call.organization_id, call.id, 'mp3', Number.isNaN(startedAt.getTime()) ? new Date() : startedAt),
          storage_provider: 'twilio',
          status: 'processing',
        })
        .select('id')
        .single();
      if (error) {
        // Carrera con otro callback: releer
        const { data: again } = await sb.from('call_recordings').select('id').eq('provider_recording_sid', recordingSid).maybeSingle();
        if (!again) throw new Error(error.message);
        recordingId = (again as { id: string }).id;
      } else {
        recordingId = (created as { id: string }).id;
      }
    }

    await enqueueJob({
      organizationId: call.organization_id,
      kind: 'recording_fetch',
      payload: { call_id: call.id, recording_id: recordingId, recording_url: recordingUrl, recording_sid: recordingSid, channels },
      dedupeKey: `recording_fetch:${recordingSid}`,
      maxAttempts: 6,
      supabase: sb,
    });

    return xmlResponse(EMPTY_TWIML);
  } catch (error: unknown) {
    console.error('[Voice Recording] error:', error instanceof Error ? error.message : error);
    return xmlResponse(EMPTY_TWIML, 500);
  }
}
