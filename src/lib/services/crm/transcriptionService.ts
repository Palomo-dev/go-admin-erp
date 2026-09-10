import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { chargeAiCredits, refundAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { getUnitCost } from '@/lib/services/crm/pricingService';
import { getCallAiPolicy, type CallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { assignSpeakerRoles, type ChannelRoleMap } from '@/lib/services/crm/callChannelRoles';
import { downloadFromTwilio } from '@/lib/services/crm/recordingStorageService';
import {
  transcribeWithFallback,
  resolveSttSizeLimit,
  STT_FALLBACK_MAX_AUDIO_BYTES,
  GEMINI_STT_MODEL,
  mapScribeResponse,
  SttChainError,
  type FallbackAttempt,
  type SttAdapter,
  type SttInput,
  type SttProvider,
  type TranscriptResult,
} from '@/lib/services/crm/stt';
import { TRANSCRIPT_STATUSES } from '@/lib/crm/enums';
import { assertDbEnum } from '@/lib/services/crm/callAnalysisRules';

/**
 * Servicio CRM — FASE 4: transcripción de llamadas (STT). SOLO SERVIDOR.
 * Tablas: call_transcripts (UNIQUE por call_id), call_transcript_segments, call_recordings.
 *
 * Pipeline (FASE-04 §2):
 *  1. call_recordings.status='ready' (fix C7) → descarga del bucket
 *     `crm-call-recordings` con el `storage_path` completo (fix C8).
 *  2. Débito de créditos IA ANTES del proveedor (D6) y reembolso si falla.
 *  3. Cascada Scribe v2 → Gemini 3.8 Flash → OpenAI gpt-transcribe (stt/index.ts).
 *  4. Roles agente/cliente por canal o heurística (callChannelRoles.ts).
 *  5. UPSERT call_transcripts (UPDATE si existe) + reemplazo de segmentos.
 *
 * DESVIACIÓN (sin DDL): `provider_request_id`, `channel_role_map`, intentos y
 * costo real se guardan dentro de `raw_response` porque las columnas de
 * FASE-04 §3.1 aún no existen (ver "Necesito de DB").
 */

export const RECORDINGS_BUCKET = 'crm-call-recordings';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type TranscriptErrorCode =
  | 'CALL_NOT_FOUND'
  | 'NO_RECORDING'
  | 'AUDIO_EMPTY'
  | 'AUDIO_TOO_SHORT'
  | 'AUDIO_TOO_LARGE'
  | 'INSUFFICIENT_CREDITS'
  | 'PROVIDER_ERROR'
  | 'PERSIST_ERROR'
  | 'WEBHOOK_TIMEOUT';

/**
 * Tras este tiempo en `processing` se considera que el intento se perdió
 * (worker muerto, webhook de Scribe que nunca llega, `?sync=1` cortado por el
 * timeout de la función) y `transcribeCall` vuelve a procesar.
 */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

/**
 * Tiempo máximo absoluto en `processing`. Al superarlo la fila se marca
 * `failed` con `WEBHOOK_TIMEOUT` conservando `raw_response`, de modo que la UI
 * tenga una salida (botón Reintentar) en vez de un spinner eterno
 * (tester r1 nº 7).
 */
export const MAX_PROCESSING_MS = 30 * 60 * 1000;

/**
 * Tope de tamaño cuando NO se puede saber quién va a transcribir (sin
 * credenciales): el del adaptador más restrictivo, OpenAI 25 MB.
 *
 * Ronda 3 (tester r2 nº 7): esto ya NO es el tope global. El tope efectivo se
 * calcula por llamada con `resolveSttSizeLimit(orgId, preferred)` y es el
 * `maxBytes` MÁXIMO de la cadena con credenciales (ElevenLabs 1 GB, Gemini
 * 2 GB); dentro de la cascada, cada adaptador que no alcance se salta con 413
 * sin gastar la llamada. La constante se conserva como fallback y como límite
 * documentado del caso "sin proveedor configurado".
 */
export const STT_MAX_AUDIO_BYTES = STT_FALLBACK_MAX_AUDIO_BYTES;

export interface TranscriptRawResponse {
  provider_request_id?: string | null;
  channel_role_map?: ChannelRoleMap;
  attempts?: FallbackAttempt[];
  fell_back?: boolean;
  cost_usd?: number | null;
  credits?: number;
  job_id?: string | null;
  provider_raw?: Record<string, unknown>;
  pending?: boolean;
  [k: string]: unknown;
}

export interface CallTranscript {
  id: string;
  organization_id: number;
  call_id: string;
  provider: string;
  provider_model: string | null;
  language: string;
  status: TranscriptStatus;
  full_text: string | null;
  word_count: number | null;
  confidence: number | null;
  speaker_count: number | null;
  duration_seconds: number | null;
  cost_amount: number | null;
  raw_response: TranscriptRawResponse | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  segments?: CallTranscriptSegment[];
  /**
   * Transitorio (NO es columna): lo pone `completeTranscriptFromWebhook` cuando
   * la fila ya estaba `completed` antes del evento, para que el webhook pueda ser
   * idempotente por sí mismo y no dependa del dedupe de la cola (tester r1 nº 14).
   */
  already_completed?: boolean;
}

export interface CallTranscriptSegment {
  id: string;
  transcript_id: string;
  organization_id: number;
  speaker_label: string;
  speaker_role: 'agent' | 'customer' | 'unknown' | null;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number | null;
  sentiment: string | null;
}

export interface TranscriptFilters {
  status?: TranscriptStatus;
  provider?: string;
  callId?: string;
  limit?: number;
  offset?: number;
}

export class TranscriptionError extends Error {
  code: TranscriptErrorCode;
  retryable: boolean;
  constructor(code: TranscriptErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface TranscribeOptions {
  force?: boolean;
  /** Proveedor preferido para este intento (`elevenlabs`|`google`|`openai`). */
  provider?: string | null;
  supabase?: SupabaseClient;
  jobId?: string | null;
  userId?: string | null;
  /**
   * Cadena de adaptadores ya resuelta (tests y llamadores que la conocen). Si
   * viene, de aquí sale el tope de tamaño real y se pasa tal cual a la cascada.
   */
  adapters?: SttAdapter[];
}

interface CallRow {
  id: string;
  organization_id: number;
  direction: string;
  mode: string | null;
  duration_seconds: number | null;
  customer_id: string | null;
  opportunity_id: string | null;
  user_id: string | null;
}

interface RecordingRow {
  id: string;
  storage_path: string;
  storage_provider: string | null;
  channels: string | number | null;
  duration_seconds: number | null;
  size_bytes: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mimeFromPath(path: string): string {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'webm':
      return 'audio/webm';
    case 'm4a':
    case 'mp4':
      return 'audio/mp4';
    default:
      return 'audio/mpeg';
  }
}

/** Créditos estimados: 1 crédito = US$0.01 (FASE-04 §8), mínimo 1. */
export function creditsForUsd(usd: number | null): number {
  if (!usd || !Number.isFinite(usd) || usd <= 0) return 1;
  return Math.max(1, Math.ceil(usd * 100));
}

/** Estima costo USD y unidades del sku de `provider_pricing` para el STT preferido. */
export async function estimateSttCharge(
  provider: string,
  durationSeconds: number,
): Promise<{ provider: string; model: string; unitSku: string; units: number; unitCost: number | null; usd: number | null; credits: number }> {
  const minutes = Math.max(1 / 60, durationSeconds / 60);
  let unitSku: string;
  let units: number;
  let model: string;
  let p = provider;
  if (provider === 'google' || provider === 'gemini') {
    p = 'google';
    // El único sku de audio sembrado en `provider_pricing` es el de 2.5 ($1.00/1M
    // token_1m_in); se usa como estimación mientras DB no siembre el de 3.8.
    unitSku = 'gemini_2_5_flash_audio_in';
    units = (durationSeconds * 32) / 1e6; // token_1m_in
    model = GEMINI_STT_MODEL;
  } else if (provider === 'openai') {
    unitSku = 'gpt_transcribe';
    units = minutes; // minute
    model = 'gpt-transcribe';
  } else {
    p = 'elevenlabs';
    unitSku = 'scribe';
    units = minutes / 60; // hour
    model = 'scribe_v2';
  }
  const unit = await getUnitCost(p, unitSku).catch(() => null);
  const usd = unit != null ? Number((unit * units).toFixed(6)) : null;
  // `unitCost` se devuelve para poder reconciliar `metadata.unit_cost_usd` con la
  // tarifa del proveedor que REALMENTE respondió (tester r2 nº 9).
  return { provider: p, model, unitSku, units, unitCost: unit, usd, credits: creditsForUsd(usd ?? minutes * 0.004) };
}

async function downloadAudio(rec: RecordingRow, sb: SupabaseClient): Promise<{ buffer: Buffer; mimeType: string }> {
  if (rec.storage_provider === 'twilio' || /^https?:\/\//i.test(rec.storage_path)) {
    const { buffer, contentType } = await downloadFromTwilio(rec.storage_path);
    return { buffer, mimeType: contentType || mimeFromPath(rec.storage_path) };
  }
  const { data, error } = await sb.storage.from(RECORDINGS_BUCKET).download(rec.storage_path);
  if (error || !data) {
    throw new TranscriptionError('NO_RECORDING', `No se pudo descargar ${RECORDINGS_BUCKET}/${rec.storage_path}: ${error?.message ?? 'sin datos'}`, true);
  }
  return { buffer: Buffer.from(await data.arrayBuffer()), mimeType: data.type || mimeFromPath(rec.storage_path) };
}

/**
 * Único punto donde F4 escribe `call_transcripts.status`, con el literal
 * validado contra el CHECK real (`pending|processing|completed|failed`).
 * Ronda 3 (tester r2 nº 5): antes los 4 literales se escribían sueltos.
 */
function transcriptStatus(value: string): TranscriptStatus {
  return assertDbEnum(value, TRANSCRIPT_STATUSES, 'call_transcripts.status');
}

async function upsertTranscriptRow(
  sb: SupabaseClient,
  orgId: number,
  callId: string,
  patch: Record<string, unknown>,
  existingId?: string | null,
): Promise<CallTranscript> {
  const now = new Date().toISOString();
  if (typeof patch.status === 'string') patch = { ...patch, status: transcriptStatus(patch.status) };
  if (existingId) {
    const { data, error } = await sb
      .from('call_transcripts')
      .update({ ...patch, updated_at: now })
      .eq('id', existingId)
      .eq('organization_id', orgId)
      .select()
      .single();
    if (error || !data) throw new Error(`call_transcripts update falló: ${error?.message ?? 'sin datos'}`);
    return data as CallTranscript;
  }
  const { data, error } = await sb
    .from('call_transcripts')
    .insert({ organization_id: orgId, call_id: callId, provider: 'pending', language: 'spa', status: transcriptStatus('pending'), ...patch })
    .select()
    .single();
  if (error || !data) throw new Error(`call_transcripts insert falló: ${error?.message ?? 'sin datos'}`);
  return data as CallTranscript;
}

/**
 * Marca la transcripción como `failed` CONSERVANDO el `raw_response` anterior
 * (tester r1 nº 8: reemplazarlo entero borraba `provider_request_id`, la única
 * forma de recuperar una transcripción enviada en modo webhook, además de
 * `recording_id`, `credits` y `estimated_cost_usd`).
 */
async function markFailed(
  sb: SupabaseClient,
  orgId: number,
  callId: string,
  existingId: string | null | undefined,
  code: TranscriptErrorCode,
  message: string,
  extraRaw: Record<string, unknown> = {},
): Promise<CallTranscript | null> {
  try {
    let prevRaw: Record<string, unknown> = {};
    if (existingId) {
      const { data } = await sb.from('call_transcripts').select('raw_response').eq('id', existingId).eq('organization_id', orgId).maybeSingle();
      const r = (data as { raw_response?: Record<string, unknown> | null } | null)?.raw_response;
      if (r && typeof r === 'object') prevRaw = r;
    }
    return await upsertTranscriptRow(
      sb,
      orgId,
      callId,
      {
        status: 'failed',
        error_code: code,
        error_message: message.slice(0, 1000),
        completed_at: new Date().toISOString(),
        raw_response: { ...prevRaw, ...extraRaw, failed_at: new Date().toISOString(), last_error_code: code },
      },
      existingId,
    );
  } catch (err) {
    console.error('[transcriptionService] No se pudo marcar failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Si la transcripción lleva más de `MAX_PROCESSING_MS` en `processing`, la marca
 * `failed` (`WEBHOOK_TIMEOUT`) conservando `raw_response`. La usan `transcribeCall`
 * y `GET /api/crm/calls/[id]/transcript` para que la UI nunca quede sin salida.
 */
export async function expireStuckTranscript(orgId: number, callId: string, supabase: SupabaseClient): Promise<CallTranscript | null> {
  const { data } = await supabase.from('call_transcripts').select('id, status, started_at, updated_at, created_at').eq('call_id', callId).eq('organization_id', orgId).maybeSingle();
  const row = data as { id: string; status: string; started_at: string | null; updated_at: string | null; created_at: string } | null;
  if (!row || row.status !== 'processing') return null;
  const since = Date.parse(row.started_at ?? row.updated_at ?? row.created_at);
  if (!Number.isFinite(since) || Date.now() - since < MAX_PROCESSING_MS) return null;
  return markFailed(supabase, orgId, callId, row.id, 'WEBHOOK_TIMEOUT', `La transcripción quedó en "processing" más de ${Math.round(MAX_PROCESSING_MS / 60000)} minutos sin respuesta del proveedor`, { expired: true });
}

/**
 * ¿Hay un envío al proveedor todavía vivo para esta fila? Es la MISMA ventana
 * que usa la UI para ofrecer "Reintentar" (`CallTranscriptPanel`), de modo que
 * el botón nunca aparece mientras un envío sigue en curso (tester r2 nº 6).
 */
export function isLiveAttempt(row: Pick<CallTranscript, 'status' | 'started_at' | 'updated_at' | 'created_at'>, now = Date.now()): boolean {
  if (row.status !== 'processing') return false;
  const since = Date.parse(row.started_at ?? row.updated_at ?? row.created_at ?? '');
  if (!Number.isFinite(since)) return false;
  return now - since < STALE_PROCESSING_MS;
}

/**
 * Persiste el resultado STT: UPDATE de la fila + reemplazo de segmentos con
 * roles asignados. Devuelve la fila completada con `segments`.
 */
export async function persistTranscript(
  sb: SupabaseClient,
  orgId: number,
  transcriptId: string,
  call: Pick<CallRow, 'direction' | 'mode'>,
  result: TranscriptResult,
  extra: Partial<TranscriptRawResponse> = {},
): Promise<CallTranscript> {
  const { segments, map } = assignSpeakerRoles(result.segments, call);
  const now = new Date().toISOString();

  await sb.from('call_transcript_segments').delete().eq('transcript_id', transcriptId).eq('organization_id', orgId);
  const rows = segments.map((s) => ({
    transcript_id: transcriptId,
    organization_id: orgId,
    speaker_label: s.speaker_label,
    speaker_role: s.speaker_role,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    text: s.text,
    confidence: s.confidence,
    sentiment: null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('call_transcript_segments').insert(rows.slice(i, i + 200));
    if (error) console.warn('[transcriptionService] Error guardando segmentos:', error.message);
  }

  const fullText = result.text || segments.map((s) => s.text).join(' ');
  const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
  const rawResponse: TranscriptRawResponse = {
    ...extra,
    provider_request_id: result.provider_request_id ?? extra.provider_request_id ?? null,
    channel_role_map: map,
    cost_usd: result.cost_usd,
    provider_raw: result.raw,
    pending: false,
  };
  const { data, error } = await sb
    .from('call_transcripts')
    .update({
      provider: result.provider,
      provider_model: result.model,
      language: result.language,
      status: transcriptStatus('completed'),
      full_text: fullText,
      word_count: wordCount,
      confidence: result.language_probability ?? (segments.length ? segments.reduce((n, s) => n + (s.confidence ?? 0), 0) / segments.length : null),
      speaker_count: result.speaker_count,
      duration_seconds: result.duration_seconds,
      cost_amount: result.cost_usd,
      raw_response: rawResponse,
      completed_at: now,
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq('id', transcriptId)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (error || !data) throw new Error(`call_transcripts update (completed) falló: ${error?.message ?? 'sin datos'}`);
  const transcript = data as CallTranscript;
  transcript.segments = rows.map((r, i) => ({ id: `${transcriptId}:${i}`, ...r })) as CallTranscriptSegment[];
  return transcript;
}

// ─── API principal ───────────────────────────────────────────────────────────

/**
 * Transcribe una llamada (idempotente por `call_id`).
 * - Devuelve la transcripción existente si ya está `completed` y no `force`.
 * - Lanza `TranscriptionError` con `code`/`retryable` (los jobs lo mapean a
 *   JobRetryableError/JobFatalError); `InsufficientCreditsError` se traduce a
 *   `INSUFFICIENT_CREDITS` (no reintentable).
 */
export async function transcribeCall(orgId: number, callId: string, opts: TranscribeOptions = {}): Promise<CallTranscript> {
  const sb = opts.supabase ?? getServiceClient();

  // 1. Llamada de la org
  const { data: callRow } = await sb
    .from('calls')
    .select('id, organization_id, direction, mode, duration_seconds, customer_id, opportunity_id, user_id')
    .eq('id', callId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!callRow) throw new TranscriptionError('CALL_NOT_FOUND', `La llamada ${callId} no pertenece a la organización`, false);
  const call = callRow as CallRow;

  // 2. Transcripción existente (índice único por call_id)
  const { data: existingRow } = await sb.from('call_transcripts').select('*').eq('call_id', callId).eq('organization_id', orgId).maybeSingle();
  const existing = (existingRow ?? null) as CallTranscript | null;
  if (existing) {
    if (existing.status === 'completed' && !opts.force) return existing;
    if (existing.status === 'processing' && isLiveAttempt(existing)) {
      // Ronda 3 (tester r2 nº 6): `force` NO puede saltarse esta guarda. Saltarla
      // permitía que el botón "Reintentar" (a los 3 min) lanzara un segundo envío
      // al proveedor —y un segundo cobro— mientras el primero seguía vivo.
      // `force` sirve para re-transcribir algo terminado, no para duplicar un
      // envío en curso.
      return existing;
    }
  }

  // 3. Grabación lista (fix C7: status 'ready')
  const { data: recRow } = await sb
    .from('call_recordings')
    .select('id, storage_path, storage_provider, channels, duration_seconds, size_bytes')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!recRow || !(recRow as RecordingRow).storage_path) {
    await markFailed(sb, orgId, callId, existing?.id, 'NO_RECORDING', 'No hay grabación en estado ready para esta llamada', { job_id: opts.jobId ?? null });
    throw new TranscriptionError('NO_RECORDING', 'No hay grabación en estado ready para esta llamada', false);
  }
  const recording = recRow as RecordingRow;
  const channels: 1 | 2 = String(recording.channels) === '2' ? 2 : 1;
  const durationSeconds = recording.duration_seconds ?? call.duration_seconds ?? null;

  const policy: CallAiPolicy = await getCallAiPolicy(orgId);
  if (!opts.force && durationSeconds !== null && durationSeconds < policy.minDurationSeconds) {
    const msg = `Audio de ${durationSeconds}s por debajo del mínimo (${policy.minDurationSeconds}s)`;
    await markFailed(sb, orgId, callId, existing?.id, 'AUDIO_TOO_SHORT', msg, { job_id: opts.jobId ?? null });
    throw new TranscriptionError('AUDIO_TOO_SHORT', msg, false);
  }

  // 4. Fila en processing. Se CONSERVA el raw_response previo (p. ej. el
  //    `provider_request_id` de un envío por webhook que todavía podría llegar):
  //    reemplazarlo dejaba la transcripción irrecuperable (tester r1 nº 8).
  const prevRaw = (existing?.raw_response ?? {}) as Record<string, unknown>;
  const row = await upsertTranscriptRow(
    sb,
    orgId,
    callId,
    {
      status: 'processing',
      provider: 'pending',
      language: policy.language,
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      raw_response: { ...prevRaw, job_id: opts.jobId ?? null, recording_id: recording.id, pending: false },
    },
    existing?.id,
  );

  // 5. Audio
  let audio: { buffer: Buffer; mimeType: string };
  try {
    audio = await downloadAudio(recording, sb);
  } catch (err) {
    const e = err instanceof TranscriptionError ? err : new TranscriptionError('NO_RECORDING', err instanceof Error ? err.message : 'Descarga fallida', true);
    await markFailed(sb, orgId, callId, row.id, e.code, e.message, { job_id: opts.jobId ?? null });
    throw e;
  }
  if (audio.buffer.length < 1024) {
    await markFailed(sb, orgId, callId, row.id, 'AUDIO_EMPTY', `Archivo de ${audio.buffer.length} bytes`, { job_id: opts.jobId ?? null });
    throw new TranscriptionError('AUDIO_EMPTY', 'La grabación está vacía', false);
  }
  // Tester r1 nº 10 + r2 nº 7: se comprueba ANTES del débito, pero con el límite
  // del adaptador que REALMENTE puede procesarlo (el máximo de la cadena con
  // credenciales), no con el del proveedor más pobre. Dentro de la cascada, cada
  // adaptador que no alcance se salta con 413 sin gastar la llamada.
  const preferred = opts.provider ?? policy.sttProvider;
  const sizeLimit = opts.adapters?.length
    ? { adapters: opts.adapters, maxBytes: opts.adapters.reduce((m, a) => Math.max(m, a.maxBytes ?? Number.MAX_SAFE_INTEGER), 0), source: 'chain' as const, reason: undefined }
    : await resolveSttSizeLimit(orgId, preferred);
  if (audio.buffer.length > sizeLimit.maxBytes) {
    const msg = `El audio pesa ${(audio.buffer.length / 1048576).toFixed(1)} MB y supera el máximo que acepta la cascada STT disponible (${Math.round(sizeLimit.maxBytes / 1048576)} MB)`;
    await markFailed(sb, orgId, callId, row.id, 'AUDIO_TOO_LARGE', msg, {
      job_id: opts.jobId ?? null,
      size_bytes: audio.buffer.length,
      max_bytes: sizeLimit.maxBytes,
      max_bytes_source: sizeLimit.source,
      ...(sizeLimit.reason ? { max_bytes_reason: sizeLimit.reason } : {}),
    });
    throw new TranscriptionError('AUDIO_TOO_LARGE', msg, false);
  }
  const effectiveDuration = durationSeconds ?? Math.max(1, Math.round(audio.buffer.length / 16000)); // ~128 kbps mp3

  // 6. Créditos ANTES del proveedor (D6)
  const estimate = await estimateSttCharge(preferred, effectiveDuration);
  let charge: { credits: number; logId: number | null; cost_amount: number | null };
  try {
    charge = await chargeAiCredits({
      orgId,
      actionType: 'call_transcribe',
      model: estimate.model,
      provider: estimate.provider,
      unitSku: estimate.unitSku,
      units: estimate.units,
      credits: estimate.credits,
      userId: opts.userId ?? call.user_id ?? null,
      metadata: { call_id: callId, transcript_id: row.id, duration_seconds: effectiveDuration, job_id: opts.jobId ?? null },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await markFailed(sb, orgId, callId, row.id, 'INSUFFICIENT_CREDITS', err.message, { job_id: opts.jobId ?? null });
      throw new TranscriptionError('INSUFFICIENT_CREDITS', err.message, false);
    }
    throw err;
  }

  /**
   * Libro mayor de ESTA ejecución: registra el cobro inicial, los ajustes de
   * `settleCreditDelta` y los reembolsos, de modo que cualquier salida por error
   * devuelva exactamente el saldo neto pendiente (tester r2 nº 1 y nº 2).
   */
  const ledger = new CreditLedger({
    orgId,
    actionType: 'call_transcribe',
    model: estimate.model,
    provider: estimate.provider,
    charged: charge.credits,
    logId: charge.logId,
    userId: opts.userId ?? call.user_id ?? null,
    supabase: sb,
  });

  // 7. Cascada de proveedores
  const input: SttInput = {
    audio: audio.buffer,
    mimeType: audio.mimeType,
    language: policy.language,
    channels,
    durationSeconds: effectiveDuration,
    dualTranscribe: policy.dualTranscribe && channels === 2,
    webhook: policy.asyncWebhook && effectiveDuration > 1800 ? { enabled: true, webhookId: process.env.ELEVENLABS_STT_WEBHOOK_ID } : undefined,
  };

  let outcome: Awaited<ReturnType<typeof transcribeWithFallback>>;
  try {
    outcome = await transcribeWithFallback(orgId, input, { preferred, adapters: sizeLimit.adapters.length ? sizeLimit.adapters : undefined });
  } catch (err) {
    const refund = await ledger.refundOutstanding(err);
    const chain = err instanceof SttChainError ? err : null;
    const msg = err instanceof Error ? err.message : 'Error de proveedor STT';
    await markFailed(sb, orgId, callId, row.id, 'PROVIDER_ERROR', msg, {
      job_id: opts.jobId ?? null,
      attempts: chain?.attempts ?? [],
      credits: ledger.charged,
      // Tester r2 nº 4: `refunded` refleja lo ocurrido de verdad; si la RPC de
      // reembolso falla queda el motivo en la fila para poder conciliar.
      refunded: refund.ok,
      refunded_credits: refund.refunded,
      ...(refund.ok ? {} : { refund_error: refund.error, pending_refund_credits: ledger.unrefunded }),
      estimated_cost_usd: estimate.usd,
    });
    throw new TranscriptionError('PROVIDER_ERROR', msg, chain ? chain.retryable : true);
  }

  // 8. Reconciliar economía con el proveedor que REALMENTE respondió y persistir.
  //    TODO lo que sigue al cobro va bajo este try/catch con reembolso del saldo
  //    neto: un fallo determinista aquí (CHECK, columna, red a Postgres) no debe
  //    reintentarse tres veces cobrando tres veces (tester r1 nº 2). La rama de
  //    webhook (7b) también vive dentro: estaba fuera y repetía ese mismo fallo
  //    (tester r2 nº 3).
  try {
    // 8a. Modo webhook: se deja `processing` con el provider_request_id y se sale.
    //     El cobro sigue vivo en el libro mayor hasta que el webhook complete.
    if (outcome.result.pending) {
      const raw: TranscriptRawResponse = {
        job_id: opts.jobId ?? null,
        recording_id: recording.id,
        provider_request_id: outcome.result.provider_request_id ?? null,
        attempts: outcome.attempts,
        pending: true,
        credits: ledger.charged,
        cost_usd: estimate.usd,
      };
      return await upsertTranscriptRow(sb, orgId, callId, { provider: outcome.provider, provider_model: outcome.result.model, raw_response: raw }, row.id);
    }

    const real = await estimateSttCharge(outcome.provider, effectiveDuration);
    const realUsd = outcome.result.cost_usd ?? real.usd;
    const changed = outcome.fellBack || outcome.provider !== estimate.provider || outcome.result.model !== estimate.model;
    let reconciled: boolean | null = null;
    if (changed || realUsd !== estimate.usd) {
      reconciled = await reconcileAiUsageModel(sb, charge.logId, {
        provider: outcome.provider,
        model: outcome.result.model ?? real.model,
        costUsd: realUsd,
        unitSku: real.unitSku,
        units: real.units,
        // Tester r2 nº 9: sin esto el log quedaba con el sku de OpenAI y la
        // tarifa por hora de ElevenLabs.
        unitCostUsd: real.unitCost,
        extra: { duration_seconds: effectiveDuration, cost_source: outcome.result.cost_usd != null ? 'provider' : 'pricing_table' },
        fellBack: changed,
      });
      // Tester r2 nº 10: si la reconciliación falla, el log se queda con la
      // economía del proveedor que no respondió; queda constancia en la fila.
      if (!reconciled) console.error(`[transcriptionService] la reconciliación de ai_usage_logs=${charge.logId ?? 'n/a'} falló: el log conserva el proveedor estimado`);
    }
    const settled = await ledger.settle({
      model: outcome.result.model ?? real.model,
      provider: outcome.provider,
      realCredits: creditsForUsd(realUsd ?? real.usd),
      metadata: { call_id: callId, transcript_id: row.id, reason: changed ? 'provider_fallback' : 'real_cost', estimated_cost_usd: estimate.usd, real_cost_usd: realUsd },
    });
    return await persistTranscript(sb, orgId, row.id, call, outcome.result, {
      job_id: opts.jobId ?? null,
      recording_id: recording.id,
      attempts: outcome.attempts,
      fell_back: outcome.fellBack,
      credits: settled.credits,
      credits_charged: charge.credits,
      credits_adjustment: settled.delta,
      // Ronda 4 (tester r3 N1): si el ajuste a la baja lo rechazó la RPC, la fila
      // NO puede publicar un importe rebajado sin decir que sigue debitado.
      // Ronda 5 (tester r4 P6): `pending_refund_credits` sólo aparece si de verdad
      // se debe algo; en un ajuste AL ALZA rechazado el dinero va en la otra
      // dirección y publicar una deuda de 0 era engañoso.
      ...(settled.ok ? {} : { credit_settlement_error: settled.error, ...(settled.unrefunded > 0 ? { pending_refund_credits: settled.unrefunded } : {}) }),
      estimated_cost_usd: estimate.usd,
      charged_cost_usd: charge.cost_amount,
      unit_sku: real.unitSku,
      unit_cost_usd: real.unitCost,
      ...(reconciled === null ? {} : { usage_log_reconciled: reconciled }),
    });
  } catch (err) {
    const refund = await ledger.refundOutstanding(err);
    const msg = err instanceof Error ? err.message : 'No se pudo guardar la transcripción';
    await markFailed(sb, orgId, callId, row.id, 'PERSIST_ERROR', msg, {
      job_id: opts.jobId ?? null,
      attempts: outcome.attempts,
      credits: ledger.charged,
      credits_adjustment: ledger.charged - charge.credits,
      refunded: refund.ok,
      refunded_credits: refund.refunded,
      ...(refund.ok ? {} : { refund_error: refund.error, pending_refund_credits: ledger.unrefunded }),
    });
    throw new TranscriptionError('PERSIST_ERROR', msg, false);
  }
}

/**
 * D6 — ajusta `ai_usage_logs` al proveedor/modelo/COSTO REALES cuando la cascada
 * cambió de proveedor o de modelo respecto al estimado con el que se cobró
 * (p. ej. `gemini-2.5-flash` → `gemini-3.6-flash`, o Google → OpenAI), o cuando
 * el proveedor devolvió el consumo real.
 *
 * Ronda 2 (tester r1 nº 4): antes sólo corregía `model` y `metadata.provider`, y
 * dejaba `cost_amount`, `unit_sku`, `units` y `unit_cost_usd` con la tarifa del
 * proveedor que NO respondió — el panel de costos mostraba el modelo de uno con
 * la tarifa del otro. Ahora se reconcilia también la economía de la fila.
 *
 * Los créditos se ajustan aparte con `settleCreditDelta`. Lee y fusiona la
 * metadata para no depender de la forma interna que escribe `aiCostService`
 * (zona de solo lectura). Vive aquí y la importa `callAnalysisService`.
 */
export async function reconcileAiUsageModel(
  supabase: SupabaseClient,
  logId: number | null | undefined,
  actual: {
    provider: string;
    model: string;
    costUsd?: number | null;
    unitSku?: string | null;
    units?: number | null;
    unitCostUsd?: number | null;
    /** Campos extra que se fusionan en la metadata (tokens reales, sku de salida…). */
    extra?: Record<string, unknown>;
    /** Marca `fell_back`; por defecto se deduce de si cambió proveedor o modelo. */
    fellBack?: boolean;
  },
): Promise<boolean> {
  if (!logId) return false;
  try {
    const { data } = await supabase.from('ai_usage_logs').select('model, metadata').eq('id', logId).maybeSingle();
    if (!data) return false;
    const row = data as { model: string | null; metadata: Record<string, unknown> | null };
    const prev = row.metadata ?? {};
    const changed = row.model !== actual.model || prev.provider !== actual.provider;
    const costChanged = actual.costUsd != null && prev.cost_amount !== actual.costUsd;
    const skuChanged = actual.unitSku != null && prev.unit_sku !== actual.unitSku;
    if (!changed && !costChanged && !skuChanged) return false;
    const fellBack = actual.fellBack ?? changed;
    const { error } = await supabase
      .from('ai_usage_logs')
      .update({
        model: actual.model,
        // `ai_usage_logs.cost_amount` SÍ existe como columna numeric (verificado
        // 2026-09-08); `aiCostService` sólo escribe la copia en metadata, así que
        // aquí se dejan las dos coherentes.
        ...(actual.costUsd != null ? { cost_amount: actual.costUsd } : {}),
        metadata: {
          ...prev,
          ...(actual.extra ?? {}),
          provider: actual.provider,
          ...(changed ? { estimated_model: row.model, estimated_provider: prev.provider ?? null } : {}),
          ...(costChanged ? { estimated_cost_amount: prev.cost_amount ?? null } : {}),
          ...(skuChanged ? { estimated_unit_sku: prev.unit_sku ?? null } : {}),
          fell_back: fellBack,
          ...(actual.costUsd != null ? { cost_amount: actual.costUsd } : {}),
          ...(actual.unitSku != null ? { unit_sku: actual.unitSku } : {}),
          ...(actual.units != null ? { units: actual.units } : {}),
          ...(actual.unitCostUsd != null ? { unit_cost_usd: actual.unitCostUsd } : {}),
        },
      })
      .eq('id', logId);
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.warn('[aiUsage] reconcile falló:', err instanceof Error ? err.message : err);
    return false;
  }
}

export interface LedgerRefundResult {
  /** Créditos efectivamente devueltos en esta operación. */
  refunded: number;
  /** false si la RPC de reembolso falló (o lanzó): los créditos NO volvieron. */
  ok: boolean;
  error: string | null;
}

/**
 * Ronda 3 (tester r2 nº 1, 2 y 4) — "cobro neto vivo" de UNA ejecución.
 *
 * El problema que resuelve: `settleCreditDelta` ya devolvía la diferencia cuando
 * el costo real era menor, y el `catch` posterior devolvía ADEMÁS el cobro
 * completo (medido: cobro 30 → 59 devueltos); en el caso simétrico, el segundo
 * cobro `:adjust` no se devolvía nunca. Ambos reembolsos no se conocían entre sí.
 *
 * El libro mayor registra TODO lo debitado (cobro inicial + ajustes) y TODO lo
 * devuelto (ajuste a la baja + reembolsos), de modo que `refundOutstanding()`
 * devuelve exactamente el saldo neto pendiente: ni un crédito de más ni de menos.
 *
 * Además comprueba de verdad el resultado de `refundAiCredits` —que NO lanza,
 * devuelve `false`— y deja traza visible cuando el reembolso falla: log de error
 * y, si hay cliente, una fila `ai_usage_logs` con `action_type '<accion>:refund_failed'`
 * y `credits_consumed: 0` para poder conciliar después.
 */
export class CreditLedger {
  readonly orgId: number;
  readonly actionType: string;
  readonly logId: number | null;
  private model: string;
  private provider: string;
  private userId: string | null;
  private sb: SupabaseClient | null;
  private chargedTotal = 0;
  private refundedTotal = 0;
  private refundFailed = 0;
  private settleFailed = 0;
  /**
   * Cierre ya intentado y RECHAZADO por la RPC, con el importe y el motivo de
   * aquel intento (ronda 5, tester r4 P5). Sin esto `outstanding` no bajaba y una
   * segunda llamada a `refundOutstanding` repetía el intento y DUPLICABA la deuda
   * declarada (60 por un cobro de 30). No es alcanzable hoy —los cuatro puntos de
   * salida son ramas excluyentes— pero el libro mayor se documenta como
   * idempotente y debe serlo también en la rama de fallo.
   *
   * Ronda 6 (tester r5 N3): la idempotencia se decide por la EXISTENCIA del
   * cierre fallido, no por comparar cifras, porque un `settle` al alza posterior
   * cambiaba el importe y reabría la RPC.
   *
   * Ronda 7 (tester r6 F5): el importe guardado es lo YA declarado como deuda, y
   * sirve para anotar sólo la DIFERENCIA si un ajuste al alza posterior deja el
   * saldo vivo por encima (antes infradeclaraba esa diferencia). Nunca reabre la
   * RPC ni vuelve a declarar el importe entero.
   */
  private closeFailure: { credits: number; error: string } | null = null;

  constructor(init: {
    orgId: number;
    actionType: string;
    model: string;
    provider: string;
    /** Créditos del cobro inicial ya realizado. */
    charged: number;
    logId: number | null;
    userId?: string | null;
    supabase?: SupabaseClient | null;
  }) {
    this.orgId = init.orgId;
    this.actionType = init.actionType;
    this.model = init.model;
    this.provider = init.provider;
    this.logId = init.logId;
    this.userId = init.userId ?? null;
    this.sb = init.supabase ?? null;
    this.chargedTotal = Math.max(0, Math.round(init.charged));
  }

  /** Total debitado por esta ejecución (cobro inicial + ajustes al alza). */
  get charged(): number {
    return this.chargedTotal;
  }

  /** Total devuelto por esta ejecución (ajustes a la baja + reembolsos). */
  get refunded(): number {
    return this.refundedTotal;
  }

  /** Saldo neto vivo: lo que la organización ha pagado y aún no se le ha devuelto. */
  get outstanding(): number {
    return Math.max(0, this.chargedTotal - this.refundedTotal);
  }

  /**
   * Créditos que el CIERRE intentó devolver y la RPC rechazó: ya no habrá otro
   * intento en esta ejecución, así que es la deuda definitiva con la organización.
   * NO incluye los ajustes a la baja rechazados (ver `unsettled`): ésos siguen
   * dentro de `outstanding` y el cierre vuelve a intentarlos, contarlos aquí los
   * duplicaría en el mensaje de error.
   */
  get unrefunded(): number {
    return this.refundFailed;
  }

  /**
   * Créditos de un AJUSTE a la baja que la RPC rechazó (ronda 4, tester r3 N1).
   * Siguen debitados y siguen contando en `outstanding`; si esta ejecución acaba
   * bien no habrá cierre que los devuelva, y por eso quedan en `raw_response`
   * (`pending_refund_credits`) y en la fila `<accion>:refund_failed`.
   */
  get unsettled(): number {
    return this.settleFailed;
  }

  /**
   * Ajusta el cobro al costo real (delegando en `settleCreditDelta`) y ANOTA el
   * movimiento, de modo que un reembolso posterior no lo cuente dos veces.
   */
  async settle(input: { realCredits: number; model?: string; provider?: string; metadata?: Record<string, unknown> }): Promise<CreditSettlement> {
    if (input.model) this.model = input.model;
    if (input.provider) this.provider = input.provider;
    const settled = await settleCreditDelta({
      orgId: this.orgId,
      actionType: this.actionType,
      model: this.model,
      provider: this.provider,
      chargedCredits: this.chargedTotal,
      realCredits: input.realCredits,
      logId: this.logId,
      userId: this.userId,
      metadata: input.metadata,
      // Para que un ajuste a la baja rechazado deje la MISMA fila conciliable
      // que un cierre rechazado (`<accion>:refund_failed`).
      supabase: this.sb,
    });
    if (settled.ok && settled.delta > 0) this.chargedTotal += settled.delta;
    else if (settled.ok && settled.delta < 0) this.refundedTotal += -settled.delta;
    // Ronda 4 (tester r3 N1): un ajuste a la baja RECHAZADO por la RPC no puede
    // apuntarse como devuelto. `settleCreditDelta` ya no lo da por consumado
    // (delta 0, ok:false) y aquí sólo se anota como pendiente de conciliar: el
    // saldo vivo NO baja, así que el cierre volverá a intentar devolverlo entero.
    if (!settled.ok && settled.unrefunded > 0) this.settleFailed += settled.unrefunded;
    return settled;
  }

  /**
   * Devuelve EXACTAMENTE el saldo neto pendiente. Idempotente en los DOS
   * desenlaces (ronda 5, tester r4 P5):
   *
   *  - si la RPC acepta, `outstanding` queda en 0 y la segunda llamada no hace nada;
   *  - si la RPC RECHAZA, `outstanding` no baja (el saldo sigue debitado y es
   *    correcto que así sea), pero el intento queda anotado en `closeFailure`: la
   *    segunda llamada devuelve el MISMO resultado sin volver a llamar a la RPC,
   *    sin duplicar `unrefunded` y sin escribir una segunda fila `:refund_failed`.
   */
  async refundOutstanding(reason: unknown): Promise<LedgerRefundResult> {
    const credits = this.outstanding;
    if (credits <= 0) return { refunded: 0, ok: true, error: null };
    const why = reason instanceof Error ? reason.message.slice(0, 200) : typeof reason === 'string' ? reason.slice(0, 200) : `${this.actionType}_failed`;
    // Cierre ya intentado y rechazado: no se repite, CUALQUIERA que sea el saldo
    // actual. Ronda 6 (tester r5 N3): la comparación era por importe
    // (`closeFailure.credits === credits`), así que un `settle` AL ALZA posterior
    // cambiaba la cifra, colaba una segunda RPC y volvía a acumular `refundFailed`
    // (30 + 35 = 65 por una deuda de 35). El cierre es terminal: se compara por
    // CIERRE. El saldo vivo completo se sigue leyendo en `outstanding`.
    if (this.closeFailure) {
      // Ronda 7 (tester r6 F5): residuo aritmético del arreglo anterior. Si el
      // `settle` al alza dejó el saldo vivo POR ENCIMA de lo que el cierre
      // intentó devolver, la deuda definitiva con la organización es el saldo
      // actual (35), no lo declarado entonces (30): la fila conciliable
      // infradeclaraba 5. Se anota la DIFERENCIA —nunca el importe entero, que
      // era justo la duplicación de N3— y NO se vuelve a llamar a la RPC. A la
      // baja no se toca nada: lo ya declarado no se reescribe hacia abajo.
      if (credits > this.closeFailure.credits) {
        const extra = credits - this.closeFailure.credits;
        const error = this.closeFailure.error;
        this.refundFailed += extra;
        this.closeFailure = { credits, error };
        await this.recordFailedRefund(extra, error, `${why} (ajuste al alza tras cierre rechazado)`);
      }
      return { refunded: 0, ok: false, error: this.closeFailure.error };
    }
    try {
      const ok = await refundAiCredits({ orgId: this.orgId, credits, actionType: this.actionType, model: this.model, reason: why, logId: this.logId });
      if (ok) {
        this.refundedTotal += credits;
        return { refunded: credits, ok: true, error: null };
      }
      const error = 'refund_ai_credits devolvió false';
      this.refundFailed += credits;
      this.closeFailure = { credits, error };
      await this.recordFailedRefund(credits, error, why);
      return { refunded: 0, ok: false, error };
    } catch (err) {
      const error = err instanceof Error ? err.message.slice(0, 200) : String(err);
      this.refundFailed += credits;
      this.closeFailure = { credits, error };
      await this.recordFailedRefund(credits, error, why);
      return { refunded: 0, ok: false, error };
    }
  }

  /** Traza visible de un reembolso fallido (log de error + fila conciliable). */
  private async recordFailedRefund(credits: number, error: string, reason: string): Promise<void> {
    await recordFailedRefund({
      supabase: this.sb,
      orgId: this.orgId,
      actionType: this.actionType,
      model: this.model,
      userId: this.userId,
      logId: this.logId,
      credits,
      error,
      reason,
      stage: 'close',
    });
  }
}

/**
 * Traza ÚNICA de un reembolso que la RPC no aplicó, compartida por el cierre
 * (`CreditLedger.refundOutstanding`) y por el ajuste a la baja
 * (`settleCreditDelta`): log de error + fila conciliable
 * `ai_usage_logs '<accion>:refund_failed'` con `credits_consumed: 0` y
 * `metadata.pending_refund_credits`.
 *
 * `action_type` es `text` sin CHECK y los NOT NULL de la tabla
 * (organization_id, action_type, model, credits_consumed) van todos provistos:
 * verificado contra el esquema real, no supuesto.
 */
async function recordFailedRefund(input: {
  supabase?: SupabaseClient | null;
  orgId: number;
  actionType: string;
  model: string;
  userId?: string | null;
  logId: number | null;
  credits: number;
  error: string;
  reason: string;
  /** `close` = cierre del saldo vivo; `settle` = ajuste a la baja del cobro. */
  stage: 'close' | 'settle';
}): Promise<void> {
  console.error(
    `[creditLedger] REEMBOLSO FALLIDO (${input.stage}) org=${input.orgId} action=${input.actionType} credits=${input.credits} log=${input.logId ?? 'n/a'}: ${input.error}`,
  );
  if (!input.supabase) return;
  try {
    await input.supabase.from('ai_usage_logs').insert({
      organization_id: input.orgId,
      user_id: input.userId ?? null,
      action_type: `${input.actionType}:refund_failed`,
      model: input.model,
      credits_consumed: 0,
      metadata: {
        pending_refund_credits: input.credits,
        refund_error: input.error,
        reason: input.reason,
        refunded_log_id: input.logId,
        stage: input.stage,
        cost_amount: 0,
      },
    });
  } catch (err) {
    console.error('[creditLedger] no se pudo registrar el reembolso fallido:', err instanceof Error ? err.message : err);
  }
}

export interface CreditSettlement {
  /** Créditos efectivamente cobrados tras el ajuste (sin ajuste si no se aplicó). */
  credits: number;
  /** Ajuste REALMENTE aplicado (positivo = cobro extra, negativo = reembolso parcial). 0 si no se aplicó. */
  delta: number;
  ok: boolean;
  /**
   * Créditos que el ajuste a la baja intentó devolver y la RPC NO aceptó
   * (ronda 4, tester r3 N1). Siguen debitados a la organización.
   */
  unrefunded: number;
  /** Motivo del ajuste no aplicado; null si `ok`. */
  error: string | null;
}

/**
 * Ronda 2 (tester r1 nº 5) — los créditos se estiman con la tarifa del proveedor
 * PREFERIDO; si responde otro (cascada) la tarifa real puede ser mayor o menor.
 * Medido por el tester: hasta 18 % de infracobro en llamadas largas cuando cae de
 * ElevenLabs ($0.22/h) a OpenAI ($0.0045/min).
 *
 * Ajusta la diferencia después de la respuesta:
 *  - cobro insuficiente → débito adicional (si no hay saldo, se registra y se
 *    sigue: el trabajo ya está hecho y no se penaliza al usuario con un error);
 *  - cobro excesivo → reembolso parcial.
 *
 * Ronda 4 (tester r3 N1) — NINGÚN valor de retorno se ignora en los dos sentidos:
 * `chargeAiCredits` lanza y `refundAiCredits` devuelve `false`; en ambos casos el
 * ajuste se informa como NO aplicado (`ok:false`, `delta:0`) en vez de darse por
 * consumado. El importe que la RPC rechazó viaja en `unrefunded` y deja fila
 * `ai_usage_logs '<accion>:refund_failed'`.
 */
export async function settleCreditDelta(input: {
  orgId: number;
  actionType: string;
  model: string;
  provider: string;
  chargedCredits: number;
  realCredits: number;
  logId: number | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  /** Cliente para la fila conciliable si el ajuste a la baja se rechaza. */
  supabase?: SupabaseClient | null;
}): Promise<CreditSettlement> {
  const delta = Math.round(input.realCredits) - Math.round(input.chargedCredits);
  if (delta === 0) return { credits: input.chargedCredits, delta: 0, ok: true, unrefunded: 0, error: null };

  // ── Ajuste AL ALZA: `chargeAiCredits` LANZA si no hay saldo. No se penaliza al
  //    usuario con un error (el trabajo ya está hecho), pero el ajuste NO se da
  //    por aplicado: `delta` vuelve a 0 y el libro mayor no sube el cobro.
  if (delta > 0) {
    try {
      await chargeAiCredits({
        orgId: input.orgId,
        actionType: `${input.actionType}:adjust`,
        model: input.model,
        provider: input.provider,
        units: 0,
        credits: delta,
        userId: input.userId ?? null,
        metadata: { ...(input.metadata ?? {}), adjusts_log_id: input.logId, charged_credits: input.chargedCredits, real_credits: input.realCredits },
      });
      return { credits: input.chargedCredits + delta, delta, ok: true, unrefunded: 0, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message.slice(0, 200) : String(err);
      console.warn(`[aiUsage] el ajuste AL ALZA de ${delta} créditos falló (org=${input.orgId} action=${input.actionType}): ${error}`);
      return { credits: input.chargedCredits, delta: 0, ok: false, unrefunded: 0, error };
    }
  }

  // ── Ajuste A LA BAJA: `refundAiCredits` NO lanza, devuelve `false`.
  //    Ronda 4 (tester r3 N1): antes se ignoraba ese booleano y un reembolso
  //    rechazado salía como `ok:true, delta:-N`; el libro mayor lo apuntaba como
  //    devuelto, `raw_response` publicaba un importe que la organización nunca
  //    recuperó y no quedaba ni log ni fila conciliable. Ahora el rechazo se
  //    propaga: `delta` 0 (el saldo vivo NO baja, el cierre lo reintenta entero),
  //    `unrefunded` con lo que sigue debitado y la MISMA traza que el cierre.
  const credits = -delta;
  let accepted = false;
  let error: string | null = null;
  try {
    accepted = await refundAiCredits({
      orgId: input.orgId,
      credits,
      actionType: input.actionType,
      model: input.model,
      reason: 'credit_settlement_overcharge',
      logId: input.logId,
    });
    if (!accepted) error = 'refund_ai_credits devolvió false';
  } catch (err) {
    accepted = false;
    error = err instanceof Error ? err.message.slice(0, 200) : String(err);
  }
  if (accepted) return { credits: input.chargedCredits + delta, delta, ok: true, unrefunded: 0, error: null };
  await recordFailedRefund({
    supabase: input.supabase ?? null,
    orgId: input.orgId,
    actionType: input.actionType,
    model: input.model,
    userId: input.userId ?? null,
    logId: input.logId,
    credits,
    error: error ?? 'refund_ai_credits devolvió false',
    reason: 'credit_settlement_overcharge',
    stage: 'settle',
  });
  return { credits: input.chargedCredits, delta: 0, ok: false, unrefunded: credits, error };
}

/** Payload `data` del evento `speech_to_text_transcription` de ElevenLabs (docs-elevenlabs.md). */
export interface ScribeWebhookPayload {
  request_id: string;
  transcription?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * Completa una transcripción enviada en modo webhook. Busca la fila por
 * `raw_response->>provider_request_id` (provider elevenlabs) y usa SU
 * organization_id (nunca el del payload). Devuelve null si no se conoce el id.
 */
export async function completeTranscriptFromWebhook(
  requestId: string,
  payload: ScribeWebhookPayload,
  supabase?: SupabaseClient,
): Promise<CallTranscript | null> {
  const sb = supabase ?? getServiceClient();
  const { data: row } = await sb
    .from('call_transcripts')
    .select('*')
    .eq('provider', 'elevenlabs')
    .eq('raw_response->>provider_request_id', requestId)
    .maybeSingle();
  if (!row) return null;
  const transcript = row as CallTranscript;
  // Reintento de ElevenLabs (envía hasta 5 veces): no se reescribe nada y se
  // marca `already_completed` para que la ruta NO vuelva a encolar `analyze`.
  if (transcript.status === 'completed') return { ...transcript, already_completed: true };

  const { data: callRow } = await sb.from('calls').select('direction, mode').eq('id', transcript.call_id).eq('organization_id', transcript.organization_id).maybeSingle();
  const call = (callRow ?? { direction: 'outbound', mode: null }) as Pick<CallRow, 'direction' | 'mode'>;
  const transcription = (payload.transcription ?? payload) as Parameters<typeof mapScribeResponse>[0];
  const result = mapScribeResponse(transcription, { language: transcript.language, durationSeconds: transcript.duration_seconds });
  return persistTranscript(sb, transcript.organization_id, transcript.id, call, result, {
    ...(transcript.raw_response ?? {}),
    provider_request_id: requestId,
    pending: false,
    completed_via: 'webhook',
  });
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** Transcripción de una llamada con sus segmentos (ordenados por start_ms). */
export async function getTranscript(callId: string, orgId: number, supabase: SupabaseClient, withSegments = true): Promise<CallTranscript | null> {
  const { data: transcript, error } = await supabase
    .from('call_transcripts')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !transcript) return null;
  const transcriptData = transcript as CallTranscript;
  if (!withSegments) return transcriptData;

  const { data: segments, error: segError } = await supabase
    .from('call_transcript_segments')
    .select('*')
    .eq('transcript_id', transcriptData.id)
    .eq('organization_id', orgId)
    .order('start_ms', { ascending: true });
  if (segError) console.warn('[transcriptionService] Error obteniendo segmentos:', segError.message);
  return { ...transcriptData, segments: (segments as CallTranscriptSegment[]) || [] };
}

/** Lista transcripciones de una organización con filtros opcionales. */
export async function getTranscripts(orgId: number, supabase: SupabaseClient, filters?: TranscriptFilters): Promise<CallTranscript[]> {
  let query = supabase.from('call_transcripts').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.provider && filters.provider !== 'pending') query = query.eq('provider', filters.provider);
  if (filters?.callId) query = query.eq('call_id', filters.callId);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
  else if (!filters?.limit) query = query.limit(50);
  const { data, error } = await query;
  if (error) {
    console.warn('[transcriptionService] getTranscripts error:', error.message);
    return [];
  }
  return (data as CallTranscript[]) || [];
}

/** Actualiza el estado de una transcripción. */
export async function updateTranscriptStatus(id: string, orgId: number, status: TranscriptStatus, supabase: SupabaseClient): Promise<CallTranscript | null> {
  const updateData: Record<string, unknown> = { status: transcriptStatus(status), updated_at: new Date().toISOString() };
  if (status === 'completed') updateData.completed_at = new Date().toISOString();
  if (status === 'processing') updateData.started_at = new Date().toISOString();
  const { data, error } = await supabase.from('call_transcripts').update(updateData).eq('id', id).eq('organization_id', orgId).select().single();
  if (error) throw error;
  return data as CallTranscript;
}

/** Formato de la transcripción para el LLM: `[mm:ss] [AGENTE|CLIENTE]: texto` (truncado a maxWords). */
export function renderTranscriptForLlm(segments: Array<Pick<CallTranscriptSegment, 'speaker_role' | 'start_ms' | 'text'>>, maxWords = 12000): string {
  const lines = segments.map((s) => {
    const total = Math.max(0, Math.round(s.start_ms / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    const role = s.speaker_role === 'agent' ? 'AGENTE' : s.speaker_role === 'customer' ? 'CLIENTE' : 'HABLANTE';
    return `[${mm}:${ss}] [${role}]: ${s.text}`;
  });
  const words = lines.join('\n').split(/\s+/);
  if (words.length <= maxWords) return lines.join('\n');
  const head = Math.floor(maxWords * 0.7);
  const tail = maxWords - head;
  return `${words.slice(0, head).join(' ')}\n[... transcripción truncada ...]\n${words.slice(-tail).join(' ')}`;
}

export type { SttProvider };
