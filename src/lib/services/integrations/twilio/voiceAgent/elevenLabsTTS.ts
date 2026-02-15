/**
 * ElevenLabs TTS — Text-to-Speech con voces ultra-realistas
 * GO Admin ERP — Voice Agent v2
 *
 * Reemplaza el TTS de OpenAI Realtime por voces más naturales.
 * Requiere: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL
 */

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  contentType: string;
}

/**
 * Convierte texto a audio usando ElevenLabs API.
 */
export async function textToSpeech(
  text: string,
  config?: Partial<ElevenLabsConfig>
): Promise<TTSResult> {
  const apiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = config?.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const model = config?.model || process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2';

  if (!apiKey || !voiceId) {
    throw new Error('Faltan ELEVENLABS_API_KEY y/o ELEVENLABS_VOICE_ID');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: config?.stability ?? 0.5,
          similarity_boost: config?.similarityBoost ?? 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();

  return {
    audioBuffer,
    contentType: response.headers.get('content-type') || 'audio/mpeg',
  };
}

/**
 * Convierte texto a audio en streaming (para baja latencia).
 */
export async function textToSpeechStream(
  text: string,
  config?: Partial<ElevenLabsConfig>
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY;
  const voiceId = config?.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const model = config?.model || process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2';

  if (!apiKey || !voiceId) {
    throw new Error('Faltan ELEVENLABS_API_KEY y/o ELEVENLABS_VOICE_ID');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: config?.stability ?? 0.5,
          similarity_boost: config?.similarityBoost ?? 0.75,
        },
      }),
    }
  );

  if (!response.ok || !response.body) {
    const error = await response.text();
    throw new Error(`ElevenLabs Stream error: ${response.status} - ${error}`);
  }

  return response.body;
}
