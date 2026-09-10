import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { createManualCallWithAudio, ManualCallError, resolveManualAudioMaxBytes, audioTooLargeMessage } from '@/lib/services/crm/manualCallService';
import { runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';
import { TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { AnalysisError } from '@/lib/services/crm/callAnalysisService';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/crm/transcribe — COMPATIBILIDAD (ActivityActions.tsx:249; F9 lo elimina).
 *
 * Antes: Gemini 2.0 → whisper-1 sin persistir nada (audit-telephony §1).
 * Ahora delega en el pipeline real: crea la llamada manual + grabación
 * (`/api/crm/calls/manual`) y transcribe/analiza inline. Mantiene la forma de
 * respuesta `{ transcript, provider, language, duration_seconds, opportunity_id }`
 * y añade `call_id`, `transcript_id`, `analysis_id`.
 * `organization_id` del formulario se IGNORA (org de sesión, D7).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const form = await request.formData();
    const file = (form.get('file') ?? form.get('audio')) as File | null;
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Archivo de audio requerido' }, { status: 400 });
    // Tope real de la cadena STT de la org (tester r2 nº 7), no un número fijo.
    const limit = await resolveManualAudioMaxBytes(ctx.organizationId);
    if (file.size > limit.maxBytes) {
      return NextResponse.json({ error: audioTooLargeMessage(file.size, limit.maxBytes), max_bytes: limit.maxBytes, max_bytes_source: limit.source }, { status: 413 });
    }
    const opportunityId = typeof form.get('opportunity_id') === 'string' && (form.get('opportunity_id') as string).trim() ? (form.get('opportunity_id') as string).trim() : null;
    const customerId = typeof form.get('customer_id') === 'string' && (form.get('customer_id') as string).trim() ? (form.get('customer_id') as string).trim() : null;
    if (!opportunityId && !customerId) return NextResponse.json({ error: 'opportunity_id o customer_id requerido' }, { status: 400 });

    const sb = getServiceClient();
    const created = await createManualCallWithAudio(
      ctx.organizationId,
      ctx.userId,
      { audio: Buffer.from(await file.arrayBuffer()), opportunityId, customerId, source: 'activity_actions', originalFilename: file.name ?? null, maxBytes: limit.maxBytes },
      sb,
    );
    const out = await runTranscribePipeline(ctx.organizationId, created.callId, { supabase: sb, inlineAnalyze: true, userId: ctx.userId });
    return NextResponse.json({
      transcript: out.transcript.full_text ?? '',
      provider: out.transcript.provider,
      language: out.transcript.language,
      duration_seconds: out.transcript.duration_seconds,
      opportunity_id: opportunityId,
      call_id: created.callId,
      transcript_id: out.transcript.id,
      analysis_id: out.analysis?.analysis.id ?? null,
      summary: out.analysis?.analysis.summary ?? null,
    });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof ManualCallError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TranscriptionError || error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'INSUFFICIENT_CREDITS' ? 402 : 502 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[/api/crm/transcribe] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
