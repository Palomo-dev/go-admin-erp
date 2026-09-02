import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

/**
 * POST /api/crm/transcribe — Transcribe audio subido manualmente.
 * Acepta: multipart/form-data con `file` (audio/*), `opportunity_id`, `organization_id`.
 * Proveedores: Gemini (principal) → OpenAI Whisper (fallback).
 * No requiere call_id ni call_recordings — es para upload directo.
 */
export async function POST(request: NextRequest) {
  try {
    // Validar contexto organizacional (autenticación)
    await getServerOrgContext();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const opportunityId = formData.get('opportunity_id') as string | null;
    const providerPreference = (formData.get('provider') as string) || 'auto';

    if (!file) {
      return NextResponse.json(
        { error: 'No se recibió archivo de audio' },
        { status: 400 }
      );
    }

    // Validar tamaño (máx 25MB para Gemini, 25MB para OpenAI)
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'El archivo excede 25MB' },
        { status: 413 }
      );
    }

    const audioBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'audio/mpeg';

    // Decidir proveedor
    const useGemini =
      (providerPreference === 'auto' || providerPreference === 'gemini') &&
      !!process.env.GOOGLE_AI_API_KEY;
    const useOpenAI =
      (providerPreference === 'auto' || providerPreference === 'openai') &&
      !!process.env.OPENAI_API_KEY;

    if (!useGemini && !useOpenAI) {
      return NextResponse.json(
        {
          error:
            'No hay proveedores de transcripción configurados. Configura GOOGLE_AI_API_KEY o OPENAI_API_KEY.',
        },
        { status: 503 }
      );
    }

    // Intentar Gemini primero (mejor en español, más barato)
    if (useGemini) {
      try {
        const result = await transcribeWithGemini(audioBuffer, mimeType);
        return NextResponse.json({
          transcript: result.text,
          provider: 'gemini',
          language: result.language || 'es',
          duration_seconds: result.durationSeconds || null,
          opportunity_id: opportunityId,
        });
      } catch (geminiErr) {
        console.warn(
          '[/api/crm/transcribe] Gemini falló, intentando OpenAI:',
          geminiErr instanceof Error ? geminiErr.message : 'unknown'
        );
        if (providerPreference === 'gemini') {
          return NextResponse.json(
            {
              error:
                geminiErr instanceof Error
                  ? geminiErr.message
                  : 'Error con Gemini',
            },
            { status: 502 }
          );
        }
      }
    }

    // Fallback: OpenAI Whisper
    if (useOpenAI) {
      try {
        const result = await transcribeWithOpenAI(audioBuffer, file.name);
        return NextResponse.json({
          transcript: result.text,
          provider: 'openai',
          language: result.language || 'es',
          duration_seconds: result.durationSeconds || null,
          opportunity_id: opportunityId,
        });
      } catch (openaiErr) {
        return NextResponse.json(
          {
            error:
              openaiErr instanceof Error
                ? openaiErr.message
                : 'Error con OpenAI Whisper',
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: 'No se pudo transcribir el audio' },
      { status: 500 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[/api/crm/transcribe] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

interface TranscribeResult {
  text: string;
  language?: string;
  durationSeconds?: number | null;
}

/**
 * Transcribe audio usando Google Gemini (gemini-1.5-flash / gemini-2.0-flash).
 * Gemini soporta audio nativamente vía la API de Generate Content.
 */
async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscribeResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY no configurada');

  // Gemini 2.0 Flash: soporta audio, rápido y barato
  const model = 'gemini-2.0-flash';
  const base64Audio = audioBuffer.toString('base64');

  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe este audio en español. Devuelve SOLO el texto transcrito, sin comentarios adicionales, sin marcas de speaker. Si el audio está en otro idioma, transcribe en ese idioma.',
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const candidates = result.candidates || [];
  const parts = candidates[0]?.content?.parts || [];
  const text = parts.map((p: { text?: string }) => p.text || '').join('').trim();

  if (!text) {
    throw new Error('Gemini no devolvió texto transcrito');
  }

  return {
    text,
    language: 'es',
    durationSeconds: null,
  };
}

// ─── OpenAI Whisper ──────────────────────────────────────────────────────────

/**
 * Transcribe audio usando OpenAI Whisper (whisper-1).
 * Fallback cuando Gemini no está disponible o falla.
 */
async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  filename: string
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');

  const formData = new FormData();
  const blob = new Blob([audioBuffer as unknown as BlobPart], {
    type: 'audio/mpeg',
  });
  formData.append('file', blob, filename || 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('language', 'es');
  formData.append('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Whisper error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  return {
    text: result.text || '',
    language: result.language || 'es',
    durationSeconds: result.duration || null,
  };
}
