import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { buildMetaOAuthUrl } from '@/lib/services/integrations/meta/metaMarketingConfig';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import { marketingConnectionInOrg } from '@/lib/services/integrations/marketingAccess';
import {
  issueOAuthState,
  oauthNonceCookieName,
  oauthNonceCookieOptions,
  OAuthStateSecretMissingError,
} from '@/lib/security/oauthState';

const ROUTE = 'integrations/meta/oauth/authorize';

/**
 * POST /api/integrations/meta/oauth/authorize
 * Genera la URL de autorización OAuth de Facebook. El frontend redirige al
 * usuario a esa URL.
 *
 * Antes: el usuario salía de decodificar SIN verificar la firma el JWT de la
 * cookie, la organización del body, y el `state` era base64 sin firma.
 * Ahora: sesión + organización activa + admin (`withOrg({ admin: true })`),
 * organización ajena en el body → 403 y registro, `connection_id` opcional
 * validado contra la organización, y `state` firmado con HMAC y expiración
 * corta (`@/lib/security/oauthState`) cuyo nonce queda además en una cookie
 * httpOnly del navegador que inició.
 *
 * Body: { connection_id?: uuid }.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as { connection_id?: unknown };

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'META_APP_ID y META_APP_SECRET no configurados en el servidor' },
        { status: 500 }
      );
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL no configurado en el servidor' },
        { status: 500 }
      );
    }

    let connectionId: string | null = null;
    if (body.connection_id != null && body.connection_id !== '') {
      if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'meta_marketing', ROUTE))) {
        return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
      }
      connectionId = body.connection_id as string;
    }

    const { state, nonce } = issueOAuthState({
      provider: 'meta',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      connectionId,
    });

    const response = NextResponse.json({ url: buildMetaOAuthUrl(state) });
    response.cookies.set(oauthNonceCookieName('meta'), nonce, oauthNonceCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    if (error instanceof OAuthStateSecretMissingError) {
      return NextResponse.json(
        { error: 'La conexión con Meta no está disponible: falta configurar el servidor.', code: error.code },
        { status: 503 }
      );
    }
    console.error('Error generating Meta OAuth URL:', error);
    return NextResponse.json({ error: 'Error al generar URL de OAuth' }, { status: 500 });
  }
}, { admin: true });
