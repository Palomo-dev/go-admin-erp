import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { resolveOrgStoreDomain } from '@/lib/services/integrations/marketingAccess';
import { acceptMarketingOAuthState, OAUTH_STATE_REJECTED_MESSAGE } from '@/lib/services/integrations/marketingOAuthCallback';
import { oauthNonceCookieName, oauthNonceCookieOptions } from '@/lib/security/oauthState';

const ROUTE = 'integrations/meta/oauth/callback';

/**
 * GET /api/integrations/meta/oauth/callback
 * Facebook redirige aquí después de que el usuario autoriza.
 * Intercambia code → token → obtiene business → ejecuta fullSetup.
 *
 * La organización, el usuario y la conexión salen de un `state` FIRMADO por
 * `/api/integrations/meta/oauth/authorize` (HMAC + expiración + nonce ligado
 * al navegador y a la sesión que inició; ver `acceptMarketingOAuthState`).
 * Antes era base64 sin firma: cualquiera podía crear conexiones en otra
 * organización o sobrescribir las credenciales de una conexión ajena. El
 * `state` se valida ANTES de canjear el `code` con Meta.
 *
 * Cliente service-role: el callback llega desde Facebook y puede no traer la
 * sesión; se usa solo con la organización ya probada por la firma y con el
 * usuario revalidado como admin activo de ella.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Toda respuesta borra la cookie del nonce: un flujo, un intento.
  const redirect = (query: string) => {
    const res = NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?${query}`);
    res.cookies.set(oauthNonceCookieName('meta'), '', { ...oauthNonceCookieOptions(), maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => redirect(`meta_error=${encodeURIComponent(msg)}`);

  // Si el usuario canceló en Facebook
  if (errorParam) {
    return fail(errorDescription || 'Autorización cancelada por el usuario');
  }

  if (!code || !stateParam) {
    return fail('Faltan parámetros de OAuth');
  }

  try {
    const supabase = getServiceClient();

    // 0. `state` firmado, vigente, del mismo navegador/sesión, usuario todavía
    //    admin de la organización y conexión (si viene) de esa organización.
    const accepted = await acceptMarketingOAuthState(request, stateParam, {
      provider: 'meta',
      connector: 'meta_marketing',
      route: ROUTE,
      service: supabase,
    });
    if (!accepted.ok) return fail(OAUTH_STATE_REJECTED_MESSAGE);
    const state = accepted.claims;

    // 1. Completar flujo OAuth: code → long-lived token → business_id
    const oauthResult = await metaMarketingService.completeOAuthFlow(code);

    const appSecret = process.env.META_APP_SECRET || '';

    // 2. Si ya hay connection_id (validada contra la organización), usarla; si no, crear una nueva
    let connectionId = state.cid;

    if (!connectionId) {
      // Obtener el connector de meta_marketing
      const { data: connector } = await supabase
        .from('integration_connectors')
        .select('id, provider_id')
        .eq('code', 'meta_marketing')
        .single();

      if (!connector) {
        throw new Error('Connector meta_marketing no encontrado en BD');
      }

      // Crear conexión automáticamente
      const { data: newConnection, error: connError } = await supabase
        .from('integration_connections')
        .insert({
          organization_id: state.org,
          connector_id: connector.id,
          name: `Meta Marketing - ${oauthResult.businessName}`,
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

      connectionId = newConnection.id as string;
    }

    // 3. Obtener datos de la organización para el setup
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', state.org)
      .single();

    const domain = await resolveOrgStoreDomain(supabase, state.org);

    // Moneda base de la organización (organization_currencies, is_base = true)
    const { data: currencyData } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', state.org)
      .eq('is_base', true)
      .maybeSingle();

    const orgCurrency = (currencyData?.currency_code || 'COP').trim();

    // 4. Ejecutar fullSetup: crea catálogo + pixel + sincroniza productos
    const setupResult = await metaMarketingService.fullSetup(
      connectionId,
      oauthResult.accessToken,
      appSecret,
      oauthResult.businessId,
      oauthResult.adAccountId,
      state.org,
      orgData?.name || 'Mi Negocio',
      domain,
      orgCurrency,
      supabase
    );

    // 5. Redirigir con éxito
    const successMsg = encodeURIComponent(
      `Meta conectado exitosamente. ` +
      `Catálogo: ${setupResult.catalogName}, ` +
      `Pixel: ${setupResult.pixelName}, ` +
      `Ad Account: ${oauthResult.adAccountName || oauthResult.adAccountId}, ` +
      `Productos sincronizados: ${setupResult.productsSynced}`
    );

    return redirect(`meta_success=${successMsg}`);
  } catch (error) {
    console.error('Error in Meta OAuth callback:', error);
    return fail(error instanceof Error ? error.message : 'Error en el proceso de autenticación con Meta');
  }
}
