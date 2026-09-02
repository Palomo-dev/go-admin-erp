/**
 * Recording Storage Service — Descarga, subida y gestión de grabaciones de llamadas.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Bucket Supabase Storage: `crm-call-recordings` (privado)
 * Path: `org_{organization_id}/{yyyy}/{mm}/{callSid}.mp3`
 *
 * Tablas: call_recordings
 * Todas las funciones reciben `supabase` y `organizationId` para garantizar
 * aislamiento por organización (multi-tenant).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCallRecording } from './callManagementService';

// ─── Constantes ──────────────────────────────────────────────────────────────

const BUCKET_NAME = 'crm-call-recordings';
const DEFAULT_SIGNED_URL_EXPIRY = 3600; // 1 hora en segundos

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

// ─── Funciones internas ──────────────────────────────────────────────────────

/**
 * Construye el path de almacenamiento en Supabase Storage.
 * Formato: org_{organization_id}/{yyyy}/{mm}/{recordingSid}.mp3
 */
function buildStoragePath(
  organizationId: number,
  recordingSid: string
): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeSid = recordingSid.replace(/[^a-zA-Z0-9_-]/g, '');
  return `org_${organizationId}/${yyyy}/${mm}/${safeSid}.mp3`;
}

// ─── Funciones públicas ──────────────────────────────────────────────────────

/**
 * Descarga el audio de una grabación desde Twilio.
 *
 * Twilio sirve las grabaciones con HTTP Basic Auth (AccountSid:AuthToken).
 * Si no hay credenciales configuradas, intenta descarga sin auth (fallback).
 *
 * @param recordingUrl URL completa de la grabación en Twilio
 * @returns Buffer del audio + metadata (content-type, tamaño)
 */
export async function downloadFromTwilio(recordingUrl: string): Promise<DownloadResult> {
  if (!recordingUrl) {
    throw new Error('downloadFromTwilio: recordingUrl es requerida');
  }

  const accountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
  const authToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

  const headers: Record<string, string> = {};

  // Twilio requiere HTTP Basic Auth para descargar grabaciones
  if (accountSid && authToken) {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(recordingUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `downloadFromTwilio: error descargando grabación (${response.status} ${response.statusText})`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const sizeBytes = buffer.length;

  return { buffer, contentType, sizeBytes };
}

/**
 * Sube un buffer de audio al bucket `crm-call-recordings` en Supabase Storage.
 *
 * @param audioBuffer Buffer del audio a subir
 * @param organizationId ID de la organización (para el path)
 * @param recordingSid SID de la grabación de Twilio (para nombrar el archivo)
 * @param supabase Cliente Supabase (service role para bypass de RLS en storage)
 * @returns Path del archivo en Storage + tamaño en bytes
 */
export async function uploadToSupabase(
  audioBuffer: Buffer,
  organizationId: number,
  recordingSid: string,
  supabase: SupabaseClient
): Promise<UploadResult> {
  const storagePath = buildStoragePath(organizationId, recordingSid);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `uploadToSupabase: error subiendo a Storage (${uploadError.message})`
    );
  }

  return {
    path: storagePath,
    sizeBytes: audioBuffer.length,
  };
}

/**
 * Genera una URL firmada para reproducir una grabación desde Supabase Storage.
 *
 * Busca el registro en `call_recordings`, obtiene el `storage_path` y genera
 * una URL firmada con expiración de 1 hora por defecto.
 *
 * @param recordingId UUID del registro en call_recordings
 * @param organizationId ID de la organización
 * @param supabase Cliente Supabase
 * @param expiresIn Segundos de expiración (default: 3600 = 1h)
 * @returns URL firmada o null si no se encuentra la grabación
 */
export async function getRecordingUrl(
  recordingId: string,
  organizationId: number,
  supabase: SupabaseClient,
  expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
): Promise<string | null> {
  // Buscar el registro de grabación
  const { data: recording, error } = await supabase
    .from('call_recordings')
    .select('storage_path, storage_provider')
    .eq('id', recordingId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !recording) {
    console.error('[recordingStorageService.getRecordingUrl] error:', error?.message || 'grabación no encontrada');
    return null;
  }

  // Si el storage_provider es 'twilio' (fallback), retornar el storage_path directamente
  if (recording.storage_provider === 'twilio') {
    return recording.storage_path;
  }

  // Generar URL firmada desde Supabase Storage
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(recording.storage_path, expiresIn);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error('[recordingStorageService.getRecordingUrl] error generando URL firmada:', signedUrlError?.message);
    return null;
  }

  return signedUrlData.signedUrl;
}

/**
 * Elimina una grabación de Supabase Storage y marca el registro en BD como deleted.
 *
 * @param recordingId UUID del registro en call_recordings
 * @param organizationId ID de la organización
 * @param supabase Cliente Supabase
 */
export async function deleteRecording(
  recordingId: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  // 1. Obtener el storage_path antes de eliminar
  const { data: recording, error: fetchError } = await supabase
    .from('call_recordings')
    .select('storage_path, storage_provider')
    .eq('id', recordingId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (fetchError || !recording) {
    console.error('[recordingStorageService.deleteRecording] error:', fetchError?.message || 'grabación no encontrada');
    throw new Error('No se encontró la grabación a eliminar');
  }

  // 2. Eliminar del bucket si está en Supabase Storage
  if (recording.storage_provider !== 'twilio' && recording.storage_path) {
    const { error: removeError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([recording.storage_path]);

    if (removeError) {
      console.error('[recordingStorageService.deleteRecording] error eliminando de Storage:', removeError.message);
      // No lanzamos error aquí: el archivo puede no existir, pero igual marcamos en BD
    }
  }

  // 3. Marcar el registro como deleted en BD
  await updateCallRecording(
    recordingId,
    organizationId,
    { status: 'deleted' },
    supabase
  ).catch((err) => {
    console.error('[recordingStorageService.deleteRecording] error actualizando BD:', err);
    throw err;
  });
}

/**
 * Descarga el audio de Twilio, lo sube a Supabase Storage y actualiza
 * el registro en call_recordings con el nuevo storage_path.
 *
 * Si falla la descarga o subida, deja storage_path como la URL de Twilio (fallback).
 *
 * @param recordingId UUID del registro en call_recordings
 * @param organizationId ID de la organización
 * @param twilioRecordingUrl URL original de Twilio
 * @param recordingSid SID de la grabación de Twilio
 * @param supabase Cliente Supabase (service role)
 * @returns true si se subió a Supabase, false si quedó con fallback de Twilio
 */
export async function downloadAndUploadRecording(
  recordingId: string,
  organizationId: number,
  twilioRecordingUrl: string,
  recordingSid: string,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    // 1. Descargar audio desde Twilio
    const { buffer, sizeBytes } = await downloadFromTwilio(twilioRecordingUrl);

    // 2. Subir a Supabase Storage
    const { path: storagePath } = await uploadToSupabase(
      buffer,
      organizationId,
      recordingSid || recordingId,
      supabase
    );

    // 3. Actualizar call_recordings con el path de Supabase
    await updateCallRecording(
      recordingId,
      organizationId,
      {
        storage_path: storagePath,
        storage_provider: 'supabase',
        size_bytes: sizeBytes,
        status: 'ready',
      },
      supabase
    );

    console.log(`[recordingStorageService] Grabación ${recordingId} subida a Supabase: ${storagePath}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.warn(`[recordingStorageService] Fallback a Twilio URL para grabación ${recordingId}: ${message}`);
    return false;
  }
}
