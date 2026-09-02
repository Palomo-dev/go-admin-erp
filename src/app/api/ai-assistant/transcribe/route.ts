import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

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
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
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

    // Verificar y descontar créditos de IA atómicamente (bug G4 — F0)
    // Usa RPC con FOR UPDATE para evitar race conditions entre llamadas concurrentes.
    const { data: decremented, error: decrementError } = await ctx.supabase
      .rpc('decrement_ai_credits', {
        p_org_id: ctx.organizationId,
        p_cost: CREDIT_COST_TRANSCRIPTION,
      });

    if (decrementError) {
      console.error('Error al descontar créditos:', decrementError);
      return NextResponse.json(
        { error: 'Error al verificar créditos de IA' },
        { status: 500 }
      );
    }

    if (!decremented) {
      return NextResponse.json(
        { error: 'Créditos de IA insuficientes para transcripción' },
        { status: 402 }
      );
    }

    const openai = getOpenAIClient();

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
      language,
    });

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
  } catch (error: any) {
    console.error('Error en transcripción Whisper:', error);

    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      return NextResponse.json(
        { error: 'Cuota de OpenAI agotada para Whisper.' },
        { status: 429 }
      );
    }

    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { error: 'Clave de API de OpenAI inválida.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Error al transcribir audio' },
      { status: 500 }
    );
  }
}
