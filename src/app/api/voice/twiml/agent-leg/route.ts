/**
 * POST /api/voice/twiml/agent-leg — TwiML para la pata del agente.
 *
 * Twilio llama al móvil personal del agente y solicita este TwiML.
 * Reproduce un whisper con info del cliente y pide confirmación (pulsar 1).
 * Tras confirmar, hace <Dial> al cliente con grabación dual.
 *
 * Sin autenticación de sesión — valida firma de Twilio en producción.
 * Resuelve la org desde el bridgeId pasado como query param.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateTwilioSignature } from '@/lib/services/integrations/twilio';
import { getWebhookBaseUrl } from '@/lib/services/integrations/twilio/twilioConfig';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales Supabase (service_role)');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Query params (bridgeId viene en la URL del webhook)
    const bridgeId = request.nextUrl.searchParams.get('bridgeId') || '';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${getWebhookBaseUrl()}/api/voice/twiml/agent-leg?bridgeId=${bridgeId}`;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[Agent Leg TwiML] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, url, params)) {
      console.warn('[Agent Leg TwiML] Firma de Twilio inválida');
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!bridgeId) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Error: bridge no encontrado.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const supabase = getServiceSupabase();

    // Obtener el bridge
    const { data: bridge } = await supabase
      .from('mobile_call_bridges')
      .select('*')
      .eq('id', bridgeId)
      .single();

    if (!bridge) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Bridge no encontrado.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Actualizar estado del bridge a agent_answered
    await supabase
      .from('mobile_call_bridges')
      .update({
        status: 'agent_answered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeId);

    // Obtener info del cliente para el whisper
    let customerName = 'el cliente';
    if (bridge.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, company_name')
        .eq('id', bridge.customer_id)
        .single();
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
  <Gather numDigits="1" action="${webhookBase}/api/voice/twiml/customer-leg?bridgeId=${bridgeId}" method="POST" timeout="10">
    <Say voice="Polly.Lupe" language="es-CO">${escapeXml(whisperText)}</Say>
  </Gather>
  <Say voice="Polly.Lupe" language="es-CO">No se recibió confirmación. Colgando.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Sin confirmación: Dial directo al cliente
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">${escapeXml(whisperText)}</Say>
  <Dial record="record-from-answer-dual"
    recordingStatusCallback="${webhookBase}/api/voice/recording"
    statusCallback="${webhookBase}/api/voice/bridge/status?bridgeId=${bridgeId}&leg=customer"
    answerOnBridge="true">
    <Number>${bridge.target_phone}</Number>
  </Dial>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[Agent Leg TwiML] Error:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Ocurrió un error. Por favor intente más tarde.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
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
