import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromExternal, OrgContextError } from '@/lib/utils/orgContext';
import { getCommSettings } from '@/lib/services/integrations/twilio/twilioSubaccounts';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio/twilioWebhook';
import { createCall } from '@/lib/services/crm/callManagementService';

/**
 * POST /api/voice/twiml/inbound — TwiML de entrada para llamadas entrantes.
 *
 * Este endpoint NO usa getServerOrgContext (no hay sesión de usuario).
 * Es invocado por Twilio cuando una llamada entra a un número configurado.
 *
 * Resuelve la organización desde el número destino (To) en `phone_numbers`
 * y retorna TwiML para manejar la llamada entrante.
 *
 * Content-Type: application/xml
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[TwiML Inbound] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, requestUrl, params)) {
      console.warn('[TwiML Inbound] Firma de Twilio inválida');
      return new Response('Forbidden', { status: 403 });
    }

    // Resolver organización desde el número destino (To)
    let orgId: number;
    let supabaseClient;
    try {
      const resolved = await resolveOrgFromExternal(to, 'phone');
      orgId = resolved.organizationId;
      supabaseClient = resolved.serviceClient;
    } catch (err) {
      if (err instanceof OrgContextError) {
        console.warn('[TwiML Inbound] No se resolvió org para número:', to);
        const twiml = buildUnavailableTwiml();
        return new NextResponse(twiml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      throw err;
    }

    // Obtener comm_settings
    const settings = await getCommSettings(orgId);
    const recordingEnabled = settings?.voice_recording_enabled ?? false;
    const ringTimeout = settings?.voice_ring_timeout_seconds ?? 30;

    // Registrar la llamada entrante en BD
    await createCall(
      orgId,
      {
        provider: 'twilio',
        provider_call_sid: callSid,
        direction: 'inbound',
        mode: 'manual',
        from_number: from,
        to_number: to,
        status: 'ringing',
        recording_enabled: recordingEnabled,
        started_at: new Date().toISOString(),
        metadata: { callStatus: params.CallStatus },
      },
      supabaseClient
    ).catch((err) => {
      console.error('[TwiML Inbound] Error registrando llamada:', err);
    });

    const twiml = buildInboundTwiml({
      from,
      recordingEnabled,
      ringTimeout,
    });

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[TwiML Inbound] error:', message);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Ha ocurrido un error. Por favor intente más tarde.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(errorTwiml, {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}

/**
 * Construye el TwiML de entrada.
 * Por ahora hace un <Dial> al número del agente o un mensaje de bienvenida.
 * En fases futuras se conectará con Voice Agent (Media Stream).
 */
function buildInboundTwiml(params: {
  from: string;
  recordingEnabled: boolean;
  ringTimeout: number;
}): string {
  const { recordingEnabled, ringTimeout } = params;

  const recordAttr = recordingEnabled ? ' record="record-from-answer-dual"' : '';
  const timeoutAttr = ` timeout="${ringTimeout}"`;

  // TwiML básico — en Fase 6 se conectará con Voice Agent
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Bienvenido. Conectando con un agente.</Say>
  <Dial${recordAttr}${timeoutAttr}>
    <Client>incoming</Client>
  </Dial>
</Response>`;
}

/**
 * TwiML cuando no se encuentra la organización para el número.
 */
function buildUnavailableTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Lo sentimos, este número no está configurado. Adiós.</Say>
  <Hangup/>
</Response>`;
}
