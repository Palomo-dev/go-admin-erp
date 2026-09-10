/**
 * Voice Token Service — identity y AccessToken para Twilio Voice JS SDK.
 * GO Admin ERP — FASE-03 (Telefonía CRM)
 *
 * - Identity `u_{uuid sin guiones}_o_{orgId}` ([A-Za-z0-9_] obligatorio en
 *   Twilio; codifica la org para resolver el tenant en el TwiML App, §4.5.3).
 * - Credenciales vía `voiceContextService.getVoiceCredentials` (registry
 *   `provider_configs` → env `TWILIO_API_KEY/SECRET/TWIML_APP_SID`; subcuenta
 *   si `comm_settings.twilio_subaccount_sid`).
 * - Si faltan API Key/Secret/TwiML App SID lanza `VoiceNotConfiguredError`
 *   (el endpoint responde 409 `VOICE_NOT_CONFIGURED`).
 */

import twilio from 'twilio';
import { getVoiceCredentials, VoiceNotConfiguredError, type VoiceCredentials } from './voiceContextService';

export { VoiceNotConfiguredError };

/**
 * Qué credenciales de Twilio faltan para registrar el softphone del navegador.
 * Devuelve NOMBRES de variables, nunca valores. Vacío = todo listo.
 */
export function missingVoiceCredentials(creds: Pick<VoiceCredentials, 'accountSid' | 'apiKey' | 'apiSecret' | 'twimlAppSid'>): string[] {
  const missing: string[] = [];
  if (!creds.accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!creds.apiKey) missing.push('TWILIO_API_KEY');
  if (!creds.apiSecret) missing.push('TWILIO_API_SECRET');
  if (!creds.twimlAppSid) missing.push('TWILIO_TWIML_APP_SID');
  return missing;
}

export const VOICE_TOKEN_TTL = 3600;

export interface VoiceTokenResult {
  token: string;
  identity: string;
  ttl: number;
  orgId: number;
}

const IDENTITY_RE = /^u_([0-9a-f]{32})_o_(\d{1,9})$/i;

/** `u_{uuid sin guiones}_o_{orgId}` — solo [A-Za-z0-9_]. */
export function buildVoiceIdentity(userId: string, orgId: number): string {
  const hex = String(userId).replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('buildVoiceIdentity: userId no es un UUID');
  if (!Number.isInteger(orgId) || orgId <= 0) throw new Error('buildVoiceIdentity: orgId inválido');
  return `u_${hex}_o_${orgId}`;
}

/**
 * Parsea una identity (acepta prefijo `client:`). Devuelve null si no cumple
 * el formato exacto (32 hex + org numérica).
 */
export function parseVoiceIdentity(identity: string | null | undefined): { userId: string; orgId: number } | null {
  if (!identity) return null;
  const raw = String(identity).replace(/^client:/, '');
  const m = IDENTITY_RE.exec(raw);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return {
    userId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
    orgId: Number(m[2]),
  };
}

/** True si el `From` de un webhook viene de un cliente WebRTC (`client:…`). */
export function isClientFrom(from: string | null | undefined): boolean {
  return typeof from === 'string' && from.startsWith('client:');
}

/**
 * Genera el AccessToken (ttl 3600) con VoiceGrant
 * `{ outgoingApplicationSid, incomingAllow: true }`.
 */
export async function generateVoiceToken(organizationId: number, userId: string): Promise<VoiceTokenResult> {
  const creds = await getVoiceCredentials(organizationId);
  const missing = missingVoiceCredentials(creds);
  if (missing.length > 0) {
    // `source === 'org'` → la organización trajo sus propias llaves y le
    // faltan: su administrador puede arreglarlo. Cualquier otro caso es la
    // cuenta maestra de la plataforma, y eso NO es asunto del cliente.
    const scope = creds.source === 'org' ? 'organization' : 'platform';
    throw new VoiceNotConfiguredError(
      `Faltan credenciales de Twilio para llamar desde el navegador: ${missing.join(', ')}`,
      missing,
      scope
    );
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const identity = buildVoiceIdentity(userId, organizationId);

  const token = new AccessToken(creds.accountSid, creds.apiKey, creds.apiSecret, {
    identity,
    ttl: VOICE_TOKEN_TTL,
  });
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: creds.twimlAppSid, incomingAllow: true }));

  return { token: token.toJwt(), identity, ttl: VOICE_TOKEN_TTL, orgId: organizationId };
}
