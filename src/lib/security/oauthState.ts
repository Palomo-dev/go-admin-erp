/**
 * `state` firmado para los flujos OAuth de Meta Marketing, TikTok Marketing y
 * Google Ads.
 *
 * Antes de este módulo el `state` era `base64(JSON)` sin firma
 * (`{ organization_id, connection_id, user_id, ts }`) y los callbacks lo
 * decodificaban y actuaban con el cliente service-role: cualquiera podía armar
 * un `state` con la organización (y la conexión) de otro tenant, autorizar SU
 * cuenta de Meta/TikTok y hacer que el callback creara una conexión en la otra
 * organización o sobrescribiera las credenciales de una conexión ajena.
 * Además `authorize` sacaba el usuario de un JWT de la cookie SIN verificar la
 * firma (`decodeJwt`) y la organización del body.
 *
 * Formato: `base64url(JSON(claims)).base64url(HMAC-SHA256(payload, secreto))`.
 *  - Secreto: `OAUTH_STATE_SECRET`, secreto REAL de >= 32 caracteres
 *    (`readRealSecret`: ausente, de relleno o corto → no se emite ni se
 *    verifica nada; fail-closed).
 *  - Claims: proveedor (`p`), organización (`org`) y usuario (`uid`) de la
 *    SESIÓN que inició el flujo, conexión opcional (`cid`, ya validada contra
 *    esa organización), nonce aleatorio (`n`), `iat` y `exp` (10 min).
 *  - El nonce viaja además en una cookie httpOnly (`oauthNonceCookieName`)
 *    que pone la ruta `authorize`: liga el `state` al navegador que inició.
 *
 * Verificación en el callback (`verifyOAuthState`):
 *  1. firma (comparación en tiempo constante), proveedor, expiración (y tope
 *     de vida `OAUTH_STATE_MAX_TTL_SECONDS`) y forma de los claims;
 *  2. si llega la cookie del nonce, tiene que coincidir con el del `state`;
 *  3. si hay sesión legible en el callback, tiene que ser el mismo usuario.
 *  Sin cookie y sin sesión basta con 1 (el proveedor puede redirigir a otro
 *  dominio/navegador); el callback además vuelve a comprobar en la base que
 *  el usuario siga siendo admin activo de la organización.
 *  `consumeOAuthStateNonce` impide reutilizar un `state` dentro de su vida
 *  (memoria por proceso: defensa en profundidad, no sustituye a `exp`).
 *
 * Módulo hoja (solo `crypto` y `secrets`): importable desde tests sin arrastrar
 * `webhookSignatures` → `svix`. Por eso compara con `crypto.timingSafeEqual`
 * directamente, igual que `wsSessionToken.ts`.
 */

import crypto from 'crypto';
import { readRealSecret } from './secrets';

export const OAUTH_PROVIDERS = ['meta', 'tiktok', 'google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export interface OAuthStateClaims {
  v: 1;
  /** Proveedor para el que se emitió: un `state` de Meta no vale en TikTok. */
  p: OAuthProvider;
  /** Organización de la sesión que inició el flujo. */
  org: number;
  /** Usuario de la sesión que inició el flujo. */
  uid: string;
  /** Conexión existente (ya validada contra `org`) o null. */
  cid: string | null;
  /** Nonce aleatorio; también va en la cookie httpOnly del navegador que inició. */
  n: string;
  /** epoch s */
  iat: number;
  /** epoch s */
  exp: number;
}

export type OAuthStateFailure =
  | 'missing'
  | 'secret_not_configured'
  | 'malformed'
  | 'bad_signature'
  | 'wrong_provider'
  | 'expired'
  | 'invalid_claims'
  | 'nonce_mismatch'
  | 'session_mismatch';

export type OAuthStateVerification =
  | { ok: true; claims: OAuthStateClaims }
  | { ok: false; reason: OAuthStateFailure };

export const OAUTH_STATE_SECRET_ENV = 'OAUTH_STATE_SECRET';
export const OAUTH_STATE_SECRET_MIN_LENGTH = 32;
/** Vida del `state`: lo que tarda una persona en autorizar en el proveedor. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
/** Tope al VERIFICAR: un `state` con más vida que esto es inválido aunque esté firmado. */
export const OAUTH_STATE_MAX_TTL_SECONDS = 15 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** `OAUTH_STATE_SECRET` real, o `null` si falta, es relleno o es corto (fail-closed). */
export function readOAuthStateSecret(): string | null {
  return readRealSecret(OAUTH_STATE_SECRET_ENV, { min: OAUTH_STATE_SECRET_MIN_LENGTH });
}

/** Se lanza al EMITIR sin secreto real: la ruta `authorize` responde 503. */
export class OAuthStateSecretMissingError extends Error {
  readonly code = 'oauth_state_secret_not_configured';
  constructor() {
    super('OAUTH_STATE_SECRET no configurado o de relleno');
    this.name = 'OAuthStateSecretMissingError';
  }
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

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Nombre de la cookie httpOnly que guarda el nonce del flujo de `provider`. */
export function oauthNonceCookieName(provider: OAuthProvider): string {
  return `goadmin_oauth_${provider}_nonce`;
}

/** Opciones de la cookie del nonce: httpOnly, Lax (viaja en la redirección GET del proveedor), vida = la del `state`. */
export function oauthNonceCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  };
}

/**
 * Emite un `state` firmado. `organizationId` y `userId` tienen que salir de la
 * sesión (`getServerOrgContext`), y `connectionId`, si viene, ya validado
 * contra esa organización. Lanza `OAuthStateSecretMissingError` sin secreto real.
 */
export function issueOAuthState(
  input: { provider: OAuthProvider; organizationId: number; userId: string; connectionId?: string | null },
  now: number = nowSeconds()
): { state: string; nonce: string; expiresAt: number } {
  const secret = readOAuthStateSecret();
  if (!secret) throw new OAuthStateSecretMissingError();
  const nonce = b64url(crypto.randomBytes(18));
  const claims: OAuthStateClaims = {
    v: 1,
    p: input.provider,
    org: input.organizationId,
    uid: input.userId,
    cid: input.connectionId ?? null,
    n: nonce,
    iat: now,
    exp: now + OAUTH_STATE_TTL_SECONDS,
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  return { state: `${payload}.${sign(payload, secret)}`, nonce, expiresAt: claims.exp };
}

function validClaims(c: unknown): c is OAuthStateClaims {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  return (
    x.v === 1 &&
    (OAUTH_PROVIDERS as readonly unknown[]).includes(x.p) &&
    typeof x.org === 'number' && Number.isInteger(x.org) && x.org > 0 &&
    typeof x.uid === 'string' && UUID_RE.test(x.uid) &&
    (x.cid === null || (typeof x.cid === 'string' && UUID_RE.test(x.cid))) &&
    typeof x.n === 'string' && NONCE_RE.test(x.n) &&
    typeof x.iat === 'number' && Number.isFinite(x.iat) &&
    typeof x.exp === 'number' && Number.isFinite(x.exp)
  );
}

/**
 * Verifica un `state` recibido en el callback de `provider`. Ver la cabecera
 * del módulo para el orden de las comprobaciones. Nunca lanza.
 */
export function verifyOAuthState(
  state: string | null | undefined,
  provider: OAuthProvider,
  opts: { nonceCookie?: string | null; sessionUserId?: string | null; now?: number } = {}
): OAuthStateVerification {
  if (!state) return { ok: false, reason: 'missing' };
  const secret = readOAuthStateSecret();
  if (!secret) return { ok: false, reason: 'secret_not_configured' };
  if (state.length > 2048) return { ok: false, reason: 'malformed' };

  const idx = state.lastIndexOf('.');
  if (idx <= 0 || idx === state.length - 1) return { ok: false, reason: 'malformed' };
  const payload = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  if (!constantTimeEqual(sig, sign(payload, secret))) return { ok: false, reason: 'bad_signature' };

  let claims: unknown;
  try {
    claims = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!validClaims(claims)) return { ok: false, reason: 'invalid_claims' };
  if (claims.p !== provider) return { ok: false, reason: 'wrong_provider' };

  const now = opts.now ?? nowSeconds();
  if (claims.exp < now) return { ok: false, reason: 'expired' };
  if (claims.exp - claims.iat > OAUTH_STATE_MAX_TTL_SECONDS || claims.exp > now + OAUTH_STATE_MAX_TTL_SECONDS) {
    return { ok: false, reason: 'invalid_claims' };
  }

  if (opts.nonceCookie != null && opts.nonceCookie !== '' && !constantTimeEqual(opts.nonceCookie, claims.n)) {
    return { ok: false, reason: 'nonce_mismatch' };
  }
  if (opts.sessionUserId && opts.sessionUserId !== claims.uid) {
    return { ok: false, reason: 'session_mismatch' };
  }
  return { ok: true, claims };
}

// ─── Anti-replay: consumo único del nonce ───────────────────────────────────

const consumedNonces = new Map<string, number>();
const NONCE_SWEEP_THRESHOLD = 1000;

/**
 * Marca el nonce de unos claims YA verificados como usado. `false` si ya se
 * había consumido (o si expiró): el callback rechaza. Memoria por proceso.
 */
export function consumeOAuthStateNonce(claims: Pick<OAuthStateClaims, 'n' | 'exp'>, now: number = nowSeconds()): boolean {
  if (claims.exp < now) return false;
  if (consumedNonces.size >= NONCE_SWEEP_THRESHOLD) {
    for (const [n, exp] of consumedNonces) if (exp < now) consumedNonces.delete(n);
  }
  if (consumedNonces.has(claims.n)) return false;
  consumedNonces.set(claims.n, claims.exp);
  return true;
}

/** Solo para tests. */
export function _resetOAuthStateNonces(): void {
  consumedNonces.clear();
}
