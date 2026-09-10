/**
 * Tokens HMAC de los callbacks de voz (FASE-05 §4.5.4, FASE-03 N-4). SOLO servidor.
 *
 * La firma de Twilio ya protege el transporte, pero cubre la URL entera: si una
 * URL con `bridgeId` se filtra (logs del proveedor, un proxy), sigue siendo
 * reutilizable contra ESE bridge. El token liga la URL a un recurso concreto y
 * a un secreto que solo conoce el servidor.
 *
 * Dos usos sobre el MISMO secreto y el MISMO primitivo:
 *  - `signBridgeToken` / `verifyBridgeToken`: bridge de F5, sin caducidad (la
 *    vida del token es la de la llamada). Formato heredado: 32 hex.
 *  - `signConsentToken` / `verifyConsentToken`: acta de grabación de F3. Ligado
 *    al `CallSid` y CON caducidad, porque acredita un hecho puntual ("el aviso
 *    ya sonó") y no debe poder reutilizarse más tarde. Formato `{exp}.{32 hex}`.
 *
 * Fail-closed: sin `VOICE_CALLBACK_SECRET` no se firma NI se verifica nada
 * (`BridgeTokenNotConfiguredError` en la firma, `false` en la verificación).
 * El dueño debe definir la variable (ver `.env.example`).
 */

import { createHmac, timingSafeEqual } from 'crypto';

export class BridgeTokenNotConfiguredError extends Error {
  code = 'VOICE_CALLBACK_SECRET_MISSING' as const;
  statusCode = 503;
  constructor() {
    super('VOICE_CALLBACK_SECRET no está configurado: no se pueden firmar los callbacks del bridge');
    this.name = 'BridgeTokenNotConfiguredError';
  }
}

function secret(): string | null {
  const s = process.env.VOICE_CALLBACK_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** ¿Se puede firmar hoy? (para responder 503 antes de tocar al proveedor). */
export function isBridgeSigningConfigured(): boolean {
  return secret() !== null;
}

/** HMAC-SHA256 truncado a 32 hex del payload. Lanza si falta el secreto. */
function hmacHex32(payload: string): string {
  const s = secret();
  if (!s) throw new BridgeTokenNotConfiguredError();
  return createHmac('sha256', s).update(payload).digest('hex').slice(0, 32);
}

/** Comparación en tiempo constante de dos cadenas (nunca lanza). */
function safeEqual(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** HMAC-SHA256 truncado a 32 hex del `bridge:{id}`. Lanza si falta el secreto. */
export function signBridgeToken(bridgeId: string): string {
  return hmacHex32(`bridge:${bridgeId}`);
}

/** Comparación en tiempo constante; false si falta el secreto o el token. */
export function verifyBridgeToken(bridgeId: string, token: string | null | undefined): boolean {
  if (!secret() || !bridgeId || !token) return false;
  let expected: string;
  try {
    expected = signBridgeToken(bridgeId);
  } catch {
    return false;
  }
  return safeEqual(expected, String(token));
}

// ─── Acta de grabación (N-4, Ley 1581 de 2012) ───────────────────────────────

/** Ventana de validez del token de consentimiento (s). El redirect de Twilio
 *  llega en segundos; 10 min cubre de sobra sus reintentos sin dejar un token
 *  reutilizable el resto del día. */
export const CONSENT_TOKEN_TTL_SECONDS = 600;

function consentPayload(callSid: string, exp: number): string {
  return `consent:${callSid}:${exp}`;
}

/**
 * Token que acredita que el aviso de grabación SÍ se reprodujo en esta llamada.
 *
 * Lo acuña el servidor en la PRIMERA pasada (la que emite el `<Say>` del aviso)
 * y lo mete en la URL del `<Redirect>`. Twilio solo pide ese redirect cuando el
 * `<Say>` ha terminado de sonar, así que recibirlo de vuelta con un token que
 * este servidor firmó es la prueba de que el aviso se emitió.
 *
 * Sin él bastaba `?announced=1` en la query —que controla quien firma la
 * petición— para fabricar un acta de un aviso que nunca sonó.
 */
export function signConsentToken(callSid: string, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + CONSENT_TOKEN_TTL_SECONDS;
  return `${exp}.${hmacHex32(consentPayload(callSid, exp))}`;
}

/** `true` solo si el token lo acuñó este servidor para ESTE CallSid y no ha caducado. */
export function verifyConsentToken(callSid: string, token: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!secret() || !callSid || !token) return false;
  const raw = String(token);
  const dot = raw.indexOf('.');
  if (dot <= 0) return false;
  const expPart = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!/^\d{1,15}$/.test(expPart)) return false;
  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return false;
  let expected: string;
  try {
    expected = hmacHex32(consentPayload(callSid, exp));
  } catch {
    return false;
  }
  return safeEqual(expected, mac);
}
