import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { buildStoragePath } from '@/lib/services/crm/recordingStorageService';
import { accountSidMatchesOrg } from '@/lib/services/crm/voiceContextService';
import { EMPTY_TWIML, xmlResponse } from '@/lib/services/crm/twimlBuilders';
import { voidConsentWithoutRecording, recordConsent, unverifiedAnnouncementText, UNVERIFIED_ANNOUNCED_AT_NOTE } from '@/lib/services/crm/consentService';
import { getTelephonySettings } from '@/lib/services/crm/voiceContextService';
import { updateCall } from '@/lib/services/crm/callManagementService';

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
 * `absent` (ronda 5) → la grabación NO existe (error de sistema, silencio
 * recortado a cero, borrado automático). Si la llamada no tiene NINGUNA
 * grabación registrada, `voidConsentWithoutRecording` retira el acta y deja
 * `recording_enabled=false` / `consent_given=false`: un acta sin grabación es
 * un acta que miente sobre lo que la organización conserva. Es el cierre del
 * lazo de `<Start><Recording>` (agente IA), que no tiene señal síncrona de
 * fallo.
 *
 * Ronda 6:
 * - `in-progress` (suscrito ahora) deja `calls.metadata.recording_started_at`:
 *   la única evidencia positiva de que la grabación arrancó.
 * - `completed` de una llamada SIN acta (punto a: el whisper que Twilio no
 *   consiguió traer): la grabación EXISTE y se registra igual (ocultarla sería
 *   peor), pero queda escrito que el aviso no se pudo acreditar: acta con
 *   `method='unverified_announcement'` (sin `consent_given`, que sigue en
 *   `false`), `metadata.consent_unverified_reason` y un `console.error`.
 * - El simétrico —acta sin grabación y sin callback alguno— lo cierra la
 *   reconciliación diaria (`consentReconcileService`, vía `runMaintenance`).
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
  if (callSid && status === 'absent') return handleAbsent(callSid, accountSid);
  if (callSid && status === 'in-progress') return handleInProgress(callSid, accountSid, recordingSid);
  if (!callSid || !recordingSid || status !== 'completed' || !recordingUrl) {
    return xmlResponse(EMPTY_TWIML);
  }

  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from('calls')
      .select('id, organization_id, started_at, metadata')
      .eq('provider_call_sid', callSid)
      .limit(1)
      .maybeSingle();
    const call = data as { id: string; organization_id: number; started_at: string | null; metadata: Record<string, unknown> | null } | null;
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

    await reconcileCompletedWithoutConsent(sb, call);

    return xmlResponse(EMPTY_TWIML);
  } catch (error: unknown) {
    console.error('[Voice Recording] error:', error instanceof Error ? error.message : error);
    return xmlResponse(EMPTY_TWIML, 500);
  }
}

/**
 * Punto (a): hay grabación `completed` y NO hay acta. La grabación ya quedó
 * registrada arriba (existe y hay que gobernarla: retención, borrado). Queda
 * escrito que el aviso no se pudo acreditar: acta `unverified_announcement`
 * con `consentGiven: false` (la fila `calls` NO pasa a `consent_given=true`),
 * metadata y error en el log. Idempotente: un reintento no duplica el acta.
 */
async function reconcileCompletedWithoutConsent(
  sb: ReturnType<typeof getServiceClient>,
  call: { id: string; organization_id: number; metadata: Record<string, unknown> | null }
): Promise<void> {
  const { data: actas, error } = await sb
    .from('call_consents')
    .select('id')
    .eq('organization_id', call.organization_id)
    .eq('call_id', call.id)
    .eq('consent_type', 'recording')
    .limit(1);
  if (error) throw new Error(`call_consents select: ${error.message}`);
  if ((actas ?? []).length > 0) return;

  console.error('[Voice Recording] grabación completada sin acta: el aviso no se pudo acreditar', { org: call.organization_id, callId: call.id });
  const settings = await getTelephonySettings(call.organization_id, sb);
  const now = new Date().toISOString();
  // F-4 (ronda 7): la acta dice lo que consta, no lo que se configuró.
  // `recorded_announcement_text` deja explícito que NO consta que el aviso
  // sonara (antes copiaba el aviso configurado como si se hubiera reproducido)
  // y `announced_at` (NOT NULL en la tabla) es la hora de ESTE callback, no la
  // de un aviso: queda aclarado en `calls.metadata`.
  await recordConsent(
    call.organization_id,
    {
      callId: call.id,
      consentType: 'recording',
      consentGiven: false,
      consentMessage: unverifiedAnnouncementText(now, settings.voice_consent_message),
      method: 'unverified_announcement',
      announcedAt: now,
    },
    sb
  );
  const metadata = {
    ...(call.metadata ?? {}),
    consent_unverified_at: now,
    consent_unverified_reason: 'recording_completed_without_consent',
    consent_unverified_announced_at_note: UNVERIFIED_ANNOUNCED_AT_NOTE,
  };
  await updateCall(call.id, call.organization_id, { consent_given: false, metadata }, sb);
}

/** `RecordingStatus=in-progress`: evidencia positiva de que la grabación arrancó. */
async function handleInProgress(callSid: string, accountSid: string, recordingSid: string): Promise<Response> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from('calls').select('id, organization_id, metadata').eq('provider_call_sid', callSid).limit(1).maybeSingle();
    const call = data as { id: string; organization_id: number; metadata: Record<string, unknown> | null } | null;
    if (!call) return xmlResponse(EMPTY_TWIML);
    if (!(await accountSidMatchesOrg(call.organization_id, accountSid, sb))) {
      console.warn('[Voice Recording] in-progress: AccountSid ajeno a la org de la llamada', { org: call.organization_id });
      return new Response('Forbidden', { status: 403 });
    }
    const metadata = { ...(call.metadata ?? {}), recording_started_at: new Date().toISOString(), ...(recordingSid ? { recording_started_sid: recordingSid } : {}) };
    await updateCall(call.id, call.organization_id, { metadata }, sb);
    return xmlResponse(EMPTY_TWIML);
  } catch (err) {
    console.error('[Voice Recording] in-progress error:', err instanceof Error ? err.message : err);
    return xmlResponse(EMPTY_TWIML, 500);
  }
}

/** `RecordingStatus=absent`: sin ninguna grabación registrada, retirar acta y flags. */
async function handleAbsent(callSid: string, accountSid: string): Promise<Response> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from('calls').select('id, organization_id').eq('provider_call_sid', callSid).limit(1).maybeSingle();
    const call = data as { id: string; organization_id: number } | null;
    if (!call) return xmlResponse(EMPTY_TWIML);
    if (!(await accountSidMatchesOrg(call.organization_id, accountSid, sb))) {
      console.warn('[Voice Recording] absent: AccountSid ajeno a la org de la llamada', { org: call.organization_id });
      return new Response('Forbidden', { status: 403 });
    }
    const { data: recordings, error } = await sb
      .from('call_recordings')
      .select('id')
      .eq('organization_id', call.organization_id)
      .eq('call_id', call.id)
      .limit(1);
    if (error) throw new Error(error.message);
    if ((recordings ?? []).length > 0) return xmlResponse(EMPTY_TWIML);
    await voidConsentWithoutRecording(call.id, call.organization_id, sb, 'twilio_recording_absent');
    console.warn('[Voice Recording] grabación ausente: acta y flags retirados', { org: call.organization_id, callId: call.id });
    return xmlResponse(EMPTY_TWIML);
  } catch (err) {
    console.error('[Voice Recording] absent error:', err instanceof Error ? err.message : err);
    return xmlResponse(EMPTY_TWIML, 500);
  }
}
