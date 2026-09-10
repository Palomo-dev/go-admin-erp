import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';

/**
 * Job `transcribe` (FASE-04 §4.4). payload: { call_id, recording_id?, force?, provider? }.
 * - Verifica que la llamada pertenezca a `orgId` (nunca confía en el payload).
 * - Errores no reintentables (NO_RECORDING, AUDIO_EMPTY, AUDIO_TOO_SHORT,
 *   INSUFFICIENT_CREDITS, CALL_NOT_FOUND) → JobFatalError (`failed` terminal).
 * - Proveedor 429/5xx/red → JobRetryableError (backoff de fn_fail_job).
 * - Al completar encola `analyze` (dedupe `analyze:{call_id}`) si la política lo permite.
 */
export const transcribeHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const callId = typeof job.payload.call_id === 'string' ? job.payload.call_id : null;
  if (!callId) throw new JobFatalError('payload.call_id requerido');
  const force = job.payload.force === true;
  const provider = typeof job.payload.provider === 'string' ? job.payload.provider : null;

  try {
    const out = await runTranscribePipeline(orgId, callId, { force, provider, supabase, jobId: job.id });
    log.info('transcribe_done', { call_id: callId, transcript_id: out.transcript.id, status: out.transcript.status, provider: out.transcript.provider, analyze_job_id: out.analyzeJobId });
    return {
      call_id: callId,
      transcript_id: out.transcript.id,
      status: out.transcript.status,
      provider: out.transcript.provider,
      pending_webhook: out.transcript.raw_response?.pending === true,
      analyze_job_id: out.analyzeJobId,
      ...(out.analyzeSkipped ? { analyze_skipped: out.analyzeSkipped } : {}),
    };
  } catch (err) {
    if (err instanceof TranscriptionError) {
      log.warn('transcribe_failed', { call_id: callId, code: err.code, retryable: err.retryable });
      if (err.retryable) throw new JobRetryableError(`${err.code}: ${err.message}`);
      throw new JobFatalError(`${err.code}: ${err.message}`);
    }
    if (err instanceof InsufficientCreditsError) throw new JobFatalError(`INSUFFICIENT_CREDITS: ${err.message}`);
    throw err instanceof JobFatalError || err instanceof JobRetryableError ? err : new JobRetryableError(err instanceof Error ? err.message : String(err));
  }
};
