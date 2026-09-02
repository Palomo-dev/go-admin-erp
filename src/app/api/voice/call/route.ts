import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import { createCall } from '@/lib/services/crm/callManagementService';
import { getCommSettings } from '@/lib/services/integrations/twilio/twilioSubaccounts';
import { formatE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import Twilio from 'twilio';

/**
 * POST /api/voice/call — Inicia una llamada saliente server-side.
 *
 * Body: {
 *   to: string,          // número destino
 *   from?: string,       // número origen (default: comm_settings.voice_caller_id)
 *   customer_id?: string,
 *   opportunity_id?: string,
 *   recording_enabled?: boolean,
 *   mode?: 'manual' | 'click-to-call' | 'voice-agent',
 * }
 *
 * Usa el cliente de Twilio de la organización (subcuenta o master) para
 * iniciar la llamada. Registra el call record en la tabla `calls`.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const body = await request.json();
    const { to, from, customer_id, opportunity_id, recording_enabled, mode } = body as {
      to?: string;
      from?: string;
      customer_id?: string;
      opportunity_id?: string;
      recording_enabled?: boolean;
      mode?: 'manual' | 'click-to-call' | 'voice-agent';
    };

    if (!to) {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro "to" (número destino)' },
        { status: 400 }
      );
    }

    // 1. Obtener provider de voz
    const provider = await getActiveProvider(ctx.organizationId, 'voice', ctx.supabase);
    if (!provider.isActive || provider.provider === 'none') {
      return NextResponse.json(
        { success: false, error: 'No hay proveedor de voz activo' },
        { status: 400 }
      );
    }

    const accountSid = provider.credentials.TWILIO_ACCOUNT_SID;
    const authToken = provider.credentials.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: 'Faltan credenciales de Twilio' },
        { status: 500 }
      );
    }

    // 2. Determinar número de origen
    const settings = await getCommSettings(ctx.organizationId);
    const fromNumber = from || settings?.phone_number || provider.credentials.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, error: 'No hay número de origen configurado' },
        { status: 400 }
      );
    }

    // 3. Crear cliente Twilio
    const client = Twilio(accountSid, authToken);

    // 4. Construir URL de TwiML para salida
    const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || '';
    const twimlUrl = `${webhookBase}/api/voice/twiml/outbound`;
    const statusCallback = `${webhookBase}/api/voice/status`;
    const recordingCallback = `${webhookBase}/api/voice/recording`;

    const formattedTo = formatE164(to);
    const recordingEnabled = recording_enabled ?? settings?.voice_recording_enabled ?? false;

    // 5. Iniciar llamada
    const callInstance = await client.calls.create({
      to: formattedTo,
      from: fromNumber,
      url: twimlUrl,
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      ...(recordingEnabled ? { record: true, recordingStatusCallback: recordingCallback } : {}),
    });

    // 6. Registrar en BD
    const callRecord = await createCall(
      ctx.organizationId,
      {
        provider: 'twilio',
        provider_call_sid: callInstance.sid,
        direction: 'outbound',
        mode: mode ?? 'click-to-call',
        from_number: fromNumber,
        to_number: formattedTo,
        customer_id: customer_id ?? null,
        opportunity_id: opportunity_id ?? null,
        user_id: ctx.userId,
        status: 'queued',
        recording_enabled: recordingEnabled,
        metadata: {},
      },
      ctx.supabase
    );

    return NextResponse.json(
      {
        success: true,
        callSid: callInstance.sid,
        call: callRecord,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Call] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
