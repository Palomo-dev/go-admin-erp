import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { RECORDINGS_BUCKET, STT_MAX_AUDIO_BYTES } from '@/lib/services/crm/transcriptionService';
import { upsertCallActivity } from '@/lib/services/crm/callActivityService';
import { resolveSttSizeLimit } from '@/lib/services/crm/stt';
import { CALL_MODES, CALL_STATUSES, DURATION_SOURCES, RECORDING_STATUSES } from '@/lib/crm/enums';
import { assertDbEnum } from '@/lib/services/crm/callAnalysisRules';

/**
 * Llamada manual con audio (FASE-04 §5.3 D / F5). SOLO SERVIDOR.
 *
 * Crea `calls` (mode 'manual', status 'completed', duration_source 'manual'),
 * sube el audio al bucket `crm-call-recordings` con path
 * `org_{id}/{yyyy}/{mm}/{callId}.{ext}` (política de storage de F0), crea
 * `call_recordings` (status 'ready', channels '1', storage_provider 'supabase')
 * y deja la actividad inicial. La transcripción/análisis entran por el mismo
 * pipeline (job `transcribe`).
 *
 * `from_number`/`to_number` son NOT NULL: se usa el teléfono del cliente como
 * destino y 'manual' como origen cuando no hay caller id.
 */

export type ManualAudioKind = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'webm';

/**
 * Tope de subida cuando NO se puede saber quién va a transcribir (sin
 * credenciales STT): el del adaptador más restrictivo, OpenAI 25 MB.
 *
 * Ronda 2 (tester r1 nº 10): antes eran 40 MB, así que un audio de 30 MB se
 * aceptaba (201), se subía al bucket, se creaban `calls` + `call_recordings` y
 * se cobraba el crédito para después fallar la cascada entera.
 *
 * Ronda 3 (tester r2 nº 7): esto ya NO es el tope global. El tope efectivo lo
 * da `resolveManualAudioMaxBytes(orgId)` = el `maxBytes` MÁXIMO de la cadena con
 * credenciales (ElevenLabs 1 GB, Gemini 2 GB), de modo que un audio de 30 MB que
 * ElevenLabs o Gemini procesan sin problema deja de rechazarse. Esta constante
 * sigue siendo el fallback conservador y el número que se enseña cuando no hay
 * proveedor configurado.
 */
export const MANUAL_AUDIO_MAX_BYTES = STT_MAX_AUDIO_BYTES;

/**
 * Literales de columnas con CHECK real, validados al cargar el módulo (ronda 3,
 * tester r2 nº 5). CHECKs reconfirmados con `pg_constraint` el 2026-09-09:
 * `calls_mode_check`, `calls_status_check`, `calls_duration_source_check`,
 * `call_recordings_status_check`.
 */
export const MANUAL_CALL_MODE = assertDbEnum('manual', CALL_MODES, 'calls.mode');
export const MANUAL_CALL_STATUS = assertDbEnum('completed', CALL_STATUSES, 'calls.status');
export const MANUAL_DURATION_SOURCE = assertDbEnum('manual', DURATION_SOURCES, 'calls.duration_source');
export const MANUAL_RECORDING_STATUS = assertDbEnum('ready', RECORDING_STATUSES, 'call_recordings.status');

/**
 * Tope de subida REAL para esta organización: lo que acepta el mejor adaptador
 * STT con credenciales. Nunca lanza; si la cadena no se puede resolver devuelve
 * el fallback y el motivo (que la ruta enseña en el mensaje de error).
 */
export async function resolveManualAudioMaxBytes(orgId: number, preferred?: string | null): Promise<{ maxBytes: number; source: 'chain' | 'fallback'; reason?: string }> {
  const limit = await resolveSttSizeLimit(orgId, preferred);
  return { maxBytes: limit.maxBytes, source: limit.source, reason: limit.reason };
}

/** Mensaje único para un audio que supera el tope (el número siempre es el real). */
export function audioTooLargeMessage(bytes: number, maxBytes: number): string {
  return `El audio pesa ${(bytes / 1048576).toFixed(1)} MB y el máximo que puede transcribirse es ${Math.round(maxBytes / 1048576)} MB`;
}

const MIME_BY_KIND: Record<ManualAudioKind, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

/** Detecta el formato por magic bytes (no por extensión ni Content-Type). */
export function detectAudioKind(buf: Buffer): ManualAudioKind | null {
  if (buf.length < 12) return null;
  const h4 = buf.subarray(0, 4).toString('latin1');
  if (h4 === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (h4 === 'OggS') return 'ogg';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'; // frame sync MPEG audio
  return null;
}

/** Duración estimada en segundos (WAV exacta por cabecera; otros por bitrate aproximado). */
export function estimateDurationSeconds(buf: Buffer, kind: ManualAudioKind): number | null {
  if (kind === 'wav' && buf.length >= 44) {
    const byteRate = buf.readUInt32LE(28);
    // Buscar el chunk "data"
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.subarray(off, off + 4).toString('latin1');
      const size = buf.readUInt32LE(off + 4);
      if (id === 'data') return byteRate > 0 ? Math.max(1, Math.round(size / byteRate)) : null;
      off += 8 + size + (size % 2);
    }
    return byteRate > 0 ? Math.max(1, Math.round((buf.length - 44) / byteRate)) : null;
  }
  const kbps = kind === 'mp3' ? 128 : kind === 'm4a' ? 96 : 64;
  return Math.max(1, Math.round((buf.length * 8) / (kbps * 1000)));
}

export interface ManualCallInput {
  audio: Buffer;
  opportunityId?: string | null;
  customerId?: string | null;
  occurredAt?: string | null;
  durationSeconds?: number | null;
  notes?: string | null;
  direction?: 'inbound' | 'outbound';
  /** Origen del audio (`manual_upload` | `meeting_upload` | `activity_actions`). */
  source?: string;
  originalFilename?: string | null;
  /**
   * Tope de tamaño ya resuelto por la ruta (`resolveManualAudioMaxBytes`). Si no
   * viene, el servicio lo resuelve él mismo para la org; nunca se usa un número
   * fijo salvo como fallback sin credenciales.
   */
  maxBytes?: number | null;
}

export interface ManualCallResult {
  callId: string;
  recordingId: string;
  storagePath: string;
  kind: ManualAudioKind;
  durationSeconds: number | null;
  activityId: string | null;
}

export class ManualCallError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ManualCallError';
    this.status = status;
  }
}

/**
 * Crea la llamada manual + grabación lista. NO encola el job (lo hace la ruta).
 */
export async function createManualCallWithAudio(orgId: number, userId: string | null, input: ManualCallInput, supabase?: SupabaseClient): Promise<ManualCallResult> {
  const sb = supabase ?? getServiceClient();
  if (!input.audio || input.audio.length === 0) throw new ManualCallError('Archivo de audio vacío');
  // Tope por cadena STT real de la org (tester r2 nº 7), no por el proveedor más pobre.
  const maxBytes = input.maxBytes && input.maxBytes > 0 ? input.maxBytes : (await resolveManualAudioMaxBytes(orgId)).maxBytes;
  if (input.audio.length > maxBytes) {
    throw new ManualCallError(audioTooLargeMessage(input.audio.length, maxBytes), 413);
  }
  const kind = detectAudioKind(input.audio);
  if (!kind) throw new ManualCallError('Formato de audio no soportado (mp3, wav, m4a, ogg, webm)', 415);
  if (!input.opportunityId && !input.customerId) throw new ManualCallError('opportunity_id o customer_id requerido');

  // Resolver oportunidad/cliente de la org
  let customerId = input.customerId ?? null;
  let opportunityId: string | null = null;
  if (input.opportunityId) {
    const { data: opp } = await sb.from('opportunities').select('id, customer_id').eq('id', input.opportunityId).eq('organization_id', orgId).maybeSingle();
    if (!opp) throw new ManualCallError('Oportunidad no encontrada en la organización', 404);
    opportunityId = (opp as { id: string }).id;
    customerId = customerId ?? ((opp as { customer_id: string | null }).customer_id ?? null);
  }
  let customerPhone: string | null = null;
  if (customerId) {
    const { data: cust } = await sb.from('customers').select('id, phone').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
    if (!cust) throw new ManualCallError('Cliente no encontrado en la organización', 404);
    customerPhone = (cust as { phone: string | null }).phone ?? null;
  }

  const direction = input.direction === 'inbound' ? 'inbound' : 'outbound';
  const durationSeconds = input.durationSeconds && input.durationSeconds > 0 ? Math.round(input.durationSeconds) : estimateDurationSeconds(input.audio, kind);
  const startedAt = input.occurredAt && !Number.isNaN(Date.parse(input.occurredAt)) ? new Date(input.occurredAt).toISOString() : new Date().toISOString();
  const endedAt = durationSeconds ? new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString() : startedAt;
  const agentNumber = 'manual';
  const customerNumber = customerPhone ?? 'manual';

  const { data: call, error: callErr } = await sb
    .from('calls')
    .insert({
      organization_id: orgId,
      provider: 'manual',
      direction,
      mode: MANUAL_CALL_MODE,
      from_number: direction === 'outbound' ? agentNumber : customerNumber,
      to_number: direction === 'outbound' ? customerNumber : agentNumber,
      customer_id: customerId,
      opportunity_id: opportunityId,
      user_id: userId,
      status: MANUAL_CALL_STATUS,
      answered_by: 'human',
      started_at: startedAt,
      answered_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      recording_enabled: true,
      consent_given: true,
      cost_currency: 'USD',
      duration_source: MANUAL_DURATION_SOURCE,
      metadata: { source: input.source ?? 'manual_upload', notes: input.notes ?? null, original_filename: input.originalFilename ?? null, audio_kind: kind, size_bytes: input.audio.length },
    })
    .select('id')
    .single();
  if (callErr || !call) throw new ManualCallError(`No se pudo crear la llamada: ${callErr?.message ?? 'sin datos'}`, 500);
  const callId = (call as { id: string }).id;

  const d = new Date(startedAt);
  const storagePath = `org_${orgId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${callId}.${kind}`;
  const { error: upErr } = await sb.storage.from(RECORDINGS_BUCKET).upload(storagePath, input.audio, { contentType: MIME_BY_KIND[kind], upsert: true });
  if (upErr) {
    await sb.from('calls').delete().eq('id', callId).eq('organization_id', orgId);
    throw new ManualCallError(`No se pudo subir el audio: ${upErr.message}`, 500);
  }

  const { data: rec, error: recErr } = await sb
    .from('call_recordings')
    .insert({
      organization_id: orgId,
      call_id: callId,
      provider_recording_sid: null,
      channels: '1',
      duration_seconds: durationSeconds,
      storage_path: storagePath,
      storage_provider: 'supabase',
      size_bytes: input.audio.length,
      status: MANUAL_RECORDING_STATUS,
    })
    .select('id')
    .single();
  if (recErr || !rec) {
    // Compensación del audio ya subido. No puede tumbar el error principal, pero
    // tampoco desaparecer en un `.catch()` vacío (regla "cero errores tragados"):
    // si el borrado falla queda el path en el log para limpiarlo a mano.
    try {
      const { error: rmErr } = await sb.storage.from(RECORDINGS_BUCKET).remove([storagePath]);
      if (rmErr) console.error(`[manualCallService] quedó huérfano ${RECORDINGS_BUCKET}/${storagePath}: ${rmErr.message}`);
    } catch (rmErr) {
      console.error(`[manualCallService] quedó huérfano ${RECORDINGS_BUCKET}/${storagePath}:`, rmErr instanceof Error ? rmErr.message : rmErr);
    }
    await sb.from('calls').delete().eq('id', callId).eq('organization_id', orgId);
    throw new ManualCallError(`No se pudo registrar la grabación: ${recErr?.message ?? 'sin datos'}`, 500);
  }

  const activity = await upsertCallActivity(orgId, callId, { supabase: sb, enrich: { summary: input.notes ?? null, recordingId: (rec as { id: string }).id } }).catch((e) => {
    console.warn('[manualCallService] activity:', e instanceof Error ? e.message : e);
    return null;
  });

  return { callId, recordingId: (rec as { id: string }).id, storagePath, kind, durationSeconds, activityId: activity?.activityId ?? null };
}
