import { NextRequest, NextResponse } from 'next/server';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { completeTranscriptFromWebhook, type ScribeWebhookPayload } from '@/lib/services/crm/transcriptionService';
import { enqueueAnalyze } from '@/lib/services/crm/callIntelligenceService';
import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/crm/webhooks/elevenlabs — Webhook async de Scribe (FASE-04 §4.3).
 *
 * Verificación FAIL-CLOSED sobre el body crudo con
 * `client.webhooks.constructEvent(rawBody, 'ElevenLabs-Signature', ELEVENLABS_WEBHOOK_SECRET)`
 * (SDK @elevenlabs/elevenlabs-js 2.67, wrapper/webhooks.d.ts). Sin secreto → 401.
 * Evento `speech_to_text_transcription` → completa la fila `call_transcripts`
 * localizada por `raw_response->>provider_request_id` (org derivada de la fila,
 * nunca del payload) y encola `analyze`. request_id desconocido → 200 sin efecto
 * (evita enumeración y reintentos).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhooks/elevenlabs] ELEVENLABS_WEBHOOK_SECRET no configurado (fail-closed)');
    return NextResponse.json({ error: 'webhook not configured' }, { status: 401 });
  }
  const raw = await req.text();
  const sig = req.headers.get('elevenlabs-signature') ?? req.headers.get('ElevenLabs-Signature') ?? '';
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 401 });

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || 'unused-for-verification' });
    event = (await client.webhooks.constructEvent(raw, sig, secret)) as typeof event;
  } catch (err) {
    console.warn('[webhooks/elevenlabs] firma inválida:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (event?.type !== 'speech_to_text_transcription') return NextResponse.json({ received: true, ignored: event?.type ?? null });
  const data = (event.data ?? {}) as ScribeWebhookPayload;
  const requestId = String(data.request_id ?? (data as { requestId?: string }).requestId ?? '');
  if (!requestId) return NextResponse.json({ received: true, ignored: 'no_request_id' });

  try {
    const sb = getServiceClient();
    const transcript = await completeTranscriptFromWebhook(requestId, data, sb);
    if (!transcript) return NextResponse.json({ received: true, matched: false });
    let analyzeJobId: string | null = null;
    // Idempotencia PROPIA de la ruta: un reintento del proveedor sobre una fila ya
    // completada no vuelve a encolar `analyze` (antes dependía del dedupe de la cola).
    const duplicate = transcript.already_completed === true;
    if (transcript.status === 'completed' && !duplicate) {
      const policy = await getCallAiPolicy(transcript.organization_id);
      if (policy.autoAnalyze) analyzeJobId = await enqueueAnalyze(transcript.organization_id, transcript.call_id, {}, sb);
    }
    return NextResponse.json({ received: true, matched: true, duplicate, transcript_id: transcript.id, status: transcript.status, analyze_job_id: analyzeJobId });
  } catch (err) {
    // 200 tras verificar la firma: ElevenLabs reintenta 5 veces en 5xx; el job transcribe_check/cron recupera.
    console.error('[webhooks/elevenlabs] error procesando:', err instanceof Error ? err.message : err);
    return NextResponse.json({ received: true, matched: false, error: 'processing_failed' });
  }
}
