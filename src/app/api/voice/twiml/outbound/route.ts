import { NextRequest, NextResponse } from 'next/server';
import { resolveOrgFromExternal, OrgContextError } from '@/lib/utils/orgContext';
import { getCommSettings } from '@/lib/services/integrations/twilio/twilioSubaccounts';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio/twilioWebhook';

/**
 * POST /api/voice/twiml/outbound — TwiML de salida con grabación y consent.
 *
 * Este endpoint NO usa getServerOrgContext (no hay sesión de usuario).
 * Es invocado por Twilio cuando una llamada saliente es iniciada.
 *
 * Resuelve la organización desde el CallSid en la tabla `calls` y retorna
 * TwiML con:
 *   - Mensaje de consentimiento (si voice_consent_message está configurado)
 *   - <Dial> al número destino (o <Connect> a Voice Agent en fases futuras)
 *   - Grabación habilitada según comm_settings.voice_recording_enabled
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
    const to = params.To || '';
    const from = params.From || '';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[TwiML Outbound] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, requestUrl, params)) {
      console.warn('[TwiML Outbound] Firma de Twilio inválida');
      return new Response('Forbidden', { status: 403 });
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
        // No se encontró la llamada en BD — puede ser una llamada nueva
        // que aún no se registró. Retornamos TwiML básico.
        console.warn('[TwiML Outbound] No se resolvió org para CallSid:', callSid);
        const twiml = buildBasicOutboundTwiml(to);
        return new NextResponse(twiml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      throw err;
    }

    // Obtener comm_settings de la organización
    const settings = await getCommSettings(orgId);
    const recordingEnabled = settings?.voice_recording_enabled ?? false;
    const consentMessage = settings?.voice_consent_message ?? '';
    const ringTimeout = settings?.voice_ring_timeout_seconds ?? 30;

    const twiml = buildOutboundTwiml({
      to,
      from,
      recordingEnabled,
      consentMessage,
      ringTimeout,
      callSid,
    });

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[TwiML Outbound] error:', message);
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
 * Construye el TwiML de salida con consent, grabación y dial.
 */
function buildOutboundTwiml(params: {
  to: string;
  from: string;
  recordingEnabled: boolean;
  consentMessage: string;
  ringTimeout: number;
  callSid: string;
}): string {
  const { to, recordingEnabled, consentMessage, ringTimeout } = params;

  const parts: string[] = [];

  // Mensaje de consentimiento (si está configurado)
  if (consentMessage) {
    parts.push(`  <Say language="es-MX">${escapeXml(consentMessage)}</Say>`);
  }

  // Dial con grabación opcional
  const recordAttr = recordingEnabled ? ' record="record-from-answer-dual"' : '';
  const timeoutAttr = ` timeout="${ringTimeout}"`;
  parts.push(`  <Dial${recordAttr}${timeoutAttr}>`);
  parts.push(`    <Number>${escapeXml(to)}</Number>`);
  parts.push(`  </Dial>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${parts.join('\n')}
</Response>`;
}

/**
 * TwiML básico cuando no se puede resolver la organización.
 */
function buildBasicOutboundTwiml(to: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30">
    <Number>${escapeXml(to)}</Number>
  </Dial>
</Response>`;
}

/**
 * Escapa caracteres especiales XML.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
