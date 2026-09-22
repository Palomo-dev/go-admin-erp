/**
 * Credencial de Realtime de la pantalla remota (PLAN §7, «Canal Realtime
 * remoto»; §11). SOLO servidor. La emiten `/api/pos/display/bootstrap` y
 * CADA `/api/pos/display/heartbeat` (ronda 3, qa alto 2): con un JWT de 5
 * minutos renovado en cada latido (60 s), la pantalla nunca opera con uno
 * viejo y, tras `/revoke`, el latido responde 401, no hay JWT nuevo y el
 * canal muere en <= 5 min. Criterio de la parte B: el receptor llama
 * `supabase.realtime.setAuth(token)` con CADA token nuevo y sale del canal
 * ante un 401.
 *
 * Fail-closed: sin `SUPABASE_JWT_SECRET` real (relleno o corto cuenta como
 * ausente) se responde 503 `REALTIME_NOT_CONFIGURED`, nunca un 200 sin
 * credencial: una pantalla sin canal no sirve de nada y un token sin firmar
 * lo rechazaría Realtime igualmente.
 */

import { NextResponse } from 'next/server';
import { readRealSecret } from '@/lib/security/secrets';
import { displayChannelName } from '@/lib/pos/display/transport';
import { REALTIME_JWT_TTL_SECONDS, SUPABASE_JWT_SECRET_ENV, signRealtimeJwt } from './displayTokens';

export const REALTIME_NOT_CONFIGURED_CODE = 'REALTIME_NOT_CONFIGURED';

/** Lo que la pantalla necesita para (re)unirse al canal de SU terminal. */
export interface DisplayRealtimeCredential {
  /** `pos-display:<terminalId>` (id en minúsculas, igual que el claim). */
  channel: string;
  token: string;
  /** Caducidad en ISO 8601; la pantalla la renueva con el latido mucho antes. */
  expiresAt: string;
}

export type DisplayRealtimeIssue =
  | { ok: true; realtime: DisplayRealtimeCredential }
  | { ok: false; response: NextResponse };

/**
 * Firma el JWT de Realtime para `terminalId` o devuelve el 503 que la ruta
 * debe responder tal cual. `route` solo etiqueta el registro. Nunca lanza.
 */
export function issueDisplayRealtimeCredential(terminalId: string, route: string): DisplayRealtimeIssue {
  const secret = readRealSecret(SUPABASE_JWT_SECRET_ENV, { min: 32 });
  if (secret === null) {
    console.error(`[pos-display/${route}] ${SUPABASE_JWT_SECRET_ENV} no configurado: la pantalla remota no puede unirse a Realtime`);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Realtime no configurado en el servidor', code: REALTIME_NOT_CONFIGURED_CODE }, { status: 503, headers: { 'Cache-Control': 'no-store' } }),
    };
  }
  const id = terminalId.toLowerCase();
  const signed = signRealtimeJwt(secret, { terminalId: id, ttlSeconds: REALTIME_JWT_TTL_SECONDS });
  return { ok: true, realtime: { channel: displayChannelName(id), token: signed.token, expiresAt: signed.expiresAt } };
}
