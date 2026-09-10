/**
 * Orquestación grabación → transcripción → análisis → actividad (FASE-04 §2)
 * y handlers `transcribe`/`analyze` encadenados (§4.4). Servicios de proveedor
 * mockeados; se verifica el encadenado (enqueue `analyze` con dedupe por
 * llamada), la política `auto_analyze`, la actividad única y el mapeo de
 * errores a JobRetryableError/JobFatalError.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({ __service: true })), assertServerOnly: jest.fn() }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-analyze-1') }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/transcriptionService', () => {
  class TranscriptionError extends Error {
    code: string; retryable: boolean;
    constructor(code: string, message: string, retryable = false) { super(message); this.name = 'TranscriptionError'; this.code = code; this.retryable = retryable; }
  }
  return { transcribeCall: jest.fn(), TranscriptionError, RECORDINGS_BUCKET: 'crm-call-recordings' };
});
jest.mock('@/lib/services/crm/callAnalysisService', () => {
  class AnalysisError extends Error {
    code: string; retryable: boolean;
    constructor(code: string, message: string, retryable = false) { super(message); this.name = 'AnalysisError'; this.code = code; this.retryable = retryable; }
  }
  return { analyzeCall: jest.fn(), runPostAnalysisActions: jest.fn(async () => ({ applied: ['tags', 'discovery'], skipped: [] })), AnalysisError };
});
jest.mock('@/lib/services/crm/callActivityService', () => ({
  upsertCallActivity: jest.fn(async () => ({ activityId: 'act-1', created: true })),
  touchOpportunityFromCall: jest.fn(async () => true),
  notifyCallAnalyzed: jest.fn(async () => 'notif-1'),
  mapCallStatusToOutcome: jest.fn(() => 'answered'),
}));

import { enqueueJob } from '@/lib/jobs/enqueue';
import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { transcribeCall, TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { analyzeCall, runPostAnalysisActions, AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { upsertCallActivity, touchOpportunityFromCall, notifyCallAnalyzed } from '@/lib/services/crm/callActivityService';
import { runTranscribePipeline, runAnalysisPipeline, enqueueTranscribe, enqueueAnalyze, isEmptyTranscript, TRANSCRIBE_DEDUPE, ANALYZE_DEDUPE } from '../callIntelligenceService';
import { transcribeHandler } from '@/lib/jobs/handlers/transcribe';
import { analyzeHandler } from '@/lib/jobs/handlers/analyze';
import { JobFatalError, JobRetryableError, type JobContext, type OutboundJob } from '@/lib/jobs/types';

const policy = { autoTranscribe: true, autoAnalyze: true, apply: 'suggest', stageConfidenceThreshold: 0.8 };
const completed = { id: 'tr-1', call_id: 'call-1', organization_id: 7, status: 'completed', provider: 'elevenlabs', full_text: 'Hola Juan, te llamo por la propuesta.', word_count: 7, raw_response: {} };
const callRow = { id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: 't', ended_at: 't', duration_seconds: 120, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'user-1' };
const analysisRow = { id: 'an-1', call_id: 'call-1', transcript_id: 'tr-1', summary: 'Resumen', sentiment: 'mixed', quality_score: 70, next_steps: [], suggested_tasks: [{ title: 'x' }], suggested_stage_id: 'st-2', raw_response: { temperature: 'warm', suggested_tags: ['Tibio'], applied_actions: [] } };

function makeSb(rows: Record<string, unknown[]>): SupabaseClient {
  const from = jest.fn((table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
    b.maybeSingle = async () => ({ data: rows[table]?.shift() ?? null, error: null });
    return b;
  });
  return { from } as unknown as SupabaseClient;
}

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const job = (payload: Record<string, unknown>, kind: OutboundJob['kind']): OutboundJob => ({
  id: 'job-1', organization_id: 7, kind, payload, status: 'running', run_at: 't', attempts: 1, max_attempts: 3, last_error: null, result: null, locked_at: null, locked_by: 'w', dedupe_key: null, created_at: 't', updated_at: 't',
});
const ctx = (j: OutboundJob, sb: SupabaseClient): JobContext => ({ job: j, supabase: sb, orgId: 7, log, signal: new AbortController().signal });

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(policy);
  (transcribeCall as jest.Mock).mockResolvedValue(completed);
  (analyzeCall as jest.Mock).mockResolvedValue(analysisRow);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('runTranscribePipeline', () => {
  it('transcripción completada + auto_analyze → encola `analyze` con dedupe analyze:{call_id} y transcript_id', async () => {
    const sb = makeSb({});
    const out = await runTranscribePipeline(7, 'call-1', { supabase: sb, jobId: 'job-1' });
    expect(transcribeCall).toHaveBeenCalledWith(7, 'call-1', expect.objectContaining({ supabase: sb, jobId: 'job-1' }));
    expect(out.analyzeJobId).toBe('job-analyze-1');
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, kind: 'analyze', dedupeKey: 'analyze:call-1', payload: expect.objectContaining({ call_id: 'call-1', transcript_id: 'tr-1' }), maxAttempts: 3 }));
  });

  it('transcripción pendiente (webhook async) → no encola análisis', async () => {
    (transcribeCall as jest.Mock).mockResolvedValue({ ...completed, status: 'processing', raw_response: { pending: true } });
    const out = await runTranscribePipeline(7, 'call-1', { supabase: makeSb({}) });
    expect(out.analyzeJobId).toBeNull();
    expect(out.analyzeSkipped).toBe('not_completed');
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('transcripción completada pero vacía (silencio; caso real E2E) → no encola análisis (empty_transcript)', async () => {
    (transcribeCall as jest.Mock).mockResolvedValue({ ...completed, full_text: '', word_count: 0, segments: [] });
    const out = await runTranscribePipeline(7, 'call-1', { supabase: makeSb({}) });
    expect(out.analyzeSkipped).toBe('empty_transcript');
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(isEmptyTranscript({ full_text: null, word_count: null, segments: undefined })).toBe(true);
    expect(isEmptyTranscript({ full_text: 'hola', word_count: 1, segments: [] })).toBe(false);
  });

  it('política auto_analyze=false → no encola; chainAnalyze fuerza el encadenado', async () => {
    (getCallAiPolicy as jest.Mock).mockResolvedValue({ ...policy, autoAnalyze: false });
    expect((await runTranscribePipeline(7, 'call-1', { supabase: makeSb({}) })).analyzeJobId).toBeNull();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect((await runTranscribePipeline(7, 'call-1', { supabase: makeSb({}), chainAnalyze: true })).analyzeJobId).toBe('job-analyze-1');
  });

  it('inlineAnalyze → ejecuta el análisis en la misma llamada sin encolar', async () => {
    const out = await runTranscribePipeline(7, 'call-1', { supabase: makeSb({ calls: [callRow] }), inlineAnalyze: true });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(out.analysis?.analysis.id).toBe('an-1');
    expect(out.analysis?.activityId).toBe('act-1');
  });
});

describe('runAnalysisPipeline', () => {
  it('analiza → actividad única enriquecida → last_contact/temperatura → acciones según política → notificación', async () => {
    const sb = makeSb({ calls: [callRow], opportunities: [{ salesperson_id: 'user-sales', customers: { full_name: 'Juan Pérez', company_name: null } }] });
    const out = await runAnalysisPipeline(7, 'call-1', { supabase: sb, jobId: 'job-2' });
    expect(analyzeCall).toHaveBeenCalledWith(7, 'call-1', expect.objectContaining({ supabase: sb, jobId: 'job-2' }));
    expect(upsertCallActivity).toHaveBeenCalledWith(7, 'call-1', expect.objectContaining({
      supabase: sb, call: callRow,
      enrich: expect.objectContaining({ summary: 'Resumen', sentiment: 'mixed', qualityScore: 70, temperature: 'warm', transcriptId: 'tr-1', analysisId: 'an-1', tags: ['Tibio'] }),
    }));
    expect(touchOpportunityFromCall).toHaveBeenCalledWith(7, callRow, { contactResult: 'answered', temperature: 'warm' }, sb);
    expect(runPostAnalysisActions).toHaveBeenCalledWith(7, analysisRow, policy, sb);
    expect(notifyCallAnalyzed).toHaveBeenCalledWith(7, callRow, expect.objectContaining({ analysisId: 'an-1', suggestions: 2, policy: 'suggest', customerName: 'Juan Pérez', salespersonId: 'user-sales', movedStage: false }), sb);
    expect(out).toMatchObject({ activityId: 'act-1', notificationId: 'notif-1', apply: { applied: ['tags', 'discovery'] } });
  });

  it('análisis ya aplicado (applied_actions no vacío) → no repite acciones ni notificación, pero sí actualiza la actividad', async () => {
    (analyzeCall as jest.Mock).mockResolvedValue({ ...analysisRow, raw_response: { ...analysisRow.raw_response, applied_actions: ['tags'] } });
    const out = await runAnalysisPipeline(7, 'call-1', { supabase: makeSb({ calls: [callRow] }) });
    expect(upsertCallActivity).toHaveBeenCalledTimes(1);
    expect(runPostAnalysisActions).not.toHaveBeenCalled();
    expect(notifyCallAnalyzed).not.toHaveBeenCalled();
    expect(out.apply).toBeNull();
  });

  it('fallo al escribir la actividad no rompe el pipeline (se loguea)', async () => {
    (upsertCallActivity as jest.Mock).mockRejectedValueOnce(new Error('activities insert falló'));
    const out = await runAnalysisPipeline(7, 'call-1', { supabase: makeSb({ calls: [callRow], opportunities: [{ salesperson_id: null, customers: null }] }) });
    expect(out.activityId).toBeNull();
    expect(out.analysis.id).toBe('an-1');
  });
});

describe('enqueueTranscribe / enqueueAnalyze', () => {
  it('dedupe por llamada y sufijo :retry:{n} en reintentos manuales', async () => {
    await enqueueTranscribe(7, 'call-1', { recording_id: 'rec-1', provider: 'google' });
    expect(enqueueJob).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'transcribe', dedupeKey: TRANSCRIBE_DEDUPE('call-1'), payload: { call_id: 'call-1', recording_id: 'rec-1', force: false, provider: 'google' } }));
    await enqueueTranscribe(7, 'call-1', { force: true, retry: 3 });
    expect(enqueueJob).toHaveBeenLastCalledWith(expect.objectContaining({ dedupeKey: 'transcribe:call-1:retry:3', payload: expect.objectContaining({ force: true }) }));
    await enqueueAnalyze(7, 'call-1');
    expect(enqueueJob).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'analyze', dedupeKey: ANALYZE_DEDUPE('call-1') }));
  });
});

describe('handlers transcribe → analyze (encadenados)', () => {
  it('transcribe: devuelve transcript_id + analyze_job_id y pasa force/provider/jobId', async () => {
    const res = await transcribeHandler(ctx(job({ call_id: 'call-1', recording_id: 'rec-1', force: true, provider: 'google' }, 'transcribe'), makeSb({})));
    expect(transcribeCall).toHaveBeenCalledWith(7, 'call-1', expect.objectContaining({ force: true, provider: 'google', jobId: 'job-1' }));
    expect(res).toMatchObject({ call_id: 'call-1', transcript_id: 'tr-1', status: 'completed', analyze_job_id: 'job-analyze-1', pending_webhook: false });
  });

  it('transcribe: sin call_id → JobFatalError sin llamar al servicio', async () => {
    await expect(transcribeHandler(ctx(job({}, 'transcribe'), makeSb({})))).rejects.toBeInstanceOf(JobFatalError);
    expect(transcribeCall).not.toHaveBeenCalled();
  });

  it('transcribe: NO_RECORDING/INSUFFICIENT_CREDITS → JobFatalError (failed terminal); PROVIDER_ERROR reintentable → JobRetryableError', async () => {
    (transcribeCall as jest.Mock).mockRejectedValueOnce(new TranscriptionError('NO_RECORDING', 'sin grabación', false));
    await expect(transcribeHandler(ctx(job({ call_id: 'call-1' }, 'transcribe'), makeSb({})))).rejects.toThrow(/NO_RECORDING/);
    (transcribeCall as jest.Mock).mockRejectedValueOnce(new TranscriptionError('INSUFFICIENT_CREDITS', 'sin créditos', false));
    await expect(transcribeHandler(ctx(job({ call_id: 'call-1' }, 'transcribe'), makeSb({})))).rejects.toBeInstanceOf(JobFatalError);
    (transcribeCall as jest.Mock).mockRejectedValueOnce(new TranscriptionError('PROVIDER_ERROR', 'elevenlabs=429', true));
    await expect(transcribeHandler(ctx(job({ call_id: 'call-1' }, 'transcribe'), makeSb({})))).rejects.toBeInstanceOf(JobRetryableError);
    (transcribeCall as jest.Mock).mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(transcribeHandler(ctx(job({ call_id: 'call-1' }, 'transcribe'), makeSb({})))).rejects.toBeInstanceOf(JobRetryableError);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('analyze: devuelve analysis_id/activity_id/applied; NO_TRANSCRIPT → fatal; proveedor caído → reintentable', async () => {
    const sb = makeSb({ calls: [callRow], opportunities: [{ salesperson_id: null, customers: null }] });
    const res = await analyzeHandler(ctx(job({ call_id: 'call-1', transcript_id: 'tr-1' }, 'analyze'), sb));
    expect(res).toMatchObject({ call_id: 'call-1', analysis_id: 'an-1', activity_id: 'act-1', applied: ['tags', 'discovery'], notification_id: 'notif-1' });
    (analyzeCall as jest.Mock).mockRejectedValueOnce(new AnalysisError('NO_TRANSCRIPT', 'sin transcripción', false));
    await expect(analyzeHandler(ctx(job({ call_id: 'call-1' }, 'analyze'), makeSb({})))).rejects.toBeInstanceOf(JobFatalError);
    (analyzeCall as jest.Mock).mockRejectedValueOnce(new AnalysisError('PROVIDER_ERROR', 'google=503 | openai=timeout', true));
    await expect(analyzeHandler(ctx(job({ call_id: 'call-1' }, 'analyze'), makeSb({})))).rejects.toBeInstanceOf(JobRetryableError);
    await expect(analyzeHandler(ctx(job({}, 'analyze'), makeSb({})))).rejects.toBeInstanceOf(JobFatalError);
  });
});
