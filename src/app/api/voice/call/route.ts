import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import { createCall } from '@/lib/services/crm/callManagementService';
import { getCommSettings } from '@/lib/services/integrations/twilio/twilioSubaccounts';
import { formatE164 } from '@/lib/services/integrations/twilio/twilioConfig';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import Twilio from 'twilio';
import type { CallMode } from '@/lib/crm/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/call — Inicia una llamada saliente REST (legacy / F5-F6).
 *
 * Body: { to, from?, customer_id?, opportunity_id?, recording_enabled?, mode?: 'bridge' | 'ai_agent' }
 *
 * F3: el modo `browser` NO pasa por aquí (400 `USE_SDK`): el softphone hace
 * `device.connect()` y la fila `calls` la crea `/api/voice/twiml/outbound`
 * (elimina la doble marcación C10). `mode` y `status` usan los CHECK reales de
 * BD (C3). El bridge celular real vive en `/api/voice/bridge/initiate`.
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
      mode?: string;
    };

    if (!mode || mode === 'browser' || mode === 'click-to-call') {
      return NextResponse.json(
        { success: false, error: 'Las llamadas desde el navegador se inician con el softphone (device.connect); usa /api/voice/bridge/initiate para el celular', code: 'USE_SDK' },
        { status: 400 }
      );
    }
    const callMode: CallMode = mode === 'voice-agent' || mode === 'ai_agent' ? 'ai_agent' : mode === 'bridge' ? 'bridge' : 'manual';

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

    // 4. Construir URL de TwiML para salida.
    //    `TWILIO_WEBHOOK_BASE_URL` puede traer un path heredado
    //    (`https://app.goadmin.io/api/integrations/twilio`); usar el valor crudo
    //    generaba URLs 404. `getTwilioWebhookOrigin()` normaliza a origin, igual
    //    que el resto de rutas de voz, y falla explícito si no está definido.
    let webhookBase: string;
    try {
      webhookBase = getTwilioWebhookOrigin();
    } catch {
      return NextResponse.json(
        { success: false, error: 'TWILIO_WEBHOOK_BASE_URL no configurado', code: 'WEBHOOK_BASE_URL_MISSING' },
        { status: 500 }
      );
    }
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
        mode: callMode,
        from_number: fromNumber,
        to_number: formattedTo,
        customer_id: customer_id ?? null,
        opportunity_id: opportunity_id ?? null,
        user_id: ctx.userId,
        status: 'dialing',
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
