import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromExternal, OrgContextError } from '@/lib/utils/orgContext';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio/twilioWebhook';
import {
  getCallRecordings,
  createCallRecording,
  updateCallRecording,
} from '@/lib/services/crm/callManagementService';
import type { RecordingStatus } from '@/lib/services/crm/callManagementService';
import { downloadAndUploadRecording } from '@/lib/services/crm/recordingStorageService';

/**
 * POST /api/voice/recording — Recording status callback de Twilio.
 *
 * Este endpoint NO usa getServerOrgContext (no hay sesión de usuario).
 * Twilio lo invoca cuando cambia el estado de una grabación.
 *
 * Crea o actualiza el registro en `call_recordings` con el estado,
 * duración, URL y tamaño del archivo de grabación.
 *
 * Content-Type: application/xml (respuesta vacía)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    const recordingSid = params.RecordingSid || '';
    const callSid = params.CallSid || '';
    const recordingStatus = params.RecordingStatus || '';
    const recordingDuration = params.RecordingDuration ? parseInt(params.RecordingDuration, 10) : null;
    const recordingUrl = params.RecordingUrl || '';
    const recordingChannels = params.RecordingChannels ? parseInt(params.RecordingChannels, 10) : null;

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[Voice Recording] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, requestUrl, params)) {
      console.warn('[Voice Recording] Firma de Twilio inválida');
      return new Response('Forbidden', { status: 403 });
    }

    if (!callSid) {
      console.warn('[Voice Recording] No se recibió CallSid');
      return new NextResponse('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // Resolver organización desde el CallSid
    let orgId: number;
    let supabaseClient;
    try {
      const resolved = await resolveOrgFromExternal(callSid, 'call_sid');
      orgId = resolved.organizationId;
      supabaseClient = resolved.serviceClient;
    } catch (err) {
      if (err instanceof OrgContextError) {
        console.warn('[Voice Recording] No se resolvió org para CallSid:', callSid);
        return new NextResponse('<Response></Response>', {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      throw err;
    }

    // Buscar el UUID de la llamada por provider_call_sid
    const { data: callRow, error: callError } = await supabaseClient
      .from('calls')
      .select('id')
      .eq('organization_id', orgId)
      .eq('provider_call_sid', callSid)
      .maybeSingle();

    if (callError || !callRow) {
      console.warn('[Voice Recording] Llamada no encontrada en BD para CallSid:', callSid);
      return new NextResponse('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    const callUuid = callRow.id as string;
    const mappedStatus = mapRecordingStatus(recordingStatus);

    // Buscar si ya existe un registro de grabación para este recordingSid
    const existingRecordings = await getCallRecordings(callUuid, orgId, supabaseClient);
    const existing = existingRecordings.find(
      (r) => r.provider_recording_sid === recordingSid
    );

    let recordingId: string | null = null;

    if (existing) {
      // Actualizar registro existente
      const updated = await updateCallRecording(
        existing.id,
        orgId,
        {
          provider_recording_sid: recordingSid || null,
          channels: recordingChannels ?? null,
          duration_seconds: recordingDuration ?? null,
          storage_path: recordingUrl || null,
          storage_provider: 'twilio',
          status: mappedStatus,
        },
        supabaseClient
      ).catch((err) => {
        console.error('[Voice Recording] Error actualizando grabación:', err);
        return null;
      });
      recordingId = updated?.id ?? existing.id;
    } else {
      // Crear nuevo registro de grabación
      const created = await createCallRecording(
        orgId,
        {
          call_id: callUuid,
          provider_recording_sid: recordingSid || null,
          channels: recordingChannels ?? null,
          duration_seconds: recordingDuration ?? null,
          storage_path: recordingUrl || null,
          storage_provider: 'twilio',
          status: mappedStatus,
        },
        supabaseClient
      ).catch((err) => {
        console.error('[Voice Recording] Error creando grabación:', err);
        return null;
      });
      recordingId = created?.id ?? null;
    }

    // Si la grabación está completa y tenemos URL + ID, descargar de Twilio
    // y subir a Supabase Storage (async, no bloquea el callback de Twilio).
    // Si falla, storage_path queda con la URL de Twilio (fallback).
    if (
      recordingId &&
      mappedStatus === 'completed' &&
      recordingUrl &&
      recordingSid
    ) {
      // Fire-and-forget: Twilio espera respuesta rápida (<5s), la descarga
      // puede tardar más. Usamos .catch() para evitar unhandled rejection.
      downloadAndUploadRecording(
        recordingId,
        orgId,
        recordingUrl,
        recordingSid,
        supabaseClient
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.warn(`[Voice Recording] Fallback: no se pudo subir grabación ${recordingId} a Supabase:`, msg);
      });
    }

    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Recording] error:', message);
    return new NextResponse('<Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}

/**
 * Mapea el estado de grabación de Twilio a nuestro enum.
 */
function mapRecordingStatus(status: string): RecordingStatus {
  switch (status) {
    case 'in-progress':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'deleted':
      return 'deleted';
    default:
      return 'processing';
  }
}
