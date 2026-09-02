import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromExternal, OrgContextError } from '@/lib/utils/orgContext';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio/twilioWebhook';
import { updateCall } from '@/lib/services/crm/callManagementService';
import type { CallStatus, AnsweredBy, DurationSource } from '@/lib/services/crm/callManagementService';

/**
 * POST /api/voice/status — Status callback de Twilio.
 *
 * Este endpoint NO usa getServerOrgContext (no hay sesión de usuario).
 * Twilio lo invoca en cada cambio de estado de la llamada.
 *
 * Actualiza el registro de la llamada en la tabla `calls` con el nuevo
 * estado, duración, timestamps, etc.
 *
 * Content-Type: application/xml (respuesta vacía, Twilio no espera TwiML aquí)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    const callSid = params.CallSid || '';
    const callStatus = params.CallStatus || '';
    const callDuration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;
    const ringDuration = params.RingDuration ? parseInt(params.RingDuration, 10) : null;
    const answeredBy = params.AnsweredBy || null;

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[Voice Status] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, requestUrl, params)) {
      console.warn('[Voice Status] Firma de Twilio inválida');
      return new Response('Forbidden', { status: 403 });
    }

    if (!callSid) {
      console.warn('[Voice Status] No se recibió CallSid');
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
        console.warn('[Voice Status] No se resolvió org para CallSid:', callSid);
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
      console.warn('[Voice Status] Llamada no encontrada en BD para CallSid:', callSid);
      return new NextResponse('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    const callUuid = callRow.id as string;

    // Mapear estado de Twilio a nuestro enum
    const mappedStatus = mapTwilioStatus(callStatus);
    const mappedAnsweredBy = mapAnsweredBy(answeredBy);

    // Construir datos de actualización
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: mappedStatus,
      updated_at: now,
    };

    if (callDuration !== null && !isNaN(callDuration)) {
      updateData.duration_seconds = callDuration;
      updateData.duration_source = 'provider' as DurationSource;
    }

    if (ringDuration !== null && !isNaN(ringDuration)) {
      updateData.ring_seconds = ringDuration;
    }

    if (mappedAnsweredBy) {
      updateData.answered_by = mappedAnsweredBy;
    }

    // Timestamps según el estado
    if (callStatus === 'in-progress') {
      updateData.answered_at = now;
    }
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'busy' || callStatus === 'canceled') {
      updateData.ended_at = now;
    }

    // Actualizar la llamada
    await updateCall(callUuid, orgId, updateData as Parameters<typeof updateCall>[2], supabaseClient).catch(
      (err) => {
        console.error('[Voice Status] Error actualizando llamada:', err);
      }
    );

    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Status] error:', message);
    return new NextResponse('<Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}

/**
 * Mapea el estado de Twilio a nuestro enum CallStatus.
 */
function mapTwilioStatus(status: string): CallStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'ringing':
      return 'ringing';
    case 'in-progress':
      return 'in-progress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'no-answer':
      return 'no-answer';
    case 'busy':
      return 'busy';
    case 'canceled':
      return 'canceled';
    default:
      return 'failed';
  }
}

/**
 * Mapea el AnsweredBy de Twilio a nuestro enum.
 */
function mapAnsweredBy(value: string | null): AnsweredBy | null {
  if (!value) return null;
  if (value === 'human') return 'human';
  if (value === 'machine' || value === 'machine_start' || value === 'machine_end') return 'machine';
  return 'unknown';
}
