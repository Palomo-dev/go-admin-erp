import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { buildGoogleOAuthUrl, GOOGLE_ADS_CONNECTOR_CODE } from '@/lib/services/integrations/google-ads/googleAdsConfig';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import { marketingConnectionInOrg } from '@/lib/services/integrations/marketingAccess';
import {
  issueOAuthState,
  oauthNonceCookieName,
  oauthNonceCookieOptions,
  OAuthStateSecretMissingError,
} from '@/lib/security/oauthState';

const ROUTE = 'integrations/google-ads/oauth/authorize';

/**
 * POST /api/integrations/google-ads/oauth/authorize
 * Genera la URL de autorización OAuth de Google. El frontend redirige al
 * usuario a esa URL.
 *
 * Antes: la organización salía del body y el `state` era base64 sin firma, y
 * el callback lo usaba para crear conexiones y guardar credenciales en esa
 * organización. Ahora: sesión + organización activa + admin
 * (`withOrg({ admin: true })`), organización ajena en el body → 403 y
 * registro, `connection_id` opcional validado contra la organización y el
 * conector, y `state` firmado (`@/lib/security/oauthState`) con el nonce en
 * una cookie httpOnly.
 *
 * Body: { connection_id?: uuid }.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as { connection_id?: unknown };

    if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'GOOGLE_ADS_CLIENT_ID y GOOGLE_ADS_CLIENT_SECRET no configurados en el servidor' },
        { status: 500 }
      );
    }

    let connectionId: string | null = null;
    if (body.connection_id != null && body.connection_id !== '') {
      if (!(await marketingConnectionInOrg(ctx, body.connection_id, GOOGLE_ADS_CONNECTOR_CODE, ROUTE))) {
        return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
      }
      connectionId = body.connection_id as string;
    }

    const { state, nonce } = issueOAuthState({
      provider: 'google',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      connectionId,
    });

    const response = NextResponse.json({ url: buildGoogleOAuthUrl(state) });
    response.cookies.set(oauthNonceCookieName('google'), nonce, oauthNonceCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    if (error instanceof OAuthStateSecretMissingError) {
      return NextResponse.json(
        { error: 'La conexión con Google Ads no está disponible: falta configurar el servidor.', code: error.code },
        { status: 503 }
      );
    }
    console.error('Error generating Google Ads OAuth URL:', error);
    return NextResponse.json({ error: 'Error al generar URL de OAuth' }, { status: 500 });
  }
}, { admin: true });
