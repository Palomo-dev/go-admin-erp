/**
 * Aceptación del `state` en los callbacks OAuth de Meta Marketing y TikTok
 * Marketing (servidor). Punto único para los dos callbacks: ninguno decodifica
 * el `state` por su cuenta.
 *
 * Orden (todo ANTES de canjear el `code` con el proveedor):
 *  1. `verifyOAuthState`: firma HMAC, proveedor, expiración, forma; cookie del
 *     nonce (si llega) igual a la del `state`; sesión del callback (si hay una
 *     legible) del mismo usuario que inició.
 *  2. Consumo único del nonce (anti-replay dentro de la vida del `state`).
 *  3. En la base (service-role: el callback no tiene por qué traer sesión), el
 *     usuario que firmó sigue siendo miembro activo y admin de la organización.
 *  4. Si el `state` trae conexión, sigue siendo de esa organización y del
 *     conector esperado.
 * Cualquier fallo se registra con su motivo (nunca el `state` entero) y el
 * callback responde con un mensaje genérico.
 */

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerUserClient } from '@/lib/supabase/server-user';
import {
  consumeOAuthStateNonce,
  oauthNonceCookieName,
  verifyOAuthState,
  type OAuthProvider,
  type OAuthStateClaims,
  type OAuthStateFailure,
} from '@/lib/security/oauthState';
import { marketingConnectionInOrg, oauthInitiatorIsOrgAdmin, type MarketingConnectorCode } from './marketingAccess';

export type OAuthCallbackRejection = OAuthStateFailure | 'replayed' | 'initiator_not_admin' | 'connection_not_in_org';

export type AcceptedOAuthState =
  | { ok: true; claims: OAuthStateClaims }
  | { ok: false; reason: OAuthCallbackRejection };

/** Mensaje para el usuario cuando el `state` no se acepta (el motivo exacto va al log). */
export const OAUTH_STATE_REJECTED_MESSAGE = 'La autorización no es válida o expiró. Vuelve a iniciar la conexión desde GO Admin.';

/** Usuario de la sesión del callback si hay una legible; `null` si no (el proveedor puede volver sin cookies). */
async function sessionUserId(): Promise<string | null> {
  try {
    const client = await getServerUserClient();
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function acceptMarketingOAuthState(
  request: NextRequest,
  stateParam: string | null,
  opts: { provider: OAuthProvider; connector: MarketingConnectorCode; route: string; service: SupabaseClient }
): Promise<AcceptedOAuthState> {
  const reject = (reason: OAuthCallbackRejection, extra: Record<string, unknown> = {}): AcceptedOAuthState => {
    console.warn(`[${opts.route}] state OAuth rechazado`, { reason, ...extra });
    return { ok: false, reason };
  };

  const verification = verifyOAuthState(stateParam, opts.provider, {
    nonceCookie: request.cookies.get(oauthNonceCookieName(opts.provider))?.value ?? null,
    sessionUserId: await sessionUserId(),
  });
  if (!verification.ok) return reject(verification.reason);
  const { claims } = verification;
  const who = { organizationId: claims.org, userId: claims.uid };

  if (!consumeOAuthStateNonce(claims)) return reject('replayed', who);
  if (!(await oauthInitiatorIsOrgAdmin(opts.service, claims.org, claims.uid))) return reject('initiator_not_admin', who);
  if (
    claims.cid &&
    !(await marketingConnectionInOrg({ supabase: opts.service, ...who }, claims.cid, opts.connector, opts.route))
  ) {
    return reject('connection_not_in_org', who);
  }
  return { ok: true, claims };
}
