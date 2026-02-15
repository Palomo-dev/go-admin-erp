/**
 * Twilio Webhook — Procesamiento de webhooks entrantes
 * GO Admin ERP
 *
 * Maneja mensajes entrantes y callbacks de estado.
 */

import Twilio from 'twilio';
import { supabase } from '@/lib/supabase/config';
import type {
  TwilioIncomingMessage,
  TwilioStatusCallback,
  TwilioVoiceWebhook,
} from './twilioTypes';

/**
 * Valida la firma de un webhook de Twilio.
 * Protege contra webhooks falsos.
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
  if (!authToken) {
    console.error('[TwilioWebhook] No se puede validar firma: falta TWILIO_MASTER_AUTH_TOKEN');
    return false;
  }

  return Twilio.validateRequest(authToken, signature, url, params);
}

/**
 * Procesa un mensaje entrante de Twilio (SMS o WhatsApp).
 */
export async function handleIncomingMessage(
  message: TwilioIncomingMessage
): Promise<{ response: string }> {
  const isWhatsApp = message.From.startsWith('whatsapp:');
  const channel = isWhatsApp ? 'whatsapp' : 'sms';
  const from = message.From.replace('whatsapp:', '');

  // Buscar organización por número destino
  const toNumber = message.To.replace('whatsapp:', '');
  const orgId = await findOrgByPhoneNumber(toNumber, channel);

  if (!orgId) {
    console.warn(`[TwilioWebhook] No se encontró organización para número: ${toNumber}`);
    return { response: 'Gracias por tu mensaje. No pudimos identificar la organización.' };
  }

  // Registrar mensaje entrante
  await supabase.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel,
    credits_used: 0,
    twilio_message_sid: message.MessageSid,
    recipient: from,
    status: 'received',
    direction: 'inbound',
    metadata: {
      body: message.Body,
      numMedia: message.NumMedia,
      mediaUrl: message.MediaUrl0 || null,
    },
  });

  return { response: 'Mensaje recibido. Te responderemos pronto.' };
}

/**
 * Procesa un callback de estado de mensaje de Twilio.
 */
export async function handleStatusCallback(
  callback: TwilioStatusCallback
): Promise<void> {
  const { error } = await supabase
    .from('comm_usage_logs')
    .update({ status: callback.MessageStatus })
    .eq('twilio_message_sid', callback.MessageSid);

  if (error) {
    console.error('[TwilioWebhook] Error actualizando estado:', error);
  }

  // Registrar errores si los hay
  if (callback.ErrorCode) {
    console.warn(
      `[TwilioWebhook] Mensaje ${callback.MessageSid} falló: ${callback.ErrorCode} - ${callback.ErrorMessage}`
    );
  }
}

/**
 * Procesa un webhook de llamada entrante.
 * Retorna TwiML para responder a la llamada.
 */
export async function handleIncomingVoice(
  webhook: TwilioVoiceWebhook
): Promise<string> {
  const orgId = await findOrgByPhoneNumber(webhook.To, 'voice');

  if (!orgId) {
    // TwiML: mensaje de que no se encontró la organización
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Lo sentimos, este número no está configurado. Adiós.</Say>
  <Hangup/>
</Response>`;
  }

  // Registrar llamada entrante
  await supabase.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel: 'voice',
    credits_used: 0,
    twilio_message_sid: webhook.CallSid,
    recipient: webhook.From,
    status: 'ringing',
    direction: 'inbound',
    metadata: { callStatus: webhook.CallStatus },
  });

  // TwiML básico — en Fase 6 se conecta con Voice Agent
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Bienvenido. En este momento no hay agentes disponibles. Por favor intente más tarde.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Busca la organización asociada a un número de teléfono.
 */
async function findOrgByPhoneNumber(
  phoneNumber: string,
  channel: string
): Promise<number | null> {
  const column = channel === 'whatsapp' ? 'whatsapp_number' : 'phone_number';

  const { data } = await supabase
    .from('comm_settings')
    .select('organization_id')
    .eq(column, phoneNumber)
    .eq('is_active', true)
    .single();

  if (data) return data.organization_id;

  // Fallback: buscar por número master
  const masterPhone = process.env.TWILIO_PHONE_NUMBER;
  if (phoneNumber === masterPhone) {
    // Si solo hay una org activa, asignarla
    const { data: orgs } = await supabase
      .from('comm_settings')
      .select('organization_id')
      .eq('is_active', true)
      .limit(1)
      .single();

    return orgs?.organization_id || null;
  }

  return null;
}
