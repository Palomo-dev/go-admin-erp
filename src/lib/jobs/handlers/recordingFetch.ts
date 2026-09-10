import type { SupabaseClient } from '@supabase/supabase-js';
import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { storeRecording, TwilioDownloadError } from '@/lib/services/crm/recordingStorageService';
import { getTelephonySettings } from '@/lib/services/crm/voiceContextService';
import { enqueueTranscribe } from '@/lib/services/crm/callIntelligenceService';
import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';

/**
 * Job `recording_fetch` (FASE-03 §4.4). payload:
 *   { call_id, recording_id, recording_url, recording_sid?, channels? }
 *
 * 1. Verifica que `call_recordings.id = recording_id` pertenezca a `orgId` y esté
 *    en `processing` (si ya está `ready` → skipped; `deleted|failed` → fatal).
 * 2. Descarga de Twilio con Basic Auth (API Key de la (sub)cuenta), dual
 *    `?RequestedChannels=2` (fallback mono si Twilio responde 400), sube a
 *    `crm-call-recordings/org_{id}/{yyyy}/{mm}/{callId}.mp3`, marca `ready` y
 *    `retention_until = hoy + voice_recording_retention_days`.
 * 3. Encola `transcribe` `{call_id, recording_id}` (dedupe `transcribe:{call_id}`,
 *    F4) si la política `auto_transcribe` lo permite y la duración ≥ mínimo.
 *
 * Reintentos: 404 de Twilio (la grabación aún se procesa) y 5xx/red →
 * `JobRetryableError` (backoff de `fn_fail_job`); 401/403 (credenciales) →
 * fatal + `call_recordings.status='failed'` para que la UI lo muestre.
 */
export const recordingFetchHandler: JobHandler = async ({ job, supabase, orgId, log, signal }) => {
  const recordingId = str(job.payload.recording_id);
  const recordingUrl = str(job.payload.recording_url);
  if (!recordingId) throw new JobFatalError('payload.recording_id requerido');

  const { data } = await supabase
    .from('call_recordings')
    .select('id, call_id, status, channels, duration_seconds, storage_path, storage_provider')
    .eq('id', recordingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  const rec = data as
    | { id: string; call_id: string; status: string; channels: string; duration_seconds: number | null; storage_path: string; storage_provider: string }
    | null;
  if (!rec) throw new JobFatalError(`call_recordings ${recordingId} no existe en la org ${orgId}`);
  if (rec.status === 'ready') return { skipped: true, reason: 'already_ready', recording_id: rec.id };
  if (rec.status === 'deleted' || rec.status === 'failed') throw new JobFatalError(`grabación en estado ${rec.status}`);

  const url = recordingUrl || (rec.storage_provider === 'twilio' && /^https?:\/\//i.test(rec.storage_path) ? rec.storage_path : null);
  if (!url) throw new JobFatalError('Sin recording_url (payload) ni storage_path de Twilio');

  const { data: callRow } = await supabase
    .from('calls')
    .select('id, started_at, duration_seconds')
    .eq('id', rec.call_id)
    .eq('organization_id', orgId)
    .maybeSingle();
  const call = callRow as { id: string; started_at: string | null; duration_seconds: number | null } | null;
  if (!call) throw new JobFatalError(`calls ${rec.call_id} no existe en la org ${orgId}`);

  if (signal.aborted) throw new JobRetryableError('aborted');
  const settings = await getTelephonySettings(orgId, supabase);

  let stored: { storagePath: string; sizeBytes: number; retentionUntil: string };
  try {
    stored = await storeRecording(
      {
        recordingId: rec.id,
        organizationId: orgId,
        callId: rec.call_id,
        recordingUrl: url,
        channels: str(job.payload.channels) ?? rec.channels,
        retentionDays: settings.voice_recording_retention_days,
        startedAt: call.started_at,
      },
      supabase
    );
  } catch (err) {
    if (err instanceof TwilioDownloadError) {
      log.warn('recording_download_failed', { recording_id: rec.id, status: err.status });
      if (err.status === 401 || err.status === 403) {
        await markFailed(supabase, orgId, rec.id);
        throw new JobFatalError(`Twilio ${err.status}: credenciales inválidas para descargar la grabación`);
      }
      if (err.status === 404) throw new JobRetryableError('Twilio 404: la grabación aún no está disponible', 120);
      throw new JobRetryableError(`Twilio ${err.status}`);
    }
    if (job.attempts >= job.max_attempts) await markFailed(supabase, orgId, rec.id);
    throw err instanceof JobFatalError ? err : new JobRetryableError(err instanceof Error ? err.message : String(err));
  }

  let transcribeJobId: string | null = null;
  try {
    const policy = await getCallAiPolicy(orgId);
    const duration = rec.duration_seconds ?? call.duration_seconds ?? 0;
    if (policy.autoTranscribe && duration >= policy.minDurationSeconds) {
      transcribeJobId = await enqueueTranscribe(orgId, rec.call_id, { recording_id: rec.id }, supabase);
    } else {
      log.info('transcribe_skipped', { recording_id: rec.id, auto: policy.autoTranscribe, duration, min: policy.minDurationSeconds });
    }
  } catch (err) {
    // La grabación ya está `ready`; no reintentar el job por un fallo al encolar.
    log.warn('transcribe_enqueue_failed', { recording_id: rec.id, error: err instanceof Error ? err.message : String(err) });
  }

  log.info('recording_ready', { recording_id: rec.id, call_id: rec.call_id, path: stored.storagePath, bytes: stored.sizeBytes, transcribe_job_id: transcribeJobId });
  return { recording_id: rec.id, call_id: rec.call_id, storage_path: stored.storagePath, size_bytes: stored.sizeBytes, retention_until: stored.retentionUntil, transcribe_job_id: transcribeJobId };
};

async function markFailed(sb: SupabaseClient, orgId: number, recordingId: string): Promise<void> {
  const { error } = await sb.from('call_recordings').update({ status: 'failed' }).eq('id', recordingId).eq('organization_id', orgId);
  if (error) console.warn('[recordingFetch] markFailed:', error.message);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : v === null || v === undefined ? null : String(v);
}
