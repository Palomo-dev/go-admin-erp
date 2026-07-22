import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }
  return new OpenAI({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = (formData.get('language') as string) || 'es';

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Archivo de audio es requerido' },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type || 'audio/webm' });

    const transcription = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
      language,
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
