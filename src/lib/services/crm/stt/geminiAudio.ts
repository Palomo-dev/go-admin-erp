/**
 * Adaptador STT — Gemini 2.5 Flash con audio nativo (docs-gemini.md §Audio).
 *
 * Camino principal: Files API (`client.files.upload`) + Interactions
 * (`client.interactions.create` con `response_format` JSON schema), verificado
 * en node_modules/@google/genai/dist/genai.d.ts 2.21.0 (`GoogleGenAI.interactions`
 * → `GeminiNextGenInteractions.create(params: CreateModelInteraction)` con
 * `input`, `response_format: { type:'text', mime_type, schema }`, `output_text`).
 * Audio ≤ 18 MB se envía inline (`{ type:'audio', data: base64 }`) para evitar
 * la subida; el resto va por Files API (2 GB, 48 h).
 * Si la versión instalada no expone `interactions`, se usa
 * `models.generateContent` con `responseMimeType/responseSchema` (legacy).
 *
 * La diarización es por prompt (speaker_0 = primero que habla); Gemini no
 * informa canal, así que los roles se asignan por heurística de dirección.
 */

import {
  type SttAdapter,
  type SttInput,
  type TranscriptResult,
  type TranscriptSegment,
  SttProviderError,
  countSpeakers,
  toSttError,
} from './types';

/**
 * `gemini-2.5-flash` aparece en ListModels pero devuelve 404 "no longer
 * available to new users" con la key del proyecto (E2E F4), así que el default
 * es el Flash GA. Si tampoco estuviera disponible, `recommendedGeminiModel`
 * reintenta con el que sugiera la propia API.
 */
export const GEMINI_STT_MODEL = 'gemini-3.8-flash';
const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;
/** 32 tokens/s de audio a $1.00/1M (D8) + salida ≈ $2.50/1M. */
const AUDIO_USD_PER_MTOK = 1.0;
const OUT_USD_PER_MTOK = 2.5;

export const GEMINI_SEGMENTS_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['speaker', 'start', 'end', 'text'],
      },
    },
  },
  required: ['language', 'segments'],
} as const;

const PROMPT = (lang: string, hints?: string[]) =>
  `Transcribe literalmente esta llamada comercial (idioma principal: ${lang === 'spa' ? 'español' : lang}). ` +
  'Separa por hablante: speaker_0 es la primera persona que habla, speaker_1 la segunda. ' +
  'Devuelve cada turno con timestamps MM:SS.mmm de inicio y fin. No resumas, no omitas, no traduzcas.' +
  (hints?.length ? ` Términos que pueden aparecer: ${hints.slice(0, 50).join(', ')}.` : '');

/** "MM:SS.mmm" | "H:MM:SS" | "SS.s" | número → ms. */
export function parseTimestampToMs(value: unknown): number {
  if (typeof value === 'number') return Math.max(0, Math.round(value * 1000));
  if (typeof value !== 'string') return 0;
  const v = value.trim();
  if (!v) return 0;
  const parts = v.split(':').map((p) => Number(p.replace(',', '.')));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.max(0, Math.round(seconds * 1000));
}

export function mapGeminiSegments(
  parsed: unknown,
  input: Pick<SttInput, 'language' | 'durationSeconds'>,
  raw: Record<string, unknown> = {},
): TranscriptResult {
  const obj = (parsed ?? {}) as { language?: string; segments?: Array<Record<string, unknown>> };
  if (!Array.isArray(obj.segments)) {
    throw new SttProviderError('google', 'Gemini devolvió JSON sin `segments`', 502, true);
  }
  const segments: TranscriptSegment[] = obj.segments
    .map((s) => {
      const start = parseTimestampToMs(s.start);
      const end = Math.max(start, parseTimestampToMs(s.end));
      return {
        speaker_label: String(s.speaker ?? 'speaker_0').trim() || 'speaker_0',
        start_ms: start,
        end_ms: end,
        text: String(s.text ?? '').trim(),
        confidence: null,
        channel_index: null,
      };
    })
    .filter((s) => s.text)
    .sort((a, b) => a.start_ms - b.start_ms);

  const lastEnd = segments.length ? segments[segments.length - 1].end_ms / 1000 : 0;
  const duration = input.durationSeconds ?? (lastEnd ? Math.round(lastEnd) : null);
  const text = segments.map((s) => s.text).join(' ');
  const audioTokens = (duration ?? lastEnd) * 32;
  const outTokens = Math.ceil(JSON.stringify(obj).length / 4);
  const cost = Number(((audioTokens / 1e6) * AUDIO_USD_PER_MTOK + (outTokens / 1e6) * OUT_USD_PER_MTOK).toFixed(6));

  return {
    provider: 'google',
    model: GEMINI_STT_MODEL,
    language: obj.language ?? input.language,
    text,
    segments,
    speaker_count: countSpeakers(segments),
    duration_seconds: duration,
    raw: { ...raw, segment_count: segments.length },
    cost_usd: cost,
    provider_request_id: (raw.id as string) ?? null,
  };
}

/**
 * Gemini responde 404 "This model models/X is no longer available to new
 * users. Please update your code to use models/Y" cuando el proyecto de la
 * key no tiene acceso al modelo pedido (visto en la E2E de F4 con
 * gemini-2.5-flash → recomendó gemini-3.6-flash). Devuelve Y o null.
 */
export function recommendedGeminiModel(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
  if (!/no longer available|not found|is not supported|update your code/i.test(msg)) return null;
  const m = msg.match(/use\s+(?:models\/)?(gemini-[a-z0-9.-]+)/i);
  return m ? m[1] : null;
}

function normalizeMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'audio/mp3';
  if (m === 'audio/x-wav' || m === 'audio/wave') return 'audio/wav';
  if (m === 'audio/x-m4a' || m === 'audio/mp4') return 'audio/m4a';
  return m || 'audio/mp3';
}

export class GeminiAudioAdapter implements SttAdapter {
  readonly name = 'google' as const;
  readonly supportsDiarization = true;
  readonly maxDurationSeconds = 34200;
  /** Inline hasta 18 MB; por encima usa la Files API (docs-gemini.md). */
  readonly maxBytes = 2 * 1024 * 1024 * 1024;

  constructor(private readonly apiKey: string, private readonly model: string = GEMINI_STT_MODEL) {}

  async transcribe(input: SttInput): Promise<TranscriptResult> {
    if (!this.apiKey) throw new SttProviderError('google', 'GOOGLE_AI_API_KEY ausente', 401, false);
    if (typeof input.audio === 'string') {
      throw new SttProviderError('google', 'Gemini requiere el audio en memoria (no URL)', 400, false);
    }
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const model = input.model ?? this.model;
    const mime = normalizeMime(input.mimeType);
    const prompt = PROMPT(input.language, input.hints);

    // 1. Contenido de audio: inline (≤18 MB) o Files API.
    let audioPart: Record<string, unknown>;
    let uploadedName: string | null = null;
    try {
      if (input.audio.length <= INLINE_LIMIT_BYTES) {
        audioPart = { type: 'audio', data: input.audio.toString('base64'), mime_type: mime };
      } else {
        const file = await client.files.upload({
          file: new Blob([new Uint8Array(input.audio)], { type: mime }),
          config: { mimeType: mime },
        });
        uploadedName = file.name ?? null;
        audioPart = { type: 'audio', uri: file.uri, mime_type: file.mimeType ?? mime };
      }
    } catch (err) {
      throw toSttError('google', err);
    }

    // 2. Interactions API (preferida) con fallback a generateContent.
    const callModel = async (m: string): Promise<{ outputText: string | undefined; rawMeta: Record<string, unknown> }> => {
      const interactions = (client as unknown as { interactions?: { create?: (p: unknown) => Promise<{ output_text?: string; id?: string; usage?: unknown }> } }).interactions;
      if (interactions && typeof interactions.create === 'function') {
        const interaction = await interactions.create({
          model: m,
          input: [{ type: 'text', text: prompt }, audioPart],
          response_format: { type: 'text', mime_type: 'application/json', schema: GEMINI_SEGMENTS_SCHEMA },
          generation_config: { temperature: 0.1 },
          store: false,
        });
        return { outputText: interaction.output_text, rawMeta: { id: interaction.id ?? null, usage: interaction.usage ?? null, api: 'interactions' } };
      }
      // Legacy (anotado en FASE-04 §13): la versión instalada no expone `interactions`.
      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      if (audioPart.data) parts.push({ inlineData: { data: audioPart.data, mimeType: mime } });
      else parts.push({ fileData: { fileUri: audioPart.uri, mimeType: mime } });
      const response = await client.models.generateContent({
        model: m,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', responseJsonSchema: GEMINI_SEGMENTS_SCHEMA, temperature: 0.1 },
      });
      return { outputText: response.text, rawMeta: { usage: response.usageMetadata ?? null, api: 'generateContent' } };
    };

    let outputText: string | undefined;
    let rawMeta: Record<string, unknown> = {};
    let usedModel = model;
    try {
      try {
        ({ outputText, rawMeta } = await callModel(model));
      } catch (err) {
        // Modelo no disponible para el proyecto de la key → un reintento con el que recomienda Gemini.
        const alt = recommendedGeminiModel(err);
        if (!alt || alt === model) throw err;
        console.warn(`[stt] gemini: ${model} no disponible, reintentando con ${alt}`);
        ({ outputText, rawMeta } = await callModel(alt));
        usedModel = alt;
        rawMeta.model_fallback = { from: model, to: alt };
      }
    } catch (err) {
      throw toSttError('google', err);
    } finally {
      if (uploadedName) client.files.delete({ name: uploadedName }).catch(() => undefined);
    }

    if (!outputText) throw new SttProviderError('google', 'Gemini no devolvió texto', 502, true);
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new SttProviderError('google', 'Gemini devolvió JSON inválido', 502, true);
    }
    const result = mapGeminiSegments(parsed, input, rawMeta);
    result.model = usedModel;
    return result;
  }
}
