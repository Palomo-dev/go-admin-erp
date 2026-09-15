/**
 * Token de sesión para ConversationRelay (ws-server).
 *
 * Lo emite `/api/voice/twiml/ai-agent` (y `integrations/twilio/voice/incoming`)
 * dentro del TwiML: en la query de la URL wss (`?st=...`) y como
 * `<Parameter name="token">`. El ws-server lo verifica en el upgrade y en el
 * mensaje `setup`. HMAC-SHA256 con `WS_SESSION_SECRET`, expiración 10 min.
 *
 * F0-SEC r2 (fail-closed):
 *  - `WS_SESSION_SECRET` tiene que ser un secreto REAL de >= 32 caracteres
 *    (`openssl rand -hex 32`): con el relleno de `.env.example` no se emite ni
 *    se verifica nada. Antes bastaba con que no estuviera vacío.
 *  - La verificación rechaza `orgId` que no sea entero > 0 y tokens cuya
 *    expiración quede más allá de `MAX_TTL_SECONDS` (1 h): un token de un año
 *    emitido por error no es un token de sesión. El tope se aplica al VERIFICAR
 *    (no se recorta al emitir) para que un emisor mal configurado se note en
 *    el handshake y en los tests, no pase en silencio.
 *
 * Sin dependencias de Next.js: importable desde ws-server.ts (Node puro).
 */

import crypto from 'crypto';
import { readRealSecret } from './secrets';

export interface WsSessionClaims {
  orgId: number;
  callId?: string | null;
  agentId?: string | null;
  callSid?: string | null;
  /** epoch seconds */
  exp: number;
}

const DEFAULT_TTL_SECONDS = 10 * 60;
/** Tope de vida de un token: por encima, se verifica como inválido. */
export const MAX_TTL_SECONDS = 60 * 60;
/** Longitud mínima del secreto HMAC (32 hex = 16 bytes de entropía como mínimo). */
export const WS_SESSION_SECRET_MIN_LENGTH = 32;

/** `WS_SESSION_SECRET` real, o `null` si falta, es relleno o es corto (fail-closed). */
export function readWsSessionSecret(): string | null {
  return readRealSecret('WS_SESSION_SECRET', { min: WS_SESSION_SECRET_MIN_LENGTH });
}

function getSecret(): string {
  const s = readWsSessionSecret();
  if (!s) throw new Error('WS_SESSION_SECRET no configurado o de relleno');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

/** Emite un token `payload.signature` con expiración (default 10 min). */
export function issueWsSessionToken(
  claims: Omit<WsSessionClaims, 'exp'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(Buffer.from(JSON.stringify({ ...claims, exp }), 'utf8'));
  return `${payload}.${sign(payload, getSecret())}`;
}

/**
 * Verifica un token. Devuelve los claims o null si es inválido/expirado.
 * Comparación con `timingSafeEqual`.
 */
export function verifyWsSessionToken(token: string | null | undefined): WsSessionClaims | null {
  if (!token) return null;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8')) as WsSessionClaims;
    if (!claims || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) return null;
    if (claims.exp > now + MAX_TTL_SECONDS) return null;
    if (typeof claims.orgId !== 'number' || !Number.isInteger(claims.orgId) || claims.orgId <= 0) return null;
    return claims;
  } catch {
    return null;
  }
}
