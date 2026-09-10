/**
 * Cadena de adaptadores STT con fallback (FASE-04 §4.2 `resolveSttChain`).
 *
 * Orden: proveedor preferido de `provider_configs` (category `stt`, priority
 * ASC, credenciales de la org o fallback env) → ElevenLabs → Gemini → OpenAI,
 * filtrando los que no tengan API key real (placeholders de .env.example no
 * cuentan: `providerRegistry.sanitizeCredentials`). SOLO SERVIDOR.
 */

import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import type { ProviderConfig } from '@/lib/services/providerRegistry';
import { ElevenLabsScribeAdapter } from './elevenLabsScribe';
import { GeminiAudioAdapter } from './geminiAudio';
import { OpenAiTranscribeAdapter } from './openaiTranscribe';
import { type SttAdapter, type SttInput, type SttProvider, type TranscriptResult, SttProviderError, toSttError } from './types';

export * from './types';
export { ElevenLabsScribeAdapter, mapScribeResponse, toScribeLanguage } from './elevenLabsScribe';
export { GeminiAudioAdapter, GEMINI_STT_MODEL, mapGeminiSegments, parseTimestampToMs, recommendedGeminiModel } from './geminiAudio';
export { OpenAiTranscribeAdapter, splitTextIntoSegments } from './openaiTranscribe';

const STT_PROVIDERS: SttProvider[] = ['elevenlabs', 'google', 'openai'];

/** Normaliza alias (`gemini` → `google`, `eleven` → `elevenlabs`). */
export function normalizeSttProvider(value: unknown): SttProvider | null {
  const v = String(value ?? '').toLowerCase().trim();
  if (v === 'elevenlabs' || v === 'eleven' || v === 'scribe') return 'elevenlabs';
  if (v === 'google' || v === 'gemini') return 'google';
  if (v === 'openai' || v === 'whisper') return 'openai';
  return null;
}

function apiKeyOf(provider: SttProvider, cfg: ProviderConfig): string | null {
  const c = cfg.credentials ?? {};
  switch (provider) {
    case 'elevenlabs':
      return c.ELEVENLABS_API_KEY ?? null;
    case 'google':
      return c.GOOGLE_AI_API_KEY ?? c.GEMINI_API_KEY ?? null;
    case 'openai':
      return c.OPENAI_API_KEY ?? null;
  }
}

export interface ResolvedSttChain {
  adapters: SttAdapter[];
  /** Proveedor preferido de la org (aunque no tenga credenciales). */
  preferred: SttProvider;
  /** Settings efectivos del proveedor preferido (language_code, dual_transcribe…). */
  settings: Record<string, unknown>;
}

/**
 * Tope de tamaño que se aplica SOLO cuando la cadena no puede resolverse (sin
 * credenciales, error de red al leer `provider_configs`). Es el límite del
 * adaptador más restrictivo (OpenAI, 25 MB): si no sabemos quién va a
 * transcribir, se asume el peor caso.
 *
 * Ronda 3 (tester r2 nº 7): el tope REAL no es una constante. Cuando la cadena
 * se resuelve, el límite es el `maxBytes` MÁXIMO de los adaptadores con
 * credenciales (ElevenLabs 1 GB, Gemini 2 GB), porque la cascada ya salta con
 * 413 —sin gastar la llamada— el adaptador que no alcance (`transcribeWithFallback`).
 */
export const STT_FALLBACK_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface SttSizeLimit {
  /** Adaptadores con credenciales, en orden (vacío si no se pudo resolver). */
  adapters: SttAdapter[];
  /** Bytes máximos que ALGÚN adaptador de la cadena puede procesar. */
  maxBytes: number;
  /** De dónde sale el límite: de la cadena real o del fallback conservador. */
  source: 'chain' | 'fallback';
  /** Motivo del fallback (nunca se traga: se registra y se devuelve). */
  reason?: string;
}

/**
 * Resuelve la cadena para conocer el tope de tamaño ANTES de cobrar, sin
 * tumbar la transcripción si `provider_configs` no está disponible: en ese caso
 * devuelve el fallback y el motivo, y la resolución real vuelve a intentarse
 * dentro de `transcribeWithFallback` (que sí propaga el error).
 */
export async function resolveSttSizeLimit(orgId: number, preferred?: string | null): Promise<SttSizeLimit> {
  try {
    const chain = await resolveSttChain(orgId, preferred);
    if (chain.adapters.length === 0) {
      return { adapters: [], maxBytes: STT_FALLBACK_MAX_AUDIO_BYTES, source: 'fallback', reason: 'ningún proveedor STT con credenciales' };
    }
    const maxBytes = chain.adapters.reduce((m, a) => Math.max(m, a.maxBytes ?? Number.MAX_SAFE_INTEGER), 0);
    return { adapters: chain.adapters, maxBytes, source: 'chain' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[stt] no se pudo resolver la cadena para el límite de tamaño, se usa el fallback de 25 MB:', reason.slice(0, 200));
    return { adapters: [], maxBytes: STT_FALLBACK_MAX_AUDIO_BYTES, source: 'fallback', reason };
  }
}

/**
 * Resuelve la cadena de adaptadores para la org. `preferred` fuerza el primero.
 */
export async function resolveSttChain(orgId: number, preferred?: string | null): Promise<ResolvedSttChain> {
  const primary = await getProviderCredentials(orgId, 'stt');
  const orgPreferred = normalizeSttProvider(primary.provider) ?? 'elevenlabs';
  const first = normalizeSttProvider(preferred) ?? orgPreferred;
  const order: SttProvider[] = [first, ...STT_PROVIDERS.filter((p) => p !== first)];

  const adapters: SttAdapter[] = [];
  for (const p of order) {
    const cfg = p === orgPreferred ? primary : await getProviderCredentials(orgId, 'stt', p);
    const key = cfg.isActive ? apiKeyOf(p, cfg) : null;
    if (!key) continue;
    const model = typeof cfg.settings?.model_id === 'string' ? (cfg.settings.model_id as string) : typeof cfg.settings?.model === 'string' ? (cfg.settings.model as string) : undefined;
    if (p === 'elevenlabs') adapters.push(new ElevenLabsScribeAdapter(key, model));
    else if (p === 'google') adapters.push(new GeminiAudioAdapter(key, model && model.startsWith('gemini') ? model : undefined));
    else adapters.push(new OpenAiTranscribeAdapter(key));
  }
  return { adapters, preferred: orgPreferred, settings: primary.settings ?? {} };
}

export interface FallbackAttempt {
  provider: SttProvider;
  ok: boolean;
  error?: string;
  status?: number | null;
  ms: number;
}

export interface TranscribeWithFallbackResult {
  result: TranscriptResult;
  attempts: FallbackAttempt[];
  /** Proveedor que finalmente respondió. */
  provider: SttProvider;
  /** true si el preferido falló y respondió otro. */
  fellBack: boolean;
}

export class SttChainError extends Error {
  attempts: FallbackAttempt[];
  retryable: boolean;
  constructor(message: string, attempts: FallbackAttempt[], retryable: boolean) {
    super(message);
    this.name = 'SttChainError';
    this.attempts = attempts;
    this.retryable = retryable;
  }
}

/**
 * Transcribe con cascada de proveedores. Registra cada intento; si todos
 * fallan lanza `SttChainError` (reintentable si algún fallo fue 429/5xx/red).
 * `adapters` es inyectable (tests); por defecto se resuelve por org.
 */
export async function transcribeWithFallback(
  orgId: number,
  input: SttInput,
  opts: { preferred?: string | null; adapters?: SttAdapter[] } = {},
): Promise<TranscribeWithFallbackResult> {
  const adapters = opts.adapters ?? (await resolveSttChain(orgId, opts.preferred)).adapters;
  if (adapters.length === 0) {
    throw new SttChainError('No hay proveedor STT con credenciales (ElevenLabs, Gemini u OpenAI)', [], false);
  }
  const attempts: FallbackAttempt[] = [];
  let anyRetryable = false;
  for (const adapter of adapters) {
    const started = Date.now();
    try {
      if (input.durationSeconds && input.durationSeconds > adapter.maxDurationSeconds) {
        throw new SttProviderError(adapter.name, `Duración ${input.durationSeconds}s supera el máximo del proveedor`, 413, false);
      }
      // Tamaño: se salta el adaptador ANTES de gastar la llamada (OpenAI 25 MB).
      if (adapter.maxBytes && input.audio.length > adapter.maxBytes) {
        throw new SttProviderError(adapter.name, `Audio de ${(input.audio.length / 1048576).toFixed(1)} MB supera el máximo del proveedor (${Math.round(adapter.maxBytes / 1048576)} MB)`, 413, false);
      }
      const result = await adapter.transcribe(input);
      attempts.push({ provider: adapter.name, ok: true, ms: Date.now() - started });
      return { result, attempts, provider: adapter.name, fellBack: attempts.length > 1 };
    } catch (err) {
      const e = toSttError(adapter.name, err);
      anyRetryable = anyRetryable || e.retryable;
      attempts.push({ provider: adapter.name, ok: false, error: e.message.slice(0, 500), status: e.status, ms: Date.now() - started });
      console.warn(`[stt] ${adapter.name} falló (${e.status ?? 'red'}): ${e.message.slice(0, 200)}`);
    }
  }
  throw new SttChainError(
    `Todos los proveedores STT fallaron: ${attempts.map((a) => `${a.provider}=${a.status ?? 'err'}`).join(', ')}`,
    attempts,
    anyRetryable,
  );
}
