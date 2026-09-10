/**
 * Adaptador STT — OpenAI `gpt-transcribe` (docs-openai.md §Speech-to-text).
 *
 * Tercer fallback: sin diarización (un solo hablante `speaker_0`), archivos
 * ≤ 25 MB. `languages` es un array (gotcha 5; no enviar `language`). El SDK
 * `openai@6.15` aún no tipa `languages`, por eso se pasa con cast: el
 * multipart del SDK serializa cualquier clave del body.
 *
 * Sin timestamps por palabra (response_format json): los segmentos se generan
 * por frases y se distribuyen proporcionalmente en la duración conocida.
 */

import {
  type SttAdapter,
  type SttInput,
  type TranscriptResult,
  type TranscriptSegment,
  SttProviderError,
  toSttError,
} from './types';

export const OPENAI_STT_MODEL = 'gpt-transcribe';
const MAX_BYTES = 25 * 1024 * 1024;
/** $0.0045/min (D8). */
const USD_PER_MINUTE = 0.0045;

/** Divide texto plano en frases y las reparte en el tiempo (proporcional a su longitud). */
export function splitTextIntoSegments(text: string, durationSeconds: number | null): TranscriptSegment[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["»)]?|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const total = sentences.reduce((n, s) => n + s.length, 0) || 1;
  const durationMs = Math.max(1000, Math.round((durationSeconds ?? Math.ceil(clean.split(' ').length / 2.5)) * 1000));
  let cursor = 0;
  return sentences.map((s) => {
    const span = Math.max(300, Math.round((s.length / total) * durationMs));
    const seg: TranscriptSegment = {
      speaker_label: 'speaker_0',
      start_ms: cursor,
      end_ms: Math.min(durationMs, cursor + span),
      text: s,
      confidence: null,
      channel_index: null,
    };
    cursor = seg.end_ms;
    return seg;
  });
}

export class OpenAiTranscribeAdapter implements SttAdapter {
  readonly name = 'openai' as const;
  readonly supportsDiarization = false;
  readonly maxDurationSeconds = 1500;
  /** 25 MB duro (docs-openai.md). La cascada lo salta con 413 sin gastar la llamada. */
  readonly maxBytes = MAX_BYTES;

  constructor(private readonly apiKey: string, private readonly model: string = OPENAI_STT_MODEL) {}

  async transcribe(input: SttInput): Promise<TranscriptResult> {
    if (!this.apiKey) throw new SttProviderError('openai', 'OPENAI_API_KEY ausente', 401, false);
    if (typeof input.audio === 'string') {
      throw new SttProviderError('openai', 'OpenAI requiere el audio en memoria (no URL)', 400, false);
    }
    if (input.audio.length > MAX_BYTES) {
      throw new SttProviderError('openai', `Archivo de ${input.audio.length} bytes supera 25 MB`, 413, false);
    }
    const { default: OpenAI, toFile } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });
    const model = input.model ?? this.model;
    const ext = input.mimeType.includes('wav') ? 'wav' : input.mimeType.includes('ogg') ? 'ogg' : input.mimeType.includes('webm') ? 'webm' : input.mimeType.includes('mp4') || input.mimeType.includes('m4a') ? 'm4a' : 'mp3';
    const langIso1 = input.language === 'spa' ? 'es' : input.language.slice(0, 2);

    let res: { text?: string; language?: string; duration?: number; usage?: unknown };
    try {
      const file = await toFile(input.audio, `call.${ext}`, { type: input.mimeType });
      const params = {
        file,
        model,
        response_format: 'json' as const,
        prompt: `Llamada comercial en español colombiano.${input.hints?.length ? ` Términos: ${input.hints.slice(0, 30).join(', ')}.` : ''}`,
        languages: [langIso1],
      };
      res = (await client.audio.transcriptions.create(params as unknown as Parameters<typeof client.audio.transcriptions.create>[0])) as typeof res;
    } catch (err) {
      throw toSttError('openai', err);
    }

    const text = (res.text ?? '').trim();
    const duration = input.durationSeconds ?? (typeof res.duration === 'number' ? Math.round(res.duration) : null);
    const segments = splitTextIntoSegments(text, duration);
    return {
      provider: 'openai',
      model,
      language: res.language ?? langIso1,
      text,
      segments,
      speaker_count: 1,
      duration_seconds: duration,
      raw: { usage: res.usage ?? null, segment_count: segments.length, diarization: false },
      cost_usd: duration ? Number(((duration / 60) * USD_PER_MINUTE).toFixed(6)) : null,
      provider_request_id: null,
    };
  }
}
