import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits } from '@/lib/services/crm/aiCostService';
import { checkRateLimit } from '@/lib/security/rateLimit';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
const CREDIT_COST_TRANSCRIPTION = 1; // créditos IA por transcripción
const ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
];

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }
  return new OpenAI({ apiKey });
}

export async function POST(request: NextRequest) {
  // Validar autenticación y organización
  let ctx;
  try {
    // Se pasa `request` como en el resto de la superficie: sin él, la
    // organización solo se puede pedir por cookie, no por la cabecera
    // `X-Organization-Id`, y el comportamiento diverge del de los demás
    // endpoints sin ninguna razón.
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  // Límite de tasa. `chat` y `execute-action` ya lo tenían y este no: era el
  // camino de coste no acotado más barato de toda la superficie, porque cada
  // llamada admite hasta 25 MB de audio, cuesta 1 crédito plano y factura
  // minutos reales de Whisper contra la cuenta de OpenAI. Lo señaló el tester de
  // F0 (fallo 5). El coste plano por transcripción sigue siendo deuda: F5 lo
  // pasa a coste por duración.
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

  try {
    // Validar tamaño del payload antes de procesar
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: 'El archivo de audio excede el tamaño máximo de 25MB' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = (formData.get('language') as string) || 'es';

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Archivo de audio es requerido' },
        { status: 400 }
      );
    }

    // Validar tamaño del archivo
    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: 'El archivo de audio excede el tamaño máximo de 25MB' },
        { status: 413 }
      );
    }

    // Validar MIME type
    const mimeType = audioFile.type || 'audio/webm';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `Tipo de audio no soportado: ${mimeType}. Tipos permitidos: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 415 }
      );
    }

    // Créditos: se comprueba el SALDO antes de llamar al proveedor y se COBRA
    // después de que la transcripción llegue (§10.2, misma regla que fijó el
    // ADR-001 para `ai-auto-response`).
    //
    // Antes se descontaba primero: si Whisper fallaba, el crédito ya se había
    // ido y la organización pagaba por nada. Ese era el bug C8 del plan.
    //
    // SEGURIDAD (DB r3): `decrement_ai_credits` acepta `p_org_id` arbitrario y
    // admite importes negativos, así que se invoca siempre con el cliente de
    // SERVICIO (dentro de `chargeAiCredits`) y con la organización ya validada
    // por `getServerOrgContext()`, nunca con el cliente de sesión.
    const balance = await checkAICredits(ctx.organizationId);
    if (!balance.allowed) {
      return NextResponse.json(
        { error: balance.error || 'Créditos de IA insuficientes para transcripción' },
        { status: 402 }
      );
    }

    const openai = getOpenAIClient();

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    const transcriptionModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
    const transcription = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: transcriptionModel,
      language,
    });

    try {
      await chargeAiCredits({
        orgId: ctx.organizationId,
        actionType: 'assistant_stt',
        model: transcriptionModel,
        units: 0,
        credits: CREDIT_COST_TRANSCRIPTION,
        userId: ctx.userId,
        metadata: { audio_size: audioFile.size, language, surface: 'header_assistant' },
      });
    } catch (chargeError) {
      // La transcripción ya está hecha y es del usuario: no se le niega por un
      // fallo de contabilidad. Queda el aviso para conciliar.
      console.warn(
        '[GO Assistant] No se pudo cobrar la transcripción:',
        chargeError instanceof Error ? chargeError.message : chargeError
      );
    }

    // Registrar la actividad de transcripción filtrada por organización
    await ctx.supabase
      .from('activities')
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        activity_type: 'note',
        notes: `Transcripción de audio: ${transcription.text.substring(0, 200)}`,
        occurred_at: new Date().toISOString(),
        metadata: { type: 'transcription', language, audio_size: audioFile.size },
      });

    return NextResponse.json({ text: transcription.text });
  } catch (error: unknown) {
    console.error('Error en transcripción Whisper:', error);

    // El SDK de OpenAI lanza errores con `status`/`code`; se leen sin `any`.
    const apiError = error as { status?: number; code?: string; message?: string };

    if (apiError?.status === 429 || apiError?.code === 'insufficient_quota') {
      return NextResponse.json(
        { error: 'Cuota de OpenAI agotada para Whisper.' },
        { status: 429 }
      );
    }

    if (apiError?.status === 401 || apiError?.code === 'invalid_api_key') {
      return NextResponse.json(
        { error: 'Clave de API de OpenAI inválida.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: apiError?.message || 'Error al transcribir audio' },
      { status: 500 }
    );
  }
}
