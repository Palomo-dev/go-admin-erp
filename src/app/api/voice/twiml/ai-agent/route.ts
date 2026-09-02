/**
 * POST /api/voice/twiml/ai-agent — TwiML que conecta a ConversationRelay.
 *
 * Twilio llama al cliente y solicita este TwiML cuando el cliente contesta.
 * El TwiML conecta la llamada a ConversationRelay (WS server) que maneja
 * STT/TTS + LLM con el system_prompt del agente y las tools configuradas.
 *
 * Sin autenticación de sesión — valida firma de Twilio en producción.
 * Query params: agentId, callId
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

    const agentId = request.nextUrl.searchParams.get('agentId') || '';
    const callId = request.nextUrl.searchParams.get('callId') || '';

    // Validar firma de Twilio
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${getWebhookBaseUrl()}/api/voice/twiml/ai-agent?agentId=${agentId}&callId=${callId}`;
    const twilioAuthToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.warn('[AI Agent TwiML] TWILIO_MASTER_AUTH_TOKEN no configurado — validación de firma omitida');
    } else if (!validateTwilioSignature(signature, url, params)) {
      console.warn('[AI Agent TwiML] Firma de Twilio inválida');
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!agentId) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">Error: agente no especificado.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const supabase = getServiceSupabase();

    // Obtener el agente de voz
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id, name, language, is_active, first_message, organization_id')
      .eq('id', agentId)
      .single();

    if (!agent || !(agent as { is_active: boolean }).is_active) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-CO">El agente no está disponible en este momento.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(twiml, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Actualizar voice_agent_calls a in_progress
    if (callId) {
      await supabase
        .from('voice_agent_calls')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId);
    }

    // Generar TwiML con ConversationRelay
    const wsHost = process.env.WS_SERVER_URL || 'wss://localhost:8080';
    const language = (agent as { language: string }).language || 'es-CO';
    const agentOrgId = (agent as { organization_id: number }).organization_id || '';

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsHost}/conversation-relay"
      language="${language}"
    >
      <Parameter name="agentId" value="${agentId}" />
      <Parameter name="callId" value="${callId}" />
      <Parameter name="orgId" value="${agentOrgId}" />
    </ConversationRelay>
  </Connect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[AI Agent TwiML] Error:', error);
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
