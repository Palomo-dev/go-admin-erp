import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { createManualCallWithAudio, ManualCallError, resolveManualAudioMaxBytes, audioTooLargeMessage } from '@/lib/services/crm/manualCallService';
import { enqueueTranscribe, runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { AnalysisError } from '@/lib/services/crm/callAnalysisService';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/crm/calls/manual — Registra una llamada manual con audio (FASE-04 §5.3 D).
 * multipart/form-data: audio|file (tope = el mayor `maxBytes` de la cadena STT con
 * credenciales de la org, 25 MB si no hay ninguna; mp3/wav/m4a/ogg/webm por magic bytes),
 * opportunity_id | customer_id, occurred_at?, duration_seconds?, notes?, direction? (outbound|inbound), source?
 * Query: ?sync=1 transcribe + analiza inline (dev). Respuesta 201 { call_id, recording_id, job_id }.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const form = await request.formData();
    const file = (form.get('audio') ?? form.get('file')) as File | null;
    if (!file || typeof file === 'string') return NextResponse.json({ success: false, error: 'Archivo de audio requerido (campo audio)' }, { status: 400 });
    // Tope real de la cadena STT de la org (tester r2 nº 7): la ruta ya no
    // responde un número inventado ("supera 40 MB") con otro tope aplicado.
    const limit = await resolveManualAudioMaxBytes(ctx.organizationId);
    if (file.size > limit.maxBytes) {
      return NextResponse.json({ success: false, error: audioTooLargeMessage(file.size, limit.maxBytes), max_bytes: limit.maxBytes, max_bytes_source: limit.source, ...(limit.reason ? { max_bytes_reason: limit.reason } : {}) }, { status: 413 });
    }
    const audio = Buffer.from(await file.arrayBuffer());

    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const durationRaw = str('duration_seconds') ?? str('duration');
    const sync = request.nextUrl.searchParams.get('sync') === '1';
    const sb = getServiceClient();

    const created = await createManualCallWithAudio(
      ctx.organizationId,
      ctx.userId,
      {
        audio,
        opportunityId: str('opportunity_id'),
        customerId: str('customer_id'),
        occurredAt: str('occurred_at'),
        durationSeconds: durationRaw ? Number(durationRaw) : null,
        notes: str('notes'),
        direction: str('direction') === 'inbound' ? 'inbound' : 'outbound',
        source: str('source') ?? 'manual_upload',
        originalFilename: file.name ?? null,
        maxBytes: limit.maxBytes,
      },
      sb,
    );

    if (sync) {
      const out = await runTranscribePipeline(ctx.organizationId, created.callId, { supabase: sb, inlineAnalyze: true, userId: ctx.userId });
      return NextResponse.json(
        {
          success: true,
          data: {
            call_id: created.callId,
            recording_id: created.recordingId,
            activity_id: out.analysis?.activityId ?? created.activityId,
            transcript_id: out.transcript.id,
            transcript_status: out.transcript.status,
            provider: out.transcript.provider,
            analysis_id: out.analysis?.analysis.id ?? null,
            applied: out.analysis?.apply?.applied ?? [],
            job_id: null,
          },
        },
        { status: 201 },
      );
    }
    const jobId = await enqueueTranscribe(ctx.organizationId, created.callId, { recording_id: created.recordingId }, sb);
    return NextResponse.json(
      { success: true, data: { call_id: created.callId, recording_id: created.recordingId, activity_id: created.activityId, duration_seconds: created.durationSeconds, job_id: jobId, status: 'queued' } },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    if (error instanceof ManualCallError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof TranscriptionError || error instanceof AnalysisError) {
      const status = error.code === 'INSUFFICIENT_CREDITS' ? 402 : 502;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Manual] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
