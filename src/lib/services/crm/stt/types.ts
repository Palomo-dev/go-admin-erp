/**
 * Tipos compartidos de los adaptadores STT (FASE-04 §4.2).
 *
 * Proveedores: ElevenLabs Scribe v2 (primario), Gemini 2.5 Flash (audio
 * nativo, fallback) y OpenAI gpt-transcribe (tercero, sin diarización).
 * El identificador de proveedor coincide con `provider_configs.provider`
 * (`google`, no `gemini`, como en `providerRegistry.ts`).
 */

export type SttProvider = 'elevenlabs' | 'google' | 'openai';

export interface SttInput {
  /** Audio en memoria (Buffer) o URL pública/firmada descargable por el proveedor. */
  audio: Buffer | string;
  /** MIME real del archivo (`audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`, `audio/mp4`). */
  mimeType: string;
  /** Idioma ISO-639-3 estilo ElevenLabs (`spa`); cada adaptador lo traduce. */
  language: string;
  /** Canales de la grabación (2 = dual-channel de Twilio: canal 0 = pierna que originó). */
  channels: 1 | 2;
  /** Duración conocida en segundos (para estimaciones cuando el proveedor no la devuelve). */
  durationSeconds?: number | null;
  /** Pistas de contexto (nombres, productos) para el proveedor. */
  hints?: string[];
  /** Transcribir cada canal por separado (ElevenLabs `use_multi_channel`). */
  dualTranscribe?: boolean;
  /** Modo asíncrono por webhook (solo ElevenLabs). */
  webhook?: { enabled: boolean; webhookId?: string };
  /** Modelo a usar (override de settings). */
  model?: string;
}

export interface TranscriptSegment {
  /** Etiqueta del hablante tal como la devuelve el proveedor (`speaker_0`, `ch0`, …). */
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  /** Canal del que proviene (0|1) cuando el proveedor lo informa; null en mono. */
  channel_index?: number | null;
}

export interface TranscriptResult {
  provider: SttProvider;
  model: string;
  language: string;
  language_probability?: number | null;
  text: string;
  segments: TranscriptSegment[];
  speaker_count: number;
  duration_seconds: number | null;
  /** Respuesta cruda del proveedor (sin `words[]` salvo CALL_AI_DEBUG). */
  raw: Record<string, unknown>;
  /** Costo estimado en USD según la tarifa del proveedor. */
  cost_usd: number | null;
  /** Id de la petición en el proveedor (Scribe `transcription_id` / `request_id`). */
  provider_request_id?: string | null;
  /** true cuando la transcripción se envió con webhook y aún no hay resultado. */
  pending?: boolean;
}

export interface SttAdapter {
  readonly name: SttProvider;
  readonly supportsDiarization: boolean;
  /** Límite duro de duración por archivo (s). */
  readonly maxDurationSeconds: number;
  /**
   * Límite duro de tamaño por archivo (bytes). Si el audio lo supera, la cascada
   * salta el adaptador con 413 en vez de gastar la llamada (OpenAI 25 MB).
   * Opcional: sin valor se asume sin límite práctico.
   */
  readonly maxBytes?: number;
  transcribe(input: SttInput): Promise<TranscriptResult>;
}

/** Error normalizado de proveedor: `retryable` = 429/5xx/red. */
export class SttProviderError extends Error {
  provider: SttProvider;
  status: number | null;
  retryable: boolean;
  constructor(provider: SttProvider, message: string, status: number | null = null, retryable?: boolean) {
    super(message);
    this.name = 'SttProviderError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable ?? (status === null || status === 408 || status === 429 || status >= 500);
  }
}

/** Convierte cualquier error (SDK, fetch) en SttProviderError. */
export function toSttError(provider: SttProvider, err: unknown): SttProviderError {
  if (err instanceof SttProviderError) return err;
  const e = err as { status?: number; statusCode?: number; message?: string; code?: string; cause?: { code?: string } };
  const status = typeof e?.status === 'number' ? e.status : typeof e?.statusCode === 'number' ? e.statusCode : null;
  const msg = e?.message ?? String(err);
  const network = !status && /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket/i.test(`${msg} ${e?.code ?? ''} ${e?.cause?.code ?? ''}`);
  return new SttProviderError(provider, msg, status, status === null ? network : undefined);
}

/**
 * Agrupa palabras con timestamps en segmentos: corta cuando cambia el hablante
 * (o el canal) o cuando hay una pausa mayor a `pauseMs` (default 800 ms).
 */
export interface TimedWord {
  text: string;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  confidence?: number | null;
  channel_index?: number | null;
  /** 'word' | 'spacing' | 'audio_event' (se ignoran los que no son 'word'). */
  type?: string;
}

export function groupWordsIntoSegments(words: TimedWord[], pauseMs = 800): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: (TranscriptSegment & { confSum: number; confCount: number; parts: string[] }) | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.parts.join(' ').replace(/\s+([,.;:!?…])/g, '$1').trim();
    if (text) {
      segments.push({
        speaker_label: current.speaker_label,
        start_ms: current.start_ms,
        end_ms: current.end_ms,
        text,
        confidence: current.confCount > 0 ? Number((current.confSum / current.confCount).toFixed(4)) : null,
        channel_index: current.channel_index ?? null,
      });
    }
    current = null;
  };

  for (const w of words) {
    if (w.type && w.type !== 'word') continue;
    const token = (w.text ?? '').trim();
    if (!token) continue;
    const speaker = w.speaker ?? 'speaker_0';
    const channel = w.channel_index ?? null;
    const sameSpeaker = current && current.speaker_label === speaker && (current.channel_index ?? null) === channel;
    const gap = current ? w.start_ms - current.end_ms : 0;
    if (!current || !sameSpeaker || gap > pauseMs) {
      flush();
      current = {
        speaker_label: speaker,
        start_ms: w.start_ms,
        end_ms: w.end_ms,
        text: '',
        confidence: null,
        channel_index: channel,
        confSum: 0,
        confCount: 0,
        parts: [],
      };
    }
    current!.parts.push(token);
    current!.end_ms = Math.max(current!.end_ms, w.end_ms);
    if (typeof w.confidence === 'number') {
      current!.confSum += w.confidence;
      current!.confCount += 1;
    }
  }
  flush();
  return segments.sort((a, b) => a.start_ms - b.start_ms);
}

export function countSpeakers(segments: TranscriptSegment[]): number {
  return new Set(segments.map((s) => s.speaker_label)).size || 1;
}

/** logprob (≤0) → confianza 0..1. */
export function logprobToConfidence(logprob: number | null | undefined): number | null {
  if (typeof logprob !== 'number' || Number.isNaN(logprob)) return null;
  return Number(Math.min(1, Math.max(0, Math.exp(logprob))).toFixed(4));
}
