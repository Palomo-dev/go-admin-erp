/**
 * Twilio Configuration — Cliente master y helpers
 * GO Admin ERP
 */

import Twilio from 'twilio';
import { TwilioConfigError } from './twilioTypes';

let masterClient: Twilio.Twilio | null = null;

/**
 * Obtiene el cliente Twilio master (singleton).
 * Usa las credenciales de la cuenta maestra de GO Admin.
 */
export function getMasterClient(): Twilio.Twilio {
  if (!masterClient) {
    const accountSid = process.env.TWILIO_MASTER_ACCOUNT_SID;
    const authToken = process.env.TWILIO_MASTER_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new TwilioConfigError(
        'Faltan variables de entorno: TWILIO_MASTER_ACCOUNT_SID y/o TWILIO_MASTER_AUTH_TOKEN'
      );
    }

    masterClient = Twilio(accountSid, authToken);
  }

  return masterClient;
}

/**
 * Crea un cliente Twilio para una subcuenta específica.
 */
export function getSubaccountClient(
  subaccountSid: string,
  subaccountAuthToken: string
): Twilio.Twilio {
  if (!subaccountSid || !subaccountAuthToken) {
    throw new TwilioConfigError('Faltan credenciales de subcuenta Twilio');
  }

  return Twilio(subaccountSid, subaccountAuthToken);
}

/**
 * Obtiene el número de teléfono maestro de GO Admin.
 */
export function getMasterPhoneNumber(): string {
  const phone = process.env.TWILIO_PHONE_NUMBER;
  if (!phone) {
    throw new TwilioConfigError('Falta variable de entorno: TWILIO_PHONE_NUMBER');
  }
  return phone;
}

/**
 * Obtiene el número de WhatsApp maestro de GO Admin.
 */
export function getMasterWhatsAppNumber(): string {
  const phone = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!phone) {
    throw new TwilioConfigError('Falta variable de entorno: TWILIO_WHATSAPP_NUMBER');
  }
  return `whatsapp:${phone}`;
}

/**
 * Obtiene el Verify Service SID.
 */
export function getVerifyServiceSid(): string {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid) {
    throw new TwilioConfigError('Falta variable de entorno: TWILIO_VERIFY_SERVICE_SID');
  }
  return sid;
}

/**
 * Obtiene la URL base de webhooks.
 */
export function getWebhookBaseUrl(): string {
  return process.env.TWILIO_WEBHOOK_BASE_URL || 'https://app.goadmin.io/api/integrations/twilio';
}

/**
 * Formatea un número al formato E.164 si no lo está.
 */
export function formatE164(phone: string, defaultCountryCode = '+57'): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  return `${defaultCountryCode}${cleaned}`;
}

/**
 * Formatea número para WhatsApp (prefijo whatsapp:).
 */
export function formatWhatsApp(phone: string): string {
  const e164 = formatE164(phone);
  return `whatsapp:${e164}`;
}
