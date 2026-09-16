import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { SttChainError, transcribeWithFallback } from '@/lib/services/crm/stt';

/**
 * POST /api/ai-assistant/transcribe — nota de voz → texto (§5.5.1).
 *
 * F5: deja de cablear Whisper. El proveedor sale de la cadena STT del ERP
 * (`provider_configs` categoría `stt`: ElevenLabs Scribe v2 primario, Gemini y
 * OpenAI de respaldo), la misma que usa el CRM para las llamadas. Se cobra
 * DESPUÉS de transcribir (§2.8) y por duración, no plano, y se devuelve la
 * confianza para que la burbuja pueda decir "no estoy seguro de esto".
 */

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
/** Créditos por minuto de audio (mínimo 1 por nota). */
const CREDITS_PER_MINUTE = 1;
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
]);

/** `audio/webm;codecs=opus` → `audio/webm`. Los navegadores añaden el códec. */
function baseMime(type: string): string {
  return type.split(';')[0].trim().toLowerCase() || 'audio/webm';
}

/** Confianza media de los segmentos, o `null` si el proveedor no la da. */
function averageConfidence(segments: Array<{ confidence: number | null }>): number | null {
  const valores = segments.map((s) => s.confidence).filter((c): c is number => typeof c === 'number');
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  // Límite de tasa: cada llamada admite hasta 25 MB y factura minutos reales
  // contra el proveedor. Lo señaló el tester de F0 (fallo 5).
  const rl = await checkRateLimit(`assistant:stt:${ctx.userId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Demasiadas transcripciones seguidas. Espera un momento.',
        code: 'RATE_LIMITED',
        retryAt: rl.resetAt.toISOString(),
      },
      { status: 429 }
    );
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
    return NextResponse.json({ error: 'El archivo de audio excede el tamaño máximo de 25MB' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = readOrgBody(ctx, await request.formData());
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }
  const audioFile = formData.get('audio') as File | null;
  const languageRaw = formData.get('language');
  const language = typeof languageRaw === 'string' && /^[a-z]{2,3}$/i.test(languageRaw) ? languageRaw.toLowerCase() : 'es';

  if (!audioFile) {
    return NextResponse.json({ error: 'Archivo de audio es requerido' }, { status: 400 });
  }
  if (audioFile.size > MAX_AUDIO_SIZE) {
    return NextResponse.json({ error: 'El archivo de audio excede el tamaño máximo de 25MB' }, { status: 413 });
  }
  if (audioFile.size === 0) {
    return NextResponse.json({ error: 'El audio está vacío.' }, { status: 400 });
  }

  const mimeType = baseMime(audioFile.type || 'audio/webm');
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Tipo de audio no soportado: ${mimeType}.`, code: 'UNSUPPORTED_MEDIA' },
      { status: 415 }
    );
  }

  // Saldo ANTES de llamar al proveedor; cobro DESPUÉS de que la transcripción
  // llegue (§10.2). Nunca se cobra una transcripción fallida.
  const balance = await checkAICredits(ctx.organizationId);
  if (!balance.allowed) {
    return NextResponse.json(
      { error: balance.error || 'Créditos de IA insuficientes para transcripción', code: 'NO_CREDITS' },
      { status: 402 }
    );
  }

  const audio = Buffer.from(await audioFile.arrayBuffer());

  let outcome;
  try {
    outcome = await transcribeWithFallback(ctx.organizationId, {
      audio,
      mimeType,
      // ISO-639-3 al estilo ElevenLabs; cada adaptador lo traduce.
      language: language === 'es' ? 'spa' : language === 'en' ? 'eng' : language,
      channels: 1,
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error('[GO Assistant] Transcripción fallida:', detalle);
    if (error instanceof SttChainError && error.attempts.length === 0) {
      return NextResponse.json(
        { error: 'No hay proveedor de transcripción configurado. Avisa a un administrador.', code: 'STT_NOT_CONFIGURED' },
        { status: 501 }
      );
    }
    const retryable = error instanceof SttChainError ? error.retryable : false;
    return NextResponse.json(
      {
        error: retryable
          ? 'El proveedor de voz no respondió. Inténtalo otra vez en unos segundos.'
          : 'No pude transcribir el audio. Prueba a grabarlo de nuevo, más cerca del micrófono.',
        code: retryable ? 'STT_UNAVAILABLE' : 'STT_FAILED',
      },
      { status: retryable ? 503 : 502 }
    );
  }

  const { result, provider, fellBack } = outcome;
  const text = result.text.trim();
  const duration = result.duration_seconds ?? null;
  const credits = Math.max(1, Math.ceil(((duration ?? 0) / 60) * CREDITS_PER_MINUTE));

  try {
    await chargeAiCredits({
      orgId: ctx.organizationId,
      actionType: 'assistant_stt',
      model: `${provider}:${result.model}`,
      units: Math.round(duration ?? 0),
      credits,
      userId: ctx.userId,
      metadata: {
        audio_size: audioFile.size,
        language,
        duration_seconds: duration,
        cost_usd: result.cost_usd,
        provider,
        fell_back: fellBack,
        surface: 'header_assistant',
      },
    });
  } catch (chargeError) {
    // La transcripción ya está hecha y es del usuario: no se le niega por un
    // fallo de contabilidad. Queda el aviso para conciliar.
    console.warn('[GO Assistant] No se pudo cobrar la transcripción:', chargeError instanceof Error ? chargeError.message : chargeError);
  }

  await ctx.supabase.from('activities').insert({
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    activity_type: 'note',
    notes: `Transcripción de audio: ${text.substring(0, 200)}`,
    occurred_at: new Date().toISOString(),
    metadata: { type: 'transcription', language, audio_size: audioFile.size, provider, duration_seconds: duration },
  });

  return NextResponse.json({
    text,
    confidence: averageConfidence(result.segments),
    provider,
    durationSeconds: duration,
    credits,
  });
}
