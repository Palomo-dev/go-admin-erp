/**
 * API Route: Webhook — Llamada entrante de Twilio
 * POST /api/integrations/twilio/voice/incoming
 *
 * Responde con TwiML que conecta la llamada con ConversationRelay.
 * Twilio hace STT/TTS automáticamente; nuestro WS server solo maneja texto.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validateTwilioSignature,
} from '@/lib/services/integrations/twilio';
import type { TwilioVoiceWebhook } from '@/lib/services/integrations/twilio';

/** Cliente con service_role para bypasear RLS en webhooks */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan credenciales Supabase (service_role)');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // Validar firma en producción
    if (process.env.NODE_ENV === 'production') {
      const signature = request.headers.get('x-twilio-signature') || '';
      const url = `${process.env.TWILIO_WEBHOOK_BASE_URL}/voice/incoming`;
      const isValid = validateTwilioSignature(signature, url, params);
      if (!isValid) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const webhook: TwilioVoiceWebhook = {
      CallSid: params.CallSid || '',
      AccountSid: params.AccountSid || '',
      From: params.From || '',
      To: params.To || '',
      CallStatus: params.CallStatus || '',
      Direction: params.Direction || '',
    };

    // Determinar orgId por número destino
    const orgId = await findOrgByPhoneNumber(webhook.To);

    // Registrar llamada entrante
    const supabase = getServiceSupabase();
    await supabase.from('comm_usage_logs').insert({
      organization_id: orgId || 0,
      channel: 'voice',
      credits_used: 0,
      twilio_message_sid: webhook.CallSid,
      recipient: webhook.From,
      status: 'ringing',
      direction: 'inbound',
      metadata: { callStatus: webhook.CallStatus },
    });

    if (!orgId) {
      const noOrgTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Lo sentimos, este número no está configurado. Adiós.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(noOrgTwiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Generar TwiML con ConversationRelay
    const wsHost = process.env.WS_SERVER_URL || 'wss://localhost:8080';
    const twiml = buildConversationRelayTwiml(wsHost, orgId);

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[Webhook] Error procesando llamada entrante:', error);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Ocurrió un error. Por favor intente más tarde.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

/**
 * Genera TwiML que conecta la llamada con ConversationRelay.
 * Twilio maneja STT+TTS; nuestro WS server solo recibe/envía texto.
 */
function buildConversationRelayTwiml(wsHost: string, orgId: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsHost}/conversation-relay"
      language="es-MX"
      welcomeGreeting="Hola, un momento mientras lo conecto con nuestro asistente virtual."
    >
      <Parameter name="orgId" value="${orgId}" />
    </ConversationRelay>
  </Connect>
</Response>`;
}

/** Busca organización por número telefónico */
async function findOrgByPhoneNumber(phoneNumber: string): Promise<number | null> {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from('comm_settings')
    .select('organization_id')
    .eq('phone_number', phoneNumber)
    .eq('is_active', true)
    .single();

  if (data) return data.organization_id;

  const masterPhone = process.env.TWILIO_PHONE_NUMBER;
  if (phoneNumber === masterPhone) {
    const { data: orgs } = await sb
      .from('comm_settings')
      .select('organization_id')
      .eq('is_active', true)
      .limit(1)
      .single();
    return orgs?.organization_id || null;
  }

  return null;
}
