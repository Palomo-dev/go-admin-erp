import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { runAnalysisPipeline } from '@/lib/services/crm/callIntelligenceService';
import { AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';

/**
 * Job `analyze` (FASE-04 §4.4). payload: { call_id, transcript_id?, force? }.
 * analyzeCall → upsertCallActivity → touchOpportunity → acciones según
 * política (auto|suggest) → notificación al vendedor.
 * NO_TRANSCRIPT / INSUFFICIENT_CREDITS / CALL_NOT_FOUND → fatal; proveedor caído → reintentable.
 */
export const analyzeHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const callId = typeof job.payload.call_id === 'string' ? job.payload.call_id : null;
  if (!callId) throw new JobFatalError('payload.call_id requerido');
  const force = job.payload.force === true;

  try {
    const out = await runAnalysisPipeline(orgId, callId, { force, supabase, jobId: job.id });
    log.info('analyze_done', { call_id: callId, analysis_id: out.analysis.id, provider: out.analysis.provider, activity_id: out.activityId, applied: out.apply?.applied ?? [] });
    return {
      call_id: callId,
      analysis_id: out.analysis.id,
      provider: out.analysis.provider,
      activity_id: out.activityId,
      applied: out.apply?.applied ?? [],
      skipped: out.apply?.skipped ?? [],
      notification_id: out.notificationId,
    };
  } catch (err) {
    if (err instanceof AnalysisError) {
      log.warn('analyze_failed', { call_id: callId, code: err.code, retryable: err.retryable });
      if (err.retryable) throw new JobRetryableError(`${err.code}: ${err.message}`);
      throw new JobFatalError(`${err.code}: ${err.message}`);
    }
    if (err instanceof InsufficientCreditsError) throw new JobFatalError(`INSUFFICIENT_CREDITS: ${err.message}`);
    throw err instanceof JobFatalError || err instanceof JobRetryableError ? err : new JobRetryableError(err instanceof Error ? err.message : String(err));
  }
};
