/**
 * Voice Token Service — Genera tokens de acceso para Twilio Voice SDK.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Usa `getActiveProvider` para obtener las credenciales de Twilio de la
 * organización y genera un AccessToken JWT con un VoiceGrant que permite
 * al navegador iniciar/recibir llamadas vía Twilio Voice SDK.
 */

import twilio from 'twilio';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';

export interface VoiceTokenResult {
  token: string;
  identity: string;
}

/**
 * Genera un AccessToken de Twilio con VoiceGrant para el usuario indicado.
 *
 * Requiere que la organización tenga un provider de voz activo (Twilio)
 * con las credenciales:
 *   - TWILIO_ACCOUNT_SID (accountSid)
 *   - TWILIO_API_KEY (apiKeySid)
 *   - TWILIO_API_SECRET (apiKeySecret)
 *   - TWILIO_TWIML_APP_SID (outgoingApplicationSid)
 *
 * Las credenciales pueden venir de `provider_configs` (DB) o de env vars
 * globales (fallback en `getActiveProvider`).
 */
export async function generateVoiceToken(
  organizationId: number,
  userId: string,
  supabase: SupabaseClient
): Promise<VoiceTokenResult> {
  const provider = await getActiveProvider(organizationId, 'voice', supabase);

  if (!provider.isActive || provider.provider === 'none') {
    throw new Error('No hay un proveedor de voz activo para esta organización');
  }

  const accountSid = provider.credentials.TWILIO_ACCOUNT_SID;
  const apiKeySid = provider.credentials.TWILIO_API_KEY;
  const apiKeySecret = provider.credentials.TWILIO_API_SECRET;
  const twimlAppSid = provider.credentials.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    throw new Error(
      'Faltan credenciales de Twilio (TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET)'
    );
  }

  if (!twimlAppSid) {
    throw new Error('Falta TWILIO_TWIML_APP_SID para el VoiceGrant');
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const grant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  });

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity: userId,
    ttl: 3600,
  });

  token.addGrant(grant);

  return {
    token: token.toJwt(),
    identity: userId,
  };
}
