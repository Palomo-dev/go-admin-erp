// ============================================================
// API Route: Generar URL de autorización OAuth de TikTok
// POST /api/integrations/tiktok/oauth/authorize
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { buildTikTokOAuthUrl } from '@/lib/services/integrations/tiktok/tiktokMarketingConfig';
import {
  issueOAuthState,
  oauthNonceCookieName,
  oauthNonceCookieOptions,
  OAuthStateSecretMissingError,
} from '@/lib/security/oauthState';

const ROUTE = 'integrations/tiktok/oauth/authorize';

/**
 * Antes: el usuario salía de decodificar SIN verificar la firma el JWT de la
 * cookie, la organización del body, y el `state` era base64 sin firma.
 * Ahora: sesión + organización activa + admin (`withOrg({ admin: true })`),
 * organización ajena en el body → 403 y registro, y `state` firmado con HMAC y
 * expiración corta (`@/lib/security/oauthState`) cuyo nonce queda además en
 * una cookie httpOnly del navegador que inició. Body: vacío.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: ROUTE });

    const { state, nonce } = issueOAuthState({
      provider: 'tiktok',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });

    const response = NextResponse.json({ url: buildTikTokOAuthUrl(state) });
    response.cookies.set(oauthNonceCookieName('tiktok'), nonce, oauthNonceCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    if (error instanceof OAuthStateSecretMissingError) {
      return NextResponse.json(
        { error: 'La conexión con TikTok no está disponible: falta configurar el servidor.', code: error.code },
        { status: 503 }
      );
    }
    console.error('Error generando URL OAuth TikTok:', error);
    return NextResponse.json({ error: 'Error al generar URL de OAuth' }, { status: 500 });
  }
}, { admin: true });
