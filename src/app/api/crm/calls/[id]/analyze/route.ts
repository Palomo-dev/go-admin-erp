import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getAnalysis, AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { getTranscript } from '@/lib/services/crm/transcriptionService';
import { enqueueAnalyze, runAnalysisPipeline, findLiveCallJob, forceRetryBucket } from '@/lib/services/crm/callIntelligenceService';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/crm/calls/[id]/analyze — Encola (o ejecuta con ?sync=1) el análisis IA.
 * Body: { force?: boolean }. 200 análisis existente; 202 { job_id }; 409 sin transcripción; 402 sin créditos.
 * Con `?sync=1`, 409 `ANALYSIS_IN_PROGRESS` / `TRANSCRIPTION_IN_PROGRESS` si ya hay
 * un job vivo de cualquiera de los dos kinds (ronda 7, tester r6 F2: la misma
 * comprobación que `/transcribe?sync=1`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    let body: { force?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      /* body vacío */
    }
    const force = body.force === true;
    const sync = request.nextUrl.searchParams.get('sync') === '1';

    const { data: call } = await ctx.supabase.from('calls').select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (!call) return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });

    const existing = await getAnalysis(id, ctx.organizationId, ctx.supabase);
    if (existing && existing.summary && !force) {
      return NextResponse.json({ success: true, data: { analysis_id: existing.id, job_id: null, analysis: existing } }, { status: 200 });
    }
    const transcript = await getTranscript(id, ctx.organizationId, ctx.supabase, false);
    if (!transcript || transcript.status !== 'completed') {
      return NextResponse.json({ success: false, error: 'La llamada no tiene transcripción completada', code: 'NO_TRANSCRIPT' }, { status: 409 });
    }

    if (sync) {
      // Ronda 4 (tester r3 N4): el modo inline NO pasaba por la cola, así que el
      // `dedupe_key` de `outbound_jobs` no lo frenaba y analizar mientras había
      // un job vivo cobraba DOS veces. Ahora respeta ese mismo dedupe.
      //
      // Ronda 7 (tester r6 F2): se comprueban los DOS kinds, igual que la ruta de
      // al lado (`/transcribe?sync=1`). Un job `transcribe` vivo con `force`
      // encadenará su propio análisis (`inlineAnalyze`), así que analizar aquí en
      // línea mientras ése corre es el mismo doble cobro por otra puerta. La
      // ventana es estrecha —arriba ya se exige `transcript.status==='completed'`,
      // de modo que sólo la abre un re-transcribe forzado que aún no ha
      // arrancado— pero la asimetría entre dos guardas gemelas es exactamente
      // cómo se produjeron los fallos de las rondas 4 y 5.
      const sb = getServiceClient();
      const [liveA, liveT] = await Promise.all([
        findLiveCallJob(ctx.organizationId, id, 'analyze', sb),
        findLiveCallJob(ctx.organizationId, id, 'transcribe', sb),
      ]);
      const live = liveA.jobId ? liveA : liveT;
      if (live.jobId) {
        return NextResponse.json(
          {
            success: false,
            error: liveA.jobId ? 'Ya hay un análisis en curso para esta llamada' : 'Ya hay una transcripción en curso para esta llamada',
            code: liveA.jobId ? 'ANALYSIS_IN_PROGRESS' : 'TRANSCRIPTION_IN_PROGRESS',
            data: { job_id: live.jobId },
          },
          { status: 409 },
        );
      }
      const checked = liveA.checked && liveT.checked;
      const out = await runAnalysisPipeline(ctx.organizationId, id, { force, supabase: sb, userId: ctx.userId });
      return NextResponse.json({
        success: true,
        data: {
          analysis_id: out.analysis.id,
          job_id: null,
          analysis: out.analysis,
          activity_id: out.activityId,
          applied: out.apply?.applied ?? [],
          skipped: out.apply?.skipped ?? [],
          // Si la comprobación anterior falló, se dice: no se puede afirmar que
          // no hubiera otro trabajo en curso.
          ...(checked ? {} : { dedupe_checked: false, dedupe_error: liveA.error ?? liveT.error }),
        },
      });
    }
    // `forceRetryBucket` (no `Date.now()`): dos clics en «Reanalizar» dentro de la
    // misma ventana comparten dedupe_key y sólo se encola UNO (tester r3 N4).
    //
    // Ronda 5 (tester r4 P4): esa ventana cubre dos clics de force **entre sí**,
    // pero NO el caso mixto — si ya hay un job vivo con la clave llana
    // `analyze:{callId}` (el que encola la cadena automática tras transcribir) y
    // el usuario fuerza, la clave pasa a ser `…:retry:{bucket}`, es OTRA clave y
    // el índice único no la frena: segundo job y segundo cobro. Aquí se cierra
    // devolviendo el job vivo en vez de encolar otro.
    const sb = getServiceClient();
    let live = { jobId: null as string | null, checked: true, error: null as string | null };
    if (force) live = await findLiveCallJob(ctx.organizationId, id, 'analyze', sb);
    if (live.jobId) {
      return NextResponse.json(
        { success: true, data: { job_id: live.jobId, status: 'queued', analysis_id: existing?.id ?? null, deduped: true } },
        { status: 202 },
      );
    }
    const jobId = await enqueueAnalyze(ctx.organizationId, id, { force, retry: force ? forceRetryBucket() : undefined }, sb);
    return NextResponse.json(
      {
        success: true,
        data: {
          job_id: jobId,
          status: 'queued',
          analysis_id: existing?.id ?? null,
          ...(live.checked ? {} : { dedupe_checked: false, dedupe_error: live.error }),
        },
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    if (error instanceof AnalysisError) {
      const status = error.code === 'INSUFFICIENT_CREDITS' ? 402 : error.code === 'NO_TRANSCRIPT' ? 409 : error.code === 'CALL_NOT_FOUND' ? 404 : error.code === 'PERSIST_ERROR' ? 500 : 502;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ success: false, error: error.message, code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analyze] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** GET /api/crm/calls/[id]/analyze — Último análisis de la llamada. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const analysis = await getAnalysis(id, ctx.organizationId, ctx.supabase);
    if (!analysis) return NextResponse.json({ success: false, error: 'Análisis no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, data: analysis }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analyze] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
