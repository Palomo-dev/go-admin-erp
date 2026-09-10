import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getTranscript, isLiveAttempt, TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { enqueueTranscribe, runTranscribePipeline, forceRetryBucket, findLiveCallJob } from '@/lib/services/crm/callIntelligenceService';
import { normalizeSttProvider } from '@/lib/services/crm/stt';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { AnalysisError } from '@/lib/services/crm/callAnalysisService';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/crm/calls/[id]/transcribe — Encola (o ejecuta) la transcripción.
 * Body: { force?: boolean; provider?: 'elevenlabs'|'google'|'openai' }.
 * Query: ?sync=1 ejecuta inline (transcribe + análisis según política).
 * Respuestas: 200 transcripción existente (completed y !force); 202 { job_id };
 * 404 llamada de otra org; 409 sin grabación ready; 402 sin créditos;
 * 409 `TRANSCRIPTION_IN_PROGRESS` / `ANALYSIS_IN_PROGRESS` si `?sync=1` y ya hay
 * un job vivo para esa llamada (ronda 5, tester r4 P2).
 * En el camino de COLA, un reintento con un job `transcribe` vivo devuelve 202 con
 * ese mismo `job_id` y `deduped:true` en vez de encolar otro (ronda 6, tester r5 N1).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    let body: { force?: boolean; provider?: string } = {};
    try {
      body = await request.json();
    } catch {
      /* body vacío */
    }
    const force = body.force === true;
    const provider = normalizeSttProvider(body.provider) ?? null;
    const sync = request.nextUrl.searchParams.get('sync') === '1';

    const { data: call } = await ctx.supabase.from('calls').select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (!call) return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });

    const existing = await getTranscript(id, ctx.organizationId, ctx.supabase, false);
    if (existing && existing.status === 'completed' && !force) {
      return NextResponse.json({ success: true, data: { transcript_id: existing.id, status: existing.status, provider: existing.provider, job_id: null } }, { status: 200 });
    }
    const { data: rec } = await ctx.supabase.from('call_recordings').select('id').eq('call_id', id).eq('organization_id', ctx.organizationId).eq('status', 'ready').limit(1).maybeSingle();
    if (!rec) return NextResponse.json({ success: false, error: 'La llamada no tiene grabación en estado ready', code: 'NO_RECORDING' }, { status: 409 });

    if (sync) {
      // Ronda 5 (tester r4 P2): este camino ejecuta la transcripción Y encadena
      // el análisis EN LÍNEA (`inlineAnalyze`), así que llega al cobro de
      // análisis sin pasar por la cola. La ronda 4 sólo puso el guardia en
      // `/analyze` (el informe decía lo contrario y era falso): aquí se
      // comprueban los DOS kinds antes de ejecutar. Si la consulta falla no se
      // finge que no hay job: se publica `dedupe_checked:false`.
      const sb = getServiceClient();
      const [liveT, liveA] = await Promise.all([
        findLiveCallJob(ctx.organizationId, id, 'transcribe', sb),
        findLiveCallJob(ctx.organizationId, id, 'analyze', sb),
      ]);
      const live = liveT.jobId ? liveT : liveA;
      if (live.jobId) {
        return NextResponse.json(
          {
            success: false,
            error: liveT.jobId ? 'Ya hay una transcripción en curso para esta llamada' : 'Ya hay un análisis en curso para esta llamada',
            code: liveT.jobId ? 'TRANSCRIPTION_IN_PROGRESS' : 'ANALYSIS_IN_PROGRESS',
            data: { job_id: live.jobId },
          },
          { status: 409 },
        );
      }
      const checked = liveT.checked && liveA.checked;
      const out = await runTranscribePipeline(ctx.organizationId, id, { force, provider, supabase: sb, inlineAnalyze: true, userId: ctx.userId });
      return NextResponse.json({
        success: true,
        data: {
          transcript_id: out.transcript.id,
          status: out.transcript.status,
          provider: out.transcript.provider,
          job_id: null,
          analysis_id: out.analysis?.analysis.id ?? null,
          activity_id: out.analysis?.activityId ?? null,
          applied: out.analysis?.apply?.applied ?? [],
          ...(checked ? {} : { dedupe_checked: false, dedupe_error: liveT.error ?? liveA.error }),
        },
      });
    }

    // Sufijo de reintento en el `dedupe_key`: hace falta cuando la fila está
    // `failed` y también cuando lleva `processing` más de `STALE_PROCESSING_MS`
    // (el job original ya terminó, así que el dedupe de `outbound_jobs` —que sólo
    // cubre queued|running— no lo frena). Mientras el envío siga vivo NO se pone
    // sufijo y `transcribeCall` devuelve la fila en curso sin volver a cobrar
    // (tester r2 nº 6).
    // Ronda 4 (tester r3 N4): la marca del sufijo se redondea a la ventana de
    // `forceRetryBucket`, así dos clics seguidos comparten `dedupe_key` y sólo se
    // encola un job (con `Date.now()` cada clic creaba una clave distinta).
    //
    // Ronda 6 (tester r5 N1): esa ventana cubre dos clics DENTRO del mismo minuto,
    // pero el sufijo cambia de valor cada 60 s, así que dos clics separados por más
    // de un minuto producen `transcribe:{id}:retry:N` y `…:retry:N+1` — dos claves,
    // dos filas vivas, y el índice único parcial de `outbound_jobs` no puede
    // frenarlas. Es el MISMO defecto que se cerró en `/analyze` en la ronda 5, en
    // el archivo de al lado y con la función ya importada. Y la interfaz lo ofrece
    // justo en ese estado (`CallTranscriptPanel`: «Reintentar» con el job vivo a
    // los 10 min), así que basta esperar y volver a pulsar: el segundo job
    // re-transcribe con `force` y vuelve a cobrar STT si el primero ya terminó.
    // Aquí se consulta el trabajo vivo ANTES de encolar y se devuelve ése.
    const staleProcessing = !!existing && existing.status === 'processing' && !isLiveAttempt(existing);
    const retry = existing && (existing.status === 'failed' || staleProcessing) ? forceRetryBucket() : undefined;
    const sb = getServiceClient();
    let live = { jobId: null as string | null, checked: true, error: null as string | null };
    if (retry !== undefined) live = await findLiveCallJob(ctx.organizationId, id, 'transcribe', sb);
    if (live.jobId) {
      return NextResponse.json(
        { success: true, data: { job_id: live.jobId, status: 'queued', transcript_id: existing?.id ?? null, deduped: true } },
        { status: 202 },
      );
    }
    const jobId = await enqueueTranscribe(ctx.organizationId, id, { recording_id: (rec as { id: string }).id, force, provider, retry }, sb);
    return NextResponse.json(
      {
        success: true,
        data: {
          job_id: jobId,
          status: 'queued',
          transcript_id: existing?.id ?? null,
          // Si la comprobación falló, se dice: no se puede afirmar que no hubiera
          // otro job de transcripción vivo (nunca se finge que no lo había).
          ...(live.checked ? {} : { dedupe_checked: false, dedupe_error: live.error }),
        },
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    if (error instanceof TranscriptionError) {
      const status = error.code === 'INSUFFICIENT_CREDITS' ? 402
        : error.code === 'AUDIO_TOO_LARGE' ? 413
        : error.code === 'NO_RECORDING' || error.code === 'AUDIO_TOO_SHORT' || error.code === 'AUDIO_EMPTY' ? 409
        : error.code === 'CALL_NOT_FOUND' ? 404
        : error.code === 'PERSIST_ERROR' ? 500
        : 502;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    if (error instanceof AnalysisError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'INSUFFICIENT_CREDITS' ? 402 : 502 });
    }
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ success: false, error: error.message, code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Transcribe] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
