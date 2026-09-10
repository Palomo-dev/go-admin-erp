/**
 * Adaptador STT — ElevenLabs Scribe v2 (docs-elevenlabs.md §Speech to Text).
 *
 * POST /v1/speech-to-text multipart vía SDK `@elevenlabs/elevenlabs-js`
 * (`client.speechToText.convert`). Parámetros verificados en
 * node_modules/@elevenlabs/elevenlabs-js/api/resources/speechToText/client/requests/
 * BodySpeechToTextV1SpeechToTextPost.d.ts (2.67.0): modelId, file, languageCode,
 * diarize, numSpeakers, timestampsGranularity, tagAudioEvents, webhook,
 * webhookId, useMultiChannel, sourceUrl.
 *
 * Con `useMultiChannel: true` (grabación dual de Twilio) Scribe devuelve
 * `transcripts[]` con `channelIndex` por canal: los roles agente/cliente se
 * asignan por canal sin heurística ni ffmpeg (callChannelRoles.ts).
 */

import {
  type SttAdapter,
  type SttInput,
  type TranscriptResult,
  type TimedWord,
  SttProviderError,
  groupWordsIntoSegments,
  countSpeakers,
  logprobToConfidence,
  toSttError,
} from './types';

export const SCRIBE_MODEL = 'scribe_v2';
/** $0.22/h PAYG (D8). */
export const SCRIBE_USD_PER_HOUR = 0.22;

/** Palabra de Scribe (SDK camelCase o REST/webhook snake_case). */
interface ScribeWord {
  text: string;
  type?: string;
  start?: number;
  end?: number;
  speakerId?: string;
  speaker_id?: string;
  logprob?: number;
  channelIndex?: number;
  channel_index?: number;
}

interface ScribeChunk {
  languageCode?: string;
  language_code?: string;
  languageProbability?: number;
  language_probability?: number;
  text?: string;
  words?: ScribeWord[];
  channelIndex?: number;
  channel_index?: number;
  transcriptionId?: string;
  transcription_id?: string;
  audioDurationSecs?: number;
  audio_duration_secs?: number;
}

interface ScribeMultichannel {
  transcripts: ScribeChunk[];
  transcriptionId?: string;
  transcription_id?: string;
  audioDurationSecs?: number;
  audio_duration_secs?: number;
}

interface ScribeWebhookAck {
  message?: string;
  requestId?: string;
  request_id?: string;
  transcriptionId?: string;
  transcription_id?: string;
}

export type ScribeResponse = ScribeChunk | ScribeMultichannel | ScribeWebhookAck;

function chunkWords(chunk: ScribeChunk, forcedChannel?: number): TimedWord[] {
  const channelOfChunk = chunk.channelIndex ?? chunk.channel_index ?? forcedChannel ?? null;
  return (chunk.words ?? []).map((w) => {
    const channel = w.channelIndex ?? w.channel_index ?? channelOfChunk;
    const speaker = w.speakerId ?? w.speaker_id ?? null;
    return {
      text: w.text,
      type: w.type ?? 'word',
      start_ms: Math.round((w.start ?? 0) * 1000),
      end_ms: Math.round((w.end ?? w.start ?? 0) * 1000),
      // En multicanal el hablante se identifica por canal (un hablante por pierna).
      speaker: channel !== null && channel !== undefined ? `ch${channel}` : speaker,
      confidence: logprobToConfidence(w.logprob),
      channel_index: channel ?? null,
    };
  });
}

/**
 * Mapea la respuesta de Scribe (single o multichannel) a TranscriptResult.
 * `words[]` se elimina de `raw` salvo CALL_AI_DEBUG (peso).
 */
export function mapScribeResponse(res: ScribeResponse, input: Pick<SttInput, 'language' | 'durationSeconds'>, pauseMs = 800): TranscriptResult {
  const multi = res as ScribeMultichannel;
  const chunks: ScribeChunk[] = Array.isArray(multi.transcripts) ? multi.transcripts : [res as ScribeChunk];
  const words: TimedWord[] = [];
  chunks.forEach((c, i) => words.push(...chunkWords(c, Array.isArray(multi.transcripts) ? (c.channelIndex ?? c.channel_index ?? i) : undefined)));
  words.sort((a, b) => a.start_ms - b.start_ms);

  const segments = groupWordsIntoSegments(words, pauseMs);
  const first = chunks[0] ?? {};
  const durationFromWords = words.length ? Math.round(words[words.length - 1].end_ms / 1000) : null;
  const duration =
    (res as ScribeChunk).audioDurationSecs ??
    (res as ScribeChunk).audio_duration_secs ??
    first.audioDurationSecs ??
    first.audio_duration_secs ??
    input.durationSeconds ??
    durationFromWords;
  const text = chunks.length > 1
    ? segments.map((s) => s.text).join(' ')
    : (first.text ?? segments.map((s) => s.text).join(' '));

  const debug = process.env.CALL_AI_DEBUG === '1' || process.env.CALL_AI_DEBUG === 'true';
  const raw: Record<string, unknown> = debug
    ? { ...(res as Record<string, unknown>) }
    : { ...(res as Record<string, unknown>), words: undefined, transcripts: undefined, word_count: words.filter((w) => !w.type || w.type === 'word').length, channels: chunks.length };

  return {
    provider: 'elevenlabs',
    model: SCRIBE_MODEL,
    language: first.languageCode ?? first.language_code ?? input.language,
    language_probability: first.languageProbability ?? first.language_probability ?? null,
    text: text.trim(),
    segments,
    speaker_count: countSpeakers(segments),
    duration_seconds: typeof duration === 'number' ? Math.round(duration) : null,
    raw,
    cost_usd: typeof duration === 'number' ? Number(((duration / 3600) * SCRIBE_USD_PER_HOUR).toFixed(6)) : null,
    provider_request_id: (res as ScribeChunk).transcriptionId ?? (res as ScribeChunk).transcription_id ?? first.transcriptionId ?? first.transcription_id ?? null,
  };
}

/** Sanitiza el código de idioma: ElevenLabs acepta ISO-639-1/-3 (`es` o `spa`). */
export function toScribeLanguage(language: string | undefined | null): string {
  const l = (language ?? 'spa').toLowerCase().trim();
  if (l === 'es' || l === 'es-co' || l === 'es-419' || l === 'es-mx' || l === 'spanish') return 'spa';
  return l.length === 2 || l.length === 3 ? l : 'spa';
}

export class ElevenLabsScribeAdapter implements SttAdapter {
  readonly name = 'elevenlabs' as const;
  readonly supportsDiarization = true;
  readonly maxDurationSeconds = 36000;
  /** Scribe acepta hasta 1 GB / 4,5 h por archivo (docs-elevenlabs.md). */
  readonly maxBytes = 1024 * 1024 * 1024;

  constructor(private readonly apiKey: string, private readonly model: string = SCRIBE_MODEL) {}

  async transcribe(input: SttInput): Promise<TranscriptResult> {
    if (!this.apiKey) throw new SttProviderError('elevenlabs', 'ELEVENLABS_API_KEY ausente', 401, false);
    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');
    const client = new ElevenLabsClient({ apiKey: this.apiKey });
    const useMultiChannel = input.channels === 2 && input.dualTranscribe !== false;
    const async = input.webhook?.enabled === true;

    const request: Record<string, unknown> = {
      modelId: input.model ?? this.model,
      languageCode: toScribeLanguage(input.language),
      diarize: !useMultiChannel,
      numSpeakers: useMultiChannel ? undefined : 2,
      timestampsGranularity: 'word',
      tagAudioEvents: false,
      useMultiChannel,
      ...(input.hints?.length ? { keyterms: input.hints.slice(0, 100) } : {}),
      ...(async ? { webhook: true, ...(input.webhook?.webhookId ? { webhookId: input.webhook.webhookId } : {}) } : {}),
    };
    if (typeof input.audio === 'string') {
      request.sourceUrl = input.audio;
    } else {
      request.file = new Blob([new Uint8Array(input.audio)], { type: input.mimeType || 'audio/mpeg' });
    }

    let res: ScribeResponse;
    try {
      res = (await client.speechToText.convert(request as unknown as Parameters<typeof client.speechToText.convert>[0])) as unknown as ScribeResponse;
    } catch (err) {
      throw toSttError('elevenlabs', err);
    }

    const ack = res as ScribeWebhookAck;
    if (async || (ack.requestId ?? ack.request_id)) {
      return {
        provider: 'elevenlabs',
        model: input.model ?? this.model,
        language: input.language,
        text: '',
        segments: [],
        speaker_count: 0,
        duration_seconds: input.durationSeconds ?? null,
        raw: { ...(res as Record<string, unknown>) },
        cost_usd: null,
        provider_request_id: ack.requestId ?? ack.request_id ?? ack.transcriptionId ?? ack.transcription_id ?? null,
        pending: true,
      };
    }
    return mapScribeResponse(res, input);
  }
}
