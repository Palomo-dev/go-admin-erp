/**
 * Deepgram STT — Speech-to-Text avanzado
 * GO Admin ERP — Voice Agent v3
 *
 * Reemplaza el STT de OpenAI Realtime por Deepgram Nova-2.
 * Mejor precisión en español, diarización, y menor latencia.
 * Requiere: DEEPGRAM_API_KEY, DEEPGRAM_MODEL
 */

import WebSocket from 'ws';

export interface DeepgramConfig {
  apiKey: string;
  model?: string;
  language?: string;
  punctuate?: boolean;
  interimResults?: boolean;
  utteranceEndMs?: number;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  words?: Array<{ word: string; start: number; end: number; confidence: number }>;
}

/**
 * Crea una conexión WebSocket de streaming con Deepgram.
 */
export function createDeepgramStream(
  config?: Partial<DeepgramConfig>,
  onTranscript?: (result: TranscriptionResult) => void,
  onError?: (error: Error) => void
): WebSocket {
  const apiKey = config?.apiKey || process.env.DEEPGRAM_API_KEY;
  const model = config?.model || process.env.DEEPGRAM_MODEL || 'nova-2';
  const language = config?.language || 'es';

  if (!apiKey) {
    throw new Error('Falta DEEPGRAM_API_KEY');
  }

  const params = new URLSearchParams({
    model,
    language,
    punctuate: String(config?.punctuate ?? true),
    interim_results: String(config?.interimResults ?? true),
    utterance_end_ms: String(config?.utteranceEndMs ?? 1000),
    encoding: 'mulaw',
    sample_rate: '8000',
    channels: '1',
  });

  const ws = new WebSocket(
    `wss://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    }
  );

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      if (response.type === 'Results') {
        const alternative = response.channel?.alternatives?.[0];
        if (alternative) {
          onTranscript?.({
            transcript: alternative.transcript || '',
            confidence: alternative.confidence || 0,
            isFinal: response.is_final || false,
            words: alternative.words,
          });
        }
      }
    } catch (error) {
      console.error('[DeepgramSTT] Error parseando respuesta:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('[DeepgramSTT] WebSocket error:', error);
    onError?.(error as Error);
  });

  return ws;
}

/**
 * Transcripción de archivo de audio (no streaming).
 */
export async function transcribeAudio(
  audioBuffer: Uint8Array,
  config?: Partial<DeepgramConfig>
): Promise<TranscriptionResult> {
  const apiKey = config?.apiKey || process.env.DEEPGRAM_API_KEY;
  const model = config?.model || process.env.DEEPGRAM_MODEL || 'nova-2';
  const language = config?.language || 'es';

  if (!apiKey) {
    throw new Error('Falta DEEPGRAM_API_KEY');
  }

  const params = new URLSearchParams({
    model,
    language,
    punctuate: 'true',
  });

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBuffer as unknown as BodyInit,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Deepgram API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  const alternative = result.results?.channels?.[0]?.alternatives?.[0];

  return {
    transcript: alternative?.transcript || '',
    confidence: alternative?.confidence || 0,
    isFinal: true,
    words: alternative?.words,
  };
}
