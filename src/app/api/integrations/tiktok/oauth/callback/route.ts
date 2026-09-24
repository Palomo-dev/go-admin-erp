// ============================================================
// API Route: Callback OAuth de TikTok
// GET /api/integrations/tiktok/oauth/callback
// TikTok redirige aquí con auth_code después de autorizar.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { resolveOrgStoreDomain } from '@/lib/services/integrations/marketingAccess';
import { acceptMarketingOAuthState, OAUTH_STATE_REJECTED_MESSAGE } from '@/lib/services/integrations/marketingOAuthCallback';
import { oauthNonceCookieName, oauthNonceCookieOptions } from '@/lib/security/oauthState';

const ROUTE = 'integrations/tiktok/oauth/callback';

/**
 * La organización y el usuario salen de un `state` FIRMADO por
 * `/api/integrations/tiktok/oauth/authorize` (HMAC + expiración + nonce ligado
 * al navegador y a la sesión que inició; ver `acceptMarketingOAuthState`).
 * Antes era base64 sin firma: cualquiera podía crear una conexión con SU
 * cuenta de TikTok en otra organización (y sincronizar allí su catálogo). El
 * `state` se valida ANTES de canjear el `auth_code` con TikTok.
 *
 * Cliente service-role: el callback llega desde TikTok y puede no traer la
 * sesión; se usa solo con la organización ya probada por la firma y con el
 * usuario revalidado como admin activo de ella.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code');
  const stateParam = searchParams.get('state');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io';

  // Toda respuesta borra la cookie del nonce: un flujo, un intento.
  const redirect = (query: string) => {
    const res = NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?${query}`);
    res.cookies.set(oauthNonceCookieName('tiktok'), '', { ...oauthNonceCookieOptions(), maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => redirect(`tiktok_error=${encodeURIComponent(msg)}`);

  if (!authCode || !stateParam) {
    return fail('Faltan parámetros de OAuth');
  }

  try {
    const supabase = getServiceClient();

    // 0. `state` firmado, vigente, del mismo navegador/sesión y usuario todavía
    //    admin de la organización.
    const accepted = await acceptMarketingOAuthState(request, stateParam, {
      provider: 'tiktok',
      connector: 'tiktok_marketing',
      route: ROUTE,
      service: supabase,
    });
    if (!accepted.ok) return fail(OAUTH_STATE_REJECTED_MESSAGE);
    const state = accepted.claims;

    // 1. Completar flujo OAuth: auth_code → access_token + advertiser_id
    const oauthResult = await tiktokMarketingService.completeOAuthFlow(authCode);

    const appSecret = process.env.TIKTOK_APP_SECRET || '';

    // 2. Obtener connector de tiktok_marketing
    const { data: connector } = await supabase
      .from('integration_connectors')
      .select('id, provider_id')
      .eq('code', 'tiktok_marketing')
      .single();

    if (!connector) {
      throw new Error('Connector tiktok_marketing no encontrado en BD');
    }

    // 3. Crear conexión automáticamente. Columnas y estado verificados contra
    //    el esquema: la columna es `name` (no `connection_name`) y el CHECK de
    //    `status` no admite 'active' (ver `connectionStatus.ts`): antes este
    //    insert fallaba siempre.
    const { data: newConnection, error: connError } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: state.org,
        connector_id: connector.id,
        name: `TikTok Marketing - ${oauthResult.advertiserName}`,
        status: INTEGRATION_CONNECTION_USABLE_STATUS,
        connected_at: new Date().toISOString(),
        environment: 'production',
        country_code: 'CO',
        created_by: state.uid,
      })
      .select('id')
      .single();

    if (connError || !newConnection) {
      throw new Error(`Error creando conexión: ${connError?.message || 'Unknown'}`);
    }

    const connectionId = newConnection.id as string;

    // 4. Obtener datos de la organización para el setup
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', state.org)
      .single();

    const domain = await resolveOrgStoreDomain(supabase, state.org);

    // 5. Ejecutar fullSetup: crea pixel + catálogo + sincroniza productos
    const setupResult = await tiktokMarketingService.fullSetup(
      connectionId,
      oauthResult.accessToken,
      appSecret,
      oauthResult.advertiserId,
      state.org,
      orgData?.name || 'Mi Negocio',
      domain,
      'COP',
      supabase
    );

    // 6. Redirigir con éxito
    const successMsg = encodeURIComponent(
      `TikTok conectado exitosamente. ` +
      `Catálogo: ${setupResult.catalogName}, ` +
      `Pixel: ${setupResult.pixelName}, ` +
      `Productos sincronizados: ${setupResult.productsSynced}`
    );

    return redirect(`tiktok_success=${successMsg}`);
  } catch (error) {
    console.error('Error in TikTok OAuth callback:', error);
    return fail(error instanceof Error ? error.message : 'Error en el proceso de autenticación con TikTok');
  }
}
