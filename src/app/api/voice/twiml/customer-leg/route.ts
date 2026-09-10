/**
 * POST /api/voice/twiml/customer-leg — TwiML para la pata del cliente.
 *
 * Recibe el dígito de confirmación del Gather del agent-leg.
 * Si el agente pulsó 1, hace <Dial> al cliente con grabación dual.
 * Si no pulsó 1 o timeout, cuelga.
 *
 * Seguridad (F0, C12/C14): firma verificada SIEMPRE (token por AccountSid);
 * la org se toma de la fila `mobile_call_bridges` y las escrituras se
 * filtran por `organization_id`.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { getWebhookBaseUrl } from '@/lib/services/integrations/twilio/twilioConfig';

export const runtime = 'nodejs';

const XML_HEADERS = { 'Content-Type': 'text/xml' };

function sayHangup(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    ({ params } = await verifyTwilioWebhook(request));
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Customer Leg TwiML] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    const bridgeId = new URL(request.url).searchParams.get('bridgeId') || '';
    const digits = params.Digits || '';

    if (!bridgeId) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Hangup/>\n</Response>`,
        { status: 200, headers: XML_HEADERS }
      );
    }

    const supabase = getServiceClient();

    // Obtener el bridge (la org sale de esta fila)
    const { data: bridge } = await supabase
      .from('mobile_call_bridges')
      .select('*')
      .eq('id', bridgeId)
      .maybeSingle();

    if (!bridge) {
      return new NextResponse(sayHangup('Bridge no encontrado.'), { status: 200, headers: XML_HEADERS });
    }

    const orgId = bridge.organization_id as number;

    // Si el agente no pulsó 1, rechazar
    if (digits !== '1') {
      await supabase
        .from('mobile_call_bridges')
        .update({
          status: 'agent_rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bridgeId)
        .eq('organization_id', orgId);

      return new NextResponse(sayHangup('Llamada cancelada. Adiós.'), { status: 200, headers: XML_HEADERS });
    }

    // El agente confirmó — actualizar estado y hacer Dial al cliente
    await supabase
      .from('mobile_call_bridges')
      .update({
        status: 'customer_dialing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeId)
      .eq('organization_id', orgId);

    const webhookBase = getWebhookBaseUrl();

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Conectando. Esta llamada será grabada para fines de calidad y servicio.</Say>
  <Dial record="record-from-answer-dual"
    recordingStatusCallback="${escapeXml(`${webhookBase}/api/voice/recording`)}"
    statusCallback="${escapeXml(`${webhookBase}/api/voice/bridge/status?bridgeId=${bridgeId}&leg=customer`)}"
    answerOnBridge="true">
    <Number>${escapeXml(String(bridge.target_phone))}</Number>
  </Dial>
</Response>`;

    return new NextResponse(twiml, { status: 200, headers: XML_HEADERS });
  } catch (error) {
    console.error('[Customer Leg TwiML] Error:', error);
    return new NextResponse(sayHangup('Ocurrió un error. Por favor intente más tarde.'), { status: 200, headers: XML_HEADERS });
  }
}

/** Escapa caracteres especiales XML */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
