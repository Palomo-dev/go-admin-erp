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
 *  - `jti` anti-replay (sub-parte D): cada token lleva un identificador
 *    aleatorio y el ws-server lo CONSUME una sola vez en el mensaje `setup`
 *    (`consumeWsSessionJti`, memoria con expiración = `exp` del token). Un
 *    handshake capturado (`?st=` + firma de Twilio) ya no sirve para abrir una
 *    segunda sesión dentro de los 10 min. La verificación (`verifyWsSessionToken`)
 *    sigue siendo pura y sin estado: se llama en el upgrade Y en el setup con
 *    el mismo token, así que el consumo va en un paso aparte. Un token sin
 *    `jti` (emitido antes de este cambio) verifica pero NO se puede consumir:
 *    hay que desplegar el emisor (Next) antes o a la vez que el ws-server.
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
  /** Identificador único del token (anti-replay); lo consume el ws-server en `setup`. */
  jti?: string;
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
  claims: Omit<WsSessionClaims, 'exp' | 'jti'>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const jti = b64url(crypto.randomBytes(12));
  const payload = b64url(Buffer.from(JSON.stringify({ ...claims, exp, jti }), 'utf8'));
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
    if (claims.jti !== undefined && (typeof claims.jti !== 'string' || claims.jti.length === 0 || claims.jti.length > 64)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ─── Anti-replay: consumo único del jti ─────────────────────────────────────

/** jti → exp (epoch s). Memoria por proceso: el ws-server es una instancia. */
const consumedJtis = new Map<string, number>();
const JTI_SWEEP_THRESHOLD = 1000;

function sweepJtis(now: number): void {
  if (consumedJtis.size < JTI_SWEEP_THRESHOLD) return;
  for (const [jti, exp] of consumedJtis) {
    if (exp < now) consumedJtis.delete(jti);
  }
}

/**
 * Marca el `jti` de unos claims ya verificados como usado. Devuelve `false`
 * (rechazar) si ya se había consumido, si el token no trae `jti` o si ya
 * expiró; `true` la primera vez. Se recuerda hasta `exp`, que es cuando el
 * token deja de verificar de todos modos.
 */
export function consumeWsSessionJti(claims: Pick<WsSessionClaims, 'jti' | 'exp'>, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  const jti = claims.jti;
  if (typeof jti !== 'string' || jti.length === 0) return false;
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp < nowSeconds) return false;
  sweepJtis(nowSeconds);
  const seen = consumedJtis.get(jti);
  if (seen !== undefined && seen >= nowSeconds) return false;
  consumedJtis.set(jti, claims.exp);
  return true;
}

/** Solo para tests. */
export function _resetWsSessionJtis(): void {
  consumedJtis.clear();
}
