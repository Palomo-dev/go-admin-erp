/**
 * Autenticación de la pantalla remota (PLAN §7 y §11, CLAUDE.md regla 5).
 * SOLO servidor.
 *
 * Las rutas `/api/pos/display/bootstrap` y `/heartbeat` NO tienen sesión de
 * usuario: autentican por el token largo que la pantalla obtuvo al canjear
 * el código (`/api/pos/display/pair`) y lo mandan como `Authorization:
 * Bearer <token>`. La organización se resuelve DESDE LA TERMINAL (fila de
 * `pos_terminals` a la que pertenece el token), nunca desde la petición.
 *
 * Fail-closed: token ausente, con forma inválida, sin fila, revocado (hash
 * nulo), terminal inactiva o con organización incoherente entre las dos
 * tablas → 401 UNIFORME (`DISPLAY_UNAUTHORIZED`, mismo cuerpo), para no
 * revelar qué parte falló. Solo un fallo de la base es 503.
 *
 * El lookup va por el sha256 del token (en la base solo vive el hash) con el
 * cliente service-role: `pos_terminal_secrets` no tiene permisos para `anon`
 * ni `authenticated`. Se vuelve a comparar el hash devuelto en tiempo
 * constante (`hashesMatch`), por si la igualdad de la consulta no fuese
 * estricta (collation, espacios).
 *
 * Rate limit de los FALLOS por IP (ronda 2, qa bajo 3; ronda 3, qa bajo 4):
 * cada 401 registra un hit en `pos-display:auth:ip:<ip>` (300 por minuto;
 * sin cabecera de IP, cubo `unknown` de 10) y, ANTES de tocar la base, se
 * mira si ese cubo está agotado (`isRateLimitExhausted`, memoria) → 429 sin
 * consulta. Los aciertos no cuentan. Qué protege y qué no:
 * - Protege el COSTE del SELECT por hash, no la fuerza bruta: el token tiene
 *   256 bits y adivinarlo no es un riesgo; por eso el límite es alto (300).
 * - El corte es por IP y va ANTES de mirar el token: con el cubo agotado,
 *   un token VÁLIDO desde esa misma IP también recibe 429 hasta que venza la
 *   ventana (60 s). Un vecino hostil en la wifi de la tienda (mismo NAT que
 *   la tableta) puede provocarlo con 300 peticiones basura por minuto.
 *   DECISIÓN: se acepta; el riesgo queda acotado a la LAN de la tienda, dura
 *   como mucho un minuto por ráfaga, y el latido reintenta al minuto. La
 *   alternativa (mirar el token antes del cubo) devolvería el SELECT a cada
 *   petición basura, que es justo lo que el cubo evita. N tabletas
 *   legítimas tras el mismo NAT NO se bloquean entre sí (los aciertos no
 *   consumen), pero SÍ las bloquea un tercero hostil en esa misma red.
 * - Los cubos por IP dependen de que el proxy sobreescriba `x-forwarded-for`
 *   (Vercel sí); ver F3-A «Ronda 3». Índice parcial por `display_token_hash`
 *   en la base (migración 20260922130000).
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit, getClientIp, isRateLimitExhausted } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { hashDisplayToken, hashesMatch, isDisplayTokenShape, readBearerToken } from './displayTokens';

/** Terminal autenticada: lo mínimo que las rutas necesitan. Sin datos de ventas. */
export interface AuthenticatedDisplayTerminal {
  id: string;
  organizationId: number;
  branchId: number;
  name: string;
  code: string;
}

export type DisplayAuthResult =
  | { ok: true; terminal: AuthenticatedDisplayTerminal }
  | { ok: false; response: NextResponse };

export const DISPLAY_UNAUTHORIZED_CODE = 'DISPLAY_UNAUTHORIZED';
export const DISPLAY_RATE_LIMITED_CODE = 'RATE_LIMITED';

/** Cubo de FALLOS de autenticación por IP: 300 por minuto (protege el coste del SELECT, no la fuerza bruta; ver cabecera). */
export const DISPLAY_AUTH_FAIL_LIMIT = { limit: 300, windowMs: 60 * 1000, unknownClientLimit: 10 } as const;
export const DISPLAY_AUTH_FAIL_PREFIX = 'pos-display:auth:ip:';

/** Mismo 401 para cualquier fallo de autenticación: no distingue causas hacia fuera. */
export function displayUnauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Pantalla no autorizada: empareje de nuevo con un código', code: DISPLAY_UNAUTHORIZED_CODE },
    { status: 401, headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer realm="pos-display"' } },
  );
}

interface SecretRow {
  terminal_id: string;
  organization_id: number;
  display_token_hash: string | null;
}

interface TerminalRow {
  id: string;
  organization_id: number;
  branch_id: number;
  name: string;
  code: string;
  is_active: boolean;
}

/**
 * Subconjunto del cliente Supabase que usa este módulo. Tipado a mano para
 * que las pruebas inyecten un doble sin arrastrar el cliente real.
 */
export interface DisplayAuthClient {
  from(table: 'pos_terminal_secrets'): {
    select(columns: string): {
      eq(column: 'display_token_hash', value: string): {
        maybeSingle(): PromiseLike<{ data: SecretRow | null; error: { message: string } | null }>;
      };
    };
  };
  from(table: 'pos_terminals'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): PromiseLike<{ data: TerminalRow | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface DisplayAuthOptions {
  /** Cliente service-role; por defecto `getServiceClient()`. */
  client?: DisplayAuthClient;
}

/** 429 cuando la IP acumuló demasiados 401 en el último minuto. */
export function displayRateLimited(resetAt: Date): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: 'Demasiados intentos; espere un momento', code: DISPLAY_RATE_LIMITED_CODE },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
  );
}

function serviceUnavailable(): NextResponse {
  return NextResponse.json({ error: 'No se pudo validar la pantalla', code: 'DISPLAY_AUTH_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Valida el token Bearer de la petición y devuelve la terminal (con su
 * organización) o la respuesta 401/503 que la ruta debe devolver tal cual.
 * Nunca lanza.
 */
export async function authenticateDisplayRequest(request: Pick<Request, 'headers'>, options: DisplayAuthOptions = {}): Promise<DisplayAuthResult> {
  const failKey = `${DISPLAY_AUTH_FAIL_PREFIX}${getClientIp(request)}`;
  if (isRateLimitExhausted(failKey, DISPLAY_AUTH_FAIL_LIMIT)) {
    return { ok: false, response: displayRateLimited(new Date(Date.now() + DISPLAY_AUTH_FAIL_LIMIT.windowMs)) };
  }
  const result = await authenticateOnce(request, options);
  if (result.ok || result.response.status !== 401) return result;
  // Solo los 401 consumen cupo. Si el cubo (memoria + store persistente) se
  // agota con este fallo, la respuesta ya es 429: el siguiente intento no
  // llega a la base.
  const rl = await checkRateLimit(failKey, DISPLAY_AUTH_FAIL_LIMIT, { store: getRateLimitStore() });
  if (!rl.allowed) {
    console.warn('[pos-display/auth] rate limit de fallos por IP', { key: failKey, resetAt: rl.resetAt.toISOString() });
    return { ok: false, response: displayRateLimited(rl.resetAt) };
  }
  return result;
}

async function authenticateOnce(request: Pick<Request, 'headers'>, options: DisplayAuthOptions): Promise<DisplayAuthResult> {
  const token = readBearerToken(request);
  if (!isDisplayTokenShape(token)) {
    return { ok: false, response: displayUnauthorized() };
  }
  const presentedHash = hashDisplayToken(token);

  let client: DisplayAuthClient;
  try {
    client = options.client ?? (getServiceClient() as unknown as DisplayAuthClient);
  } catch (err) {
    console.error('[pos-display/auth] sin cliente service-role:', err instanceof Error ? err.message : err);
    return { ok: false, response: serviceUnavailable() };
  }

  try {
    const { data: secret, error: secretError } = await client
      .from('pos_terminal_secrets')
      .select('terminal_id, organization_id, display_token_hash')
      .eq('display_token_hash', presentedHash)
      .maybeSingle();
    if (secretError) {
      console.error('[pos-display/auth] lectura de secretos falló:', secretError.message);
      return { ok: false, response: serviceUnavailable() };
    }
    // Revocado (hash nulo) o inexistente: la consulta no devuelve fila. Y aunque
    // devolviera, el hash se recompara en tiempo constante.
    if (!secret || !hashesMatch(secret.display_token_hash, presentedHash)) {
      return { ok: false, response: displayUnauthorized() };
    }

    const { data: terminal, error: terminalError } = await client
      .from('pos_terminals')
      .select('id, organization_id, branch_id, name, code, is_active')
      .eq('id', secret.terminal_id)
      .maybeSingle();
    if (terminalError) {
      console.error('[pos-display/auth] lectura de la terminal falló:', terminalError.message);
      return { ok: false, response: serviceUnavailable() };
    }
    if (!terminal || terminal.is_active !== true) {
      return { ok: false, response: displayUnauthorized() };
    }
    if (terminal.organization_id !== secret.organization_id) {
      // Incoherencia entre las dos tablas: nunca debería pasar (FK + escritura
      // conjunta). Se registra y se falla cerrado.
      console.error('[pos-display/auth] organización incoherente entre pos_terminals y pos_terminal_secrets', { terminalId: terminal.id });
      return { ok: false, response: displayUnauthorized() };
    }

    return {
      ok: true,
      terminal: {
        id: terminal.id,
        organizationId: terminal.organization_id,
        branchId: terminal.branch_id,
        name: terminal.name,
        code: terminal.code,
      },
    };
  } catch (err) {
    console.error('[pos-display/auth] error inesperado:', err instanceof Error ? err.message : err);
    return { ok: false, response: serviceUnavailable() };
  }
}
