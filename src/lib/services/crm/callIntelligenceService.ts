import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { transcribeCall, type CallTranscript, type TranscribeOptions } from '@/lib/services/crm/transcriptionService';
import { analyzeCall, runPostAnalysisActions, type CallAnalysis, type ApplyResult, type AnalyzeOptions } from '@/lib/services/crm/callAnalysisService';
import { upsertCallActivity, touchOpportunityFromCall, notifyCallAnalyzed, mapCallStatusToOutcome, type CallRowForActivity } from '@/lib/services/crm/callActivityService';

/**
 * Orquestación grabación → transcripción → análisis → actividad (FASE-04 §2).
 * SOLO SERVIDOR. La usan los handlers de jobs (`transcribe`, `analyze`) y las
 * rutas en modo `?sync=1`.
 */

export const TRANSCRIBE_DEDUPE = (callId: string) => `transcribe:${callId}`;
export const ANALYZE_DEDUPE = (callId: string) => `analyze:${callId}`;

/**
 * Ronda 4 (tester r3 N4) — ventana del sufijo de reintento.
 *
 * El sufijo `:retry:<n>` existe para que un reintento pueda saltarse el dedupe
 * de un job ya terminado. Con `Date.now()` cada clic generaba una clave distinta
 * y DOS clics seguidos en «Reanalizar» encolaban DOS jobs: dos análisis y dos
 * cobros. Con la marca redondeada a un minuto, los clics de esa misma ventana
 * comparten `dedupe_key` y el índice único parcial de `outbound_jobs`
 * (`outbound_jobs_dedupe_live_uidx`, sobre `queued|running`) deja pasar sólo el
 * primero: `fn_enqueue_job` devuelve el id del job vivo en vez de crear otro.
 * Es una exclusión REAL entre procesos, no un candado en memoria.
 */
export const FORCE_RETRY_WINDOW_MS = 60_000;

/** Marca de reintento estable dentro de la ventana (ver `FORCE_RETRY_WINDOW_MS`). */
export function forceRetryBucket(now: number = Date.now()): number {
  return Math.floor(now / FORCE_RETRY_WINDOW_MS);
}

export interface LiveJobLookup {
  /** Id del job vivo (`queued|running`) para esa llamada, o null si no hay. */
  jobId: string | null;
  /** false si la consulta falló: el llamador NO puede concluir que no hay job. */
  checked: boolean;
  error: string | null;
}

/**
 * ¿Hay ya un job `transcribe`/`analyze` VIVO para esta llamada?
 *
 * Lo usan las rutas en modo `?sync=1`, que ejecutan el pipeline en línea sin
 * pasar por la cola: sin esta comprobación, pulsar «Analizar» mientras un job
 * está encolado ejecutaba el análisis DOS veces y cobraba dos veces (tester r3
 * N4). No traga el error: si la consulta falla lo dice en `checked`/`error` y el
 * llamador decide (aquí: seguir y publicarlo en la respuesta).
 */
export async function findLiveCallJob(
  orgId: number,
  callId: string,
  kind: 'transcribe' | 'analyze',
  supabase?: SupabaseClient,
): Promise<LiveJobLookup> {
  const sb = supabase ?? getServiceClient();
  const base = kind === 'analyze' ? ANALYZE_DEDUPE(callId) : TRANSCRIBE_DEDUPE(callId);
  const { data, error } = await sb
    .from('outbound_jobs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('kind', kind)
    .in('status', ['queued', 'running'])
    .like('dedupe_key', `${base}%`)
    .limit(1);
  if (error) {
    console.error(`[callIntelligence] no se pudo comprobar si hay un job ${kind} vivo para ${callId}: ${error.message}`);
    return { jobId: null, checked: false, error: error.message };
  }
  const row = (data as Array<{ id: string }> | null)?.[0] ?? null;
  return { jobId: row?.id ?? null, checked: true, error: null };
}

export interface TranscribePipelineResult {
  transcript: CallTranscript;
  /** Id del job `analyze` encolado (o null si se ejecutó inline / no aplica). */
  analyzeJobId: string | null;
  analysis?: AnalysisPipelineResult | null;
  /** Por qué no se encadenó el análisis (`not_completed` | `empty_transcript` | `policy`). */
  analyzeSkipped?: 'not_completed' | 'empty_transcript' | 'policy';
}

/** Transcripción completada pero sin voz (silencio, buzón vacío): no hay nada que analizar. */
export function isEmptyTranscript(t: Pick<CallTranscript, 'full_text' | 'word_count' | 'segments'>): boolean {
  return !(t.full_text ?? '').trim() && !(t.word_count ?? 0) && !(t.segments?.length ?? 0);
}

/**
 * Transcribe y, si la política lo permite y la transcripción quedó completa
 * (y con texto), encola `analyze` (o lo ejecuta inline con `inlineAnalyze`).
 */
export async function runTranscribePipeline(
  orgId: number,
  callId: string,
  opts: TranscribeOptions & { inlineAnalyze?: boolean; chainAnalyze?: boolean } = {},
): Promise<TranscribePipelineResult> {
  const sb = opts.supabase ?? getServiceClient();
  const transcript = await transcribeCall(orgId, callId, { ...opts, supabase: sb });
  if (transcript.status !== 'completed') return { transcript, analyzeJobId: null, analyzeSkipped: 'not_completed' };
  if (isEmptyTranscript(transcript)) return { transcript, analyzeJobId: null, analyzeSkipped: 'empty_transcript' };
  const policy = await getCallAiPolicy(orgId);
  const chain = opts.chainAnalyze ?? policy.autoAnalyze;
  if (!chain) return { transcript, analyzeJobId: null, analyzeSkipped: 'policy' };
  if (opts.inlineAnalyze) {
    const analysis = await runAnalysisPipeline(orgId, callId, { supabase: sb, force: !!opts.force, userId: opts.userId });
    return { transcript, analyzeJobId: null, analysis };
  }
  const jobId = await enqueueJob({
    organizationId: orgId,
    kind: 'analyze',
    payload: { call_id: callId, transcript_id: transcript.id, force: !!opts.force },
    dedupeKey: ANALYZE_DEDUPE(callId),
    maxAttempts: 3,
    supabase: sb,
  });
  return { transcript, analyzeJobId: jobId };
}

export interface AnalysisPipelineResult {
  analysis: CallAnalysis;
  activityId: string | null;
  apply: ApplyResult | null;
  notificationId: string | null;
}

/**
 * Analiza (o reutiliza el análisis) y deja todo en la oportunidad:
 * actividad única, last_contact/temperatura, acciones según política y
 * notificación al vendedor.
 */
export async function runAnalysisPipeline(orgId: number, callId: string, opts: AnalyzeOptions = {}): Promise<AnalysisPipelineResult> {
  const sb = opts.supabase ?? getServiceClient();
  const analysis = await analyzeCall(orgId, callId, { ...opts, supabase: sb });
  const policy = await getCallAiPolicy(orgId);

  const { data: callRow } = await sb
    .from('calls')
    .select('id, organization_id, direction, mode, status, answered_by, started_at, ended_at, duration_seconds, customer_id, opportunity_id, user_id')
    .eq('id', callId)
    .eq('organization_id', orgId)
    .maybeSingle();
  const call = callRow as CallRowForActivity | null;

  let activityId: string | null = null;
  let apply: ApplyResult | null = null;
  let notificationId: string | null = null;
  if (call) {
    const raw = analysis.raw_response ?? {};
    const act = await upsertCallActivity(orgId, callId, {
      supabase: sb,
      call,
      enrich: {
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        qualityScore: analysis.quality_score,
        temperature: raw.temperature ?? null,
        transcriptId: analysis.transcript_id,
        analysisId: analysis.id,
        nextSteps: analysis.next_steps ?? null,
        tags: raw.suggested_tags ?? null,
        recordingId: (raw.recording_id as string) ?? null,
      },
    }).catch((e) => {
      console.error('[callIntelligence] upsertCallActivity:', e instanceof Error ? e.message : e);
      return null;
    });
    activityId = act?.activityId ?? null;

    await touchOpportunityFromCall(orgId, call, { contactResult: mapCallStatusToOutcome(call.status, call.answered_by), temperature: raw.temperature ?? null }, sb);

    // Acciones según política (solo si el análisis es nuevo o no se aplicó nada aún).
    const alreadyApplied = (raw.applied_actions ?? []).length > 0;
    if (!alreadyApplied) {
      apply = await runPostAnalysisActions(orgId, analysis, policy, sb).catch((e) => {
        console.error('[callIntelligence] runPostAnalysisActions:', e instanceof Error ? e.message : e);
        return null;
      });
      const suggestions = (analysis.suggested_tasks?.length ?? 0) + (analysis.suggested_stage_id ? 1 : 0);
      let salespersonId: string | null = null;
      let customerName: string | null = null;
      if (call.opportunity_id) {
        const { data: opp } = await sb.from('opportunities').select('salesperson_id, customers(full_name, company_name)').eq('id', call.opportunity_id).eq('organization_id', orgId).maybeSingle();
        const o = opp as { salesperson_id?: string | null; customers?: { full_name?: string | null; company_name?: string | null } | Array<{ full_name?: string | null; company_name?: string | null }> | null } | null;
        salespersonId = o?.salesperson_id ?? null;
        const cust = Array.isArray(o?.customers) ? o?.customers[0] : o?.customers;
        customerName = cust?.full_name ?? cust?.company_name ?? null;
      }
      notificationId = await notifyCallAnalyzed(orgId, call, {
        analysisId: analysis.id,
        summary: analysis.summary,
        suggestions,
        policy: policy.apply,
        movedStage: apply?.applied.includes('stage') ?? false,
        customerName,
        salespersonId,
      }, sb);
    }
  }
  return { analysis, activityId, apply, notificationId };
}

/** Encola `transcribe` (dedupe por llamada). */
export async function enqueueTranscribe(orgId: number, callId: string, extra: { recording_id?: string | null; force?: boolean; provider?: string | null; retry?: number } = {}, supabase?: SupabaseClient): Promise<string> {
  return enqueueJob({
    organizationId: orgId,
    kind: 'transcribe',
    payload: { call_id: callId, recording_id: extra.recording_id ?? null, force: !!extra.force, provider: extra.provider ?? null },
    dedupeKey: extra.retry ? `${TRANSCRIBE_DEDUPE(callId)}:retry:${extra.retry}` : TRANSCRIBE_DEDUPE(callId),
    maxAttempts: 3,
    supabase,
  });
}

/** Encola `analyze` (dedupe por llamada). */
export async function enqueueAnalyze(orgId: number, callId: string, extra: { force?: boolean; retry?: number } = {}, supabase?: SupabaseClient): Promise<string> {
  return enqueueJob({
    organizationId: orgId,
    kind: 'analyze',
    payload: { call_id: callId, force: !!extra.force },
    dedupeKey: extra.retry ? `${ANALYZE_DEDUPE(callId)}:retry:${extra.retry}` : ANALYZE_DEDUPE(callId),
    maxAttempts: 3,
    supabase,
  });
}
