/**
 * Twilio Webhook — Procesamiento de webhooks entrantes
 * GO Admin ERP (SOLO servidor)
 *
 * Maneja mensajes entrantes y callbacks de estado.
 *
 * F0:
 * - Usa `getServiceClient()` (antes importaba el cliente browser → RLS sin sesión).
 * - `validateTwilioSignature` queda como wrapper legacy sobre `webhookSignatures`
 *   (token master); las rutas usan `verifyTwilioWebhook` (token por AccountSid).
 * - Sin fallback "primera org activa" al resolver la org por número.
 * - Opt-out: STOP / BAJA / CANCELAR / NO MAS → `contact_consents` (si existe)
 *   + `customers.metadata.do_not_whatsapp|do_not_sms`.
 */

import Twilio from 'twilio';
import { getServiceClient } from '@/lib/supabase/server-service';
import type {
  TwilioIncomingMessage,
  TwilioStatusCallback,
  TwilioVoiceWebhook,
} from './twilioTypes';

/**
 * Valida la firma de un webhook de Twilio con el token MASTER.
 * @deprecated Usar `verifyTwilioWebhook` de `@/lib/security/webhookSignatures`
 * (resuelve el token por AccountSid y reconstruye la URL desde el origin).
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_MASTER_AUTH_TOKEN;
  if (!authToken || !signature) {
    console.error('[TwilioWebhook] No se puede validar firma: falta TWILIO_MASTER_AUTH_TOKEN o firma');
    return false;
  }

  return Twilio.validateRequest(authToken, signature, url, params);
}

// ─── Opt-out ────────────────────────────────────────────────────────────────

/** Palabras de baja aceptadas (normalizadas: sin tildes, mayúsculas, sin puntuación). */
const OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'BAJA',
  'CANCELAR',
  'CANCELA',
  'NO MAS',
  'NOMAS',
  'UNSUBSCRIBE',
  'SALIR',
  'DETENER',
]);

const OPT_IN_KEYWORDS = new Set(['START', 'INICIAR', 'ALTA', 'UNSTOP', 'SI QUIERO', 'ACEPTO']);

function normalizeKeyword(body: string): string {
  return body
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function isOptOutMessage(body: string): boolean {
  return OPT_OUT_KEYWORDS.has(normalizeKeyword(body));
}

export function isOptInMessage(body: string): boolean {
  return OPT_IN_KEYWORDS.has(normalizeKeyword(body));
}

/**
 * Registra el opt-out/opt-in de un contacto por canal:
 * - `contact_consents` (F0; si la tabla aún no existe, se ignora el error)
 * - `customers.metadata.do_not_whatsapp` / `do_not_sms` (enforced por sendEmail/secuencias/campañas)
 */
export async function recordConsentChange(params: {
  orgId: number;
  phone: string;
  channel: 'whatsapp' | 'sms';
  status: 'opted_out' | 'opted_in';
  messageSid?: string;
  body?: string;
}): Promise<void> {
  const supabase = getServiceClient();
  const { orgId, phone, channel, status } = params;
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);

  // Buscar clientes de la org con ese teléfono (comparación laxa por sufijo de 10 dígitos)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone, metadata')
    .eq('organization_id', orgId)
    .ilike('phone', `%${last10}`)
    .limit(20);

  const matched = (customers || []).filter((c: { phone?: string | null }) =>
    (c.phone || '').replace(/\D/g, '').endsWith(last10)
  ) as Array<{ id: string; metadata?: Record<string, unknown> | null }>;

  const flag = channel === 'whatsapp' ? 'do_not_whatsapp' : 'do_not_sms';
  const now = new Date().toISOString();

  for (const c of matched) {
    const metadata = { ...(c.metadata || {}) } as Record<string, unknown>;
    metadata[flag] = status === 'opted_out';
    metadata[`${flag}_changed_at`] = now;
    await supabase.from('customers').update({ metadata }).eq('id', c.id).eq('organization_id', orgId);

    // contact_consents (tabla de F0; try/catch por si la migración no ha corrido)
    try {
      const { error } = await supabase.from('contact_consents').insert({
        organization_id: orgId,
        customer_id: c.id,
        channel,
        status,
        source: 'inbound_keyword',
        evidence: { phone, message_sid: params.messageSid ?? null, body: params.body ?? null },
        changed_at: now,
      });
      if (error) console.warn('[TwilioWebhook] contact_consents no disponible:', error.message);
    } catch (err) {
      console.warn('[TwilioWebhook] contact_consents no disponible:', err instanceof Error ? err.message : err);
    }
  }

  if (matched.length === 0) {
    console.warn(`[TwilioWebhook] Opt-${status === 'opted_out' ? 'out' : 'in'} de ${phone} sin cliente asociado en org ${orgId}`);
  }
}

// ─── Mensajes ────────────────────────────────────────────────────────────────

/**
 * Procesa un mensaje entrante de Twilio (SMS o WhatsApp).
 * Devuelve `response` vacío cuando no hay que contestar.
 */
export async function handleIncomingMessage(
  message: TwilioIncomingMessage
): Promise<{ response: string }> {
  const supabase = getServiceClient();
  const isWhatsApp = message.From.startsWith('whatsapp:');
  const channel: 'whatsapp' | 'sms' = isWhatsApp ? 'whatsapp' : 'sms';
  const from = message.From.replace('whatsapp:', '');

  // Buscar organización por número destino
  const toNumber = message.To.replace('whatsapp:', '');
  const orgId = await findOrgByPhoneNumber(toNumber, channel);

  if (!orgId) {
    console.warn(`[TwilioWebhook] No se encontró organización para número: ${toNumber}`);
    return { response: '' };
  }

  const optOut = isOptOutMessage(message.Body || '');
  const optIn = !optOut && isOptInMessage(message.Body || '');

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
      opt_out: optOut,
      opt_in: optIn,
    },
  });

  if (optOut || optIn) {
    await recordConsentChange({
      orgId,
      phone: from,
      channel,
      status: optOut ? 'opted_out' : 'opted_in',
      messageSid: message.MessageSid,
      body: message.Body,
    }).catch((err) => console.error('[TwilioWebhook] Error registrando consentimiento:', err));

    return {
      response: optOut
        ? 'Has sido dado de baja. No recibirás más mensajes de este número.'
        : 'Suscripción reactivada. Volverás a recibir mensajes.',
    };
  }

  return { response: 'Mensaje recibido. Te responderemos pronto.' };
}

/**
 * Procesa un callback de estado de mensaje de Twilio.
 */
export async function handleStatusCallback(
  callback: TwilioStatusCallback
): Promise<void> {
  const supabase = getServiceClient();
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
  const supabase = getServiceClient();
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
 * Sin fallback: si el número no está en `comm_settings`, devuelve null.
 */
export async function findOrgByPhoneNumber(
  phoneNumber: string,
  channel: string
): Promise<number | null> {
  if (!phoneNumber) return null;
  const supabase = getServiceClient();
  const column = channel === 'whatsapp' ? 'whatsapp_number' : 'phone_number';

  const { data } = await supabase
    .from('comm_settings')
    .select('organization_id')
    .eq(column, phoneNumber)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return (data as { organization_id?: number } | null)?.organization_id ?? null;
}
