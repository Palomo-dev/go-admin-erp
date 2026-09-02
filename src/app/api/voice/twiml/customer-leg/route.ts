/**
 * POST /api/voice/twiml/customer-leg — TwiML para la pata del cliente.
 *
 * Recibe el dígito de confirmación del Gather del agent-leg.
 * Si el agente pulsó 1, hace <Dial> al cliente con grabación dual.
 * Si no pulsó 1 o timeout, cuelga.
 *
 * Sin autenticación de sesión — valida firma de Twilio en producción.
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

    const bridgeId = request.nextUrl.searchParams.get('bridgeId') || '';
    const digits = params.Digits || '';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${getWebhookBaseUrl()}/api/voice/twiml/customer-leg?bridgeId=${bridgeId}`;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[Customer Leg TwiML] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, url, params)) {
      console.warn('[Customer Leg TwiML] Firma de Twilio inválida');
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!bridgeId) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
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

    // Si el agente no pulsó 1, rechazar
    if (digits !== '1') {
      // Actualizar estado a agent_rejected
      await supabase
        .from('mobile_call_bridges')
        .update({
          status: 'agent_rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bridgeId);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Llamada cancelada. Adiós.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // El agente confirmó — actualizar estado y hacer Dial al cliente
    await supabase
      .from('mobile_call_bridges')
      .update({
        status: 'customer_dialing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bridgeId);

    const webhookBase = getWebhookBaseUrl();

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Conectando. Esta llamada será grabada para fines de calidad y servicio.</Say>
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
    console.error('[Customer Leg TwiML] Error:', error);
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
