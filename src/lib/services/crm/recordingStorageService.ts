/**
 * Recording Storage Service — descarga, subida y gestión de grabaciones.
 * GO Admin ERP — FASE-03 (Telefonía CRM)
 *
 * Bucket Supabase Storage: `crm-call-recordings` (privado, F0).
 * Path: `org_{organization_id}/{yyyy}/{mm}/{callId}.{ext}` (por callId, no por
 * RecordingSid; cierra C8: el bucket ya no se deduce del path).
 *
 * - Descarga de Twilio con Basic Auth API Key:Secret de la (sub)cuenta
 *   (`?RequestedChannels=2` para dual-channel).
 * - Nunca escribe `updated_at` (trigger de BD, C5); status válido `ready` (C5).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCallRecording } from './callManagementService';
import { basicAuthHeader, getVoiceCredentials, type VoiceCredentials } from './voiceContextService';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const RECORDINGS_BUCKET = 'crm-call-recordings';
const BUCKET_NAME = RECORDINGS_BUCKET;
export const DEFAULT_SIGNED_URL_EXPIRY = 600; // 10 min (§4.1)
const DOWNLOAD_TIMEOUT_MS = 20_000;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  path: string;
  sizeBytes: number;
}

export interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

export type DownloadCreds = Pick<VoiceCredentials, 'apiKey' | 'apiSecret' | 'accountSid' | 'authToken'>;

// ─── Helpers puros ───────────────────────────────────────────────────────────

/** `org_{orgId}/{yyyy}/{mm}/{callId}.{ext}` (fecha de `at`, UTC). */
export function buildStoragePath(organizationId: number, callId: string, ext: 'mp3' | 'wav' = 'mp3', at: Date = new Date()): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  const safeId = String(callId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `org_${organizationId}/${yyyy}/${mm}/${safeId}.${ext}`;
}

/** URL de descarga: `RecordingUrl` sin extensión + `.mp3` (+ `?RequestedChannels=2` si dual). */
export function buildTwilioDownloadUrl(recordingUrl: string, opts: { dual: boolean; ext?: 'mp3' | 'wav' }): string {
  const base = recordingUrl.replace(/\.(mp3|wav|json)$/i, '');
  const ext = opts.ext ?? 'mp3';
  return opts.dual ? `${base}.${ext}?RequestedChannels=2` : `${base}.${ext}`;
}

export function computeRetentionUntil(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + Math.max(1, Math.round(days || 90)));
  return d.toISOString().slice(0, 10);
}

// ─── Funciones públicas ──────────────────────────────────────────────────────

/**
 * Descarga el audio de una grabación desde Twilio (Basic Auth obligatorio).
 * Sin `creds` usa las master de env (compatibilidad con transcriptionService).
 * Lanza `TwilioDownloadError` con `status` HTTP para que el job decida reintento.
 */
export class TwilioDownloadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'TwilioDownloadError';
    this.status = status;
  }
}

export async function downloadFromTwilio(
  recordingUrl: string,
  creds?: DownloadCreds | null,
  opts?: { timeoutMs?: number }
): Promise<DownloadResult> {
  if (!recordingUrl) throw new Error('downloadFromTwilio: recordingUrl es requerida');

  const c: DownloadCreds = creds ?? {
    apiKey: process.env.TWILIO_API_KEY || '',
    apiSecret: process.env.TWILIO_API_SECRET || '',
    accountSid: process.env.TWILIO_MASTER_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_MASTER_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '',
  };
  const auth = basicAuthHeader(c);
  if (!auth) throw new TwilioDownloadError(401, 'downloadFromTwilio: sin credenciales Basic Auth (API Key o Auth Token)');

  const response = await fetch(recordingUrl, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(opts?.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new TwilioDownloadError(response.status, `downloadFromTwilio: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: response.headers.get('content-type') || 'audio/mpeg', sizeBytes: buffer.length };
}

/** Sube un buffer al bucket privado en `storagePath` (upsert). */
export async function uploadToSupabase(
  audioBuffer: Buffer,
  storagePath: string,
  supabase: SupabaseClient,
  contentType = 'audio/mpeg'
): Promise<UploadResult> {
  const { error } = await supabase.storage.from(BUCKET_NAME).upload(storagePath, audioBuffer, { contentType, upsert: true });
  if (error) throw new Error(`uploadToSupabase: error subiendo a Storage (${error.message})`);
  return { path: storagePath, sizeBytes: audioBuffer.length };
}

/** URL firmada (600 s) de una grabación `ready` de la org. */
export async function getRecordingUrl(
  recordingId: string,
  organizationId: number,
  supabase: SupabaseClient,
  expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
): Promise<string | null> {
  const { data: recording, error } = await supabase
    .from('call_recordings')
    .select('storage_path, storage_provider, status')
    .eq('id', recordingId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !recording) return null;
  const rec = recording as { storage_path: string; storage_provider: string; status: string };
  if (rec.status !== 'ready' || rec.storage_provider !== 'supabase') return null;

  const { data, error: signErr } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(rec.storage_path, expiresIn);
  if (signErr || !data?.signedUrl) {
    console.error('[recordingStorageService.getRecordingUrl] URL firmada:', signErr?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Borra la grabación de Storage (y de Twilio si se pasa `twilio`) y marca `deleted`.
 *
 * Ronda 2 (defecto M4): `deleted` es una afirmación de cumplimiento (§11), así
 * que SOLO se escribe cuando todos los borrados aplicables han tenido éxito. Un
 * 404 del proveedor cuenta como "ya no existe". Si algo falla se lanza: el job
 * `recording_cleanup` lo cuenta en `failed`, la fila sigue `ready` y el lote del
 * día siguiente lo reintenta.
 */
export async function deleteRecording(
  recordingId: string,
  organizationId: number,
  supabase: SupabaseClient,
  twilio?: { recordings: (sid: string) => { remove: () => Promise<unknown> } } | null
): Promise<void> {
  const { data: recording, error } = await supabase
    .from('call_recordings')
    .select('storage_path, storage_provider, provider_recording_sid, status')
    .eq('id', recordingId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !recording) throw new Error('No se encontró la grabación a eliminar');
  const rec = recording as { storage_path: string; storage_provider: string; provider_recording_sid: string | null; status: string };

  const failures: string[] = [];
  if (rec.storage_provider === 'supabase' && rec.storage_path) {
    const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove([rec.storage_path]);
    if (removeError) {
      console.warn('[recordingStorageService.deleteRecording] Storage:', removeError.message);
      failures.push(`storage: ${removeError.message}`);
    }
  }
  if (twilio && rec.provider_recording_sid) {
    try {
      await twilio.recordings(rec.provider_recording_sid).remove();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/404|not found/i.test(msg)) {
        console.warn('[recordingStorageService.deleteRecording] Twilio:', msg);
        failures.push(`twilio: ${msg}`);
      }
    }
  }
  if (failures.length) {
    throw new Error(`No se pudo eliminar la grabación ${recordingId} (${failures.join(' · ')}); la fila sigue en 'ready' para reintentar`);
  }
  await updateCallRecording(recordingId, organizationId, { status: 'deleted' }, supabase);
}

/**
 * Descarga de Twilio (API Key de la (sub)cuenta) → Storage → `ready`.
 * Devuelve el resultado; lanza si falla (el job decide el reintento).
 */
export async function storeRecording(
  params: {
    recordingId: string;
    organizationId: number;
    callId: string;
    recordingUrl: string;
    channels: string | number | null;
    retentionDays: number;
    startedAt?: string | null;
  },
  supabase: SupabaseClient,
  creds?: DownloadCreds | null
): Promise<{ storagePath: string; sizeBytes: number; retentionUntil: string }> {
  const dual = String(params.channels ?? '1') === '2';
  const c = creds ?? (await getVoiceCredentials(params.organizationId));
  let downloaded: DownloadResult;
  try {
    downloaded = await downloadFromTwilio(buildTwilioDownloadUrl(params.recordingUrl, { dual }), c);
  } catch (err) {
    // 400 = la grabación no es dual; reintentar en mono
    if (dual && err instanceof TwilioDownloadError && err.status === 400) {
      downloaded = await downloadFromTwilio(buildTwilioDownloadUrl(params.recordingUrl, { dual: false }), c);
    } else {
      throw err;
    }
  }

  const at = params.startedAt ? new Date(params.startedAt) : new Date();
  const storagePath = buildStoragePath(params.organizationId, params.callId, 'mp3', Number.isNaN(at.getTime()) ? new Date() : at);
  const { sizeBytes } = await uploadToSupabase(downloaded.buffer, storagePath, supabase, 'audio/mpeg');
  const retentionUntil = computeRetentionUntil(params.retentionDays);

  await updateCallRecording(
    params.recordingId,
    params.organizationId,
    { storage_path: storagePath, storage_provider: 'supabase', size_bytes: sizeBytes, status: 'ready', retention_until: retentionUntil },
    supabase
  );
  return { storagePath, sizeBytes, retentionUntil };
}
