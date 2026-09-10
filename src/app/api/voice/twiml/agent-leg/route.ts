/**
 * POST /api/voice/twiml/agent-leg — TwiML para la pata del agente.
 *
 * Twilio llama al móvil personal del agente y solicita este TwiML.
 * Reproduce un whisper con info del cliente y pide confirmación (pulsar 1).
 * Tras confirmar, hace <Dial> al cliente con grabación dual.
 *
 * Seguridad (F0, C12/C14): firma verificada SIEMPRE (token por AccountSid);
 * la org se toma de la fila `mobile_call_bridges` y TODAS las lecturas/
 * escrituras posteriores se filtran por `organization_id`.
 * Resuelve el bridge desde el bridgeId pasado como query param.
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
  try {
    await verifyTwilioWebhook(request);
  } catch (err) {
    if (err instanceof WebhookError) {
      console.warn('[Agent Leg TwiML] Rechazado:', err.code);
      return new NextResponse('Forbidden', { status: err.statusCode });
    }
    throw err;
  }

  try {
    // Query params (bridgeId viene en la URL del webhook)
    const bridgeId = new URL(request.url).searchParams.get('bridgeId') || '';

    if (!bridgeId) {
      return new NextResponse(sayHangup('Error: bridge no encontrado.'), { status: 200, headers: XML_HEADERS });
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

    // Actualizar estado del bridge a agent_answered
    await supabase
      .from('mobile_call_bridges')
      .update({
        status: 'agent_answered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeId)
      .eq('organization_id', orgId);

    // Obtener info del cliente para el whisper (scoped por org)
    let customerName = 'el cliente';
    if (bridge.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, company_name')
        .eq('id', bridge.customer_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (customer) {
        const c = customer as { first_name?: string; last_name?: string; company_name?: string };
        customerName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'el cliente';
      }
    }

    const whisperText = bridge.whisper_text ||
      `Conectando con ${customerName}. Esta llamada será grabada. Pulse 1 para continuar.`;

    const webhookBase = getWebhookBaseUrl();

    // Si requiere confirmación, usar Gather; sino Dial directo
    if (bridge.confirm_digit_required) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(`${webhookBase}/api/voice/twiml/customer-leg?bridgeId=${bridgeId}`)}" method="POST" timeout="10">
    <Say voice="Polly.Lupe" language="es-CO">${escapeXml(whisperText)}</Say>
  </Gather>
  <Say voice="Polly.Lupe" language="es-CO">No se recibió confirmación. Colgando.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, { status: 200, headers: XML_HEADERS });
    }

    // Sin confirmación: Dial directo al cliente
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">${escapeXml(whisperText)}</Say>
  <Dial record="record-from-answer-dual"
    recordingStatusCallback="${escapeXml(`${webhookBase}/api/voice/recording`)}"
    statusCallback="${escapeXml(`${webhookBase}/api/voice/bridge/status?bridgeId=${bridgeId}&leg=customer`)}"
    answerOnBridge="true">
    <Number>${escapeXml(String(bridge.target_phone))}</Number>
  </Dial>
</Response>`;
    return new NextResponse(twiml, { status: 200, headers: XML_HEADERS });
  } catch (error) {
    console.error('[Agent Leg TwiML] Error:', error);
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
