import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import { GOOGLE_ADS_CONNECTOR_CODE } from '@/lib/services/integrations/google-ads/googleAdsConfig';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { acceptMarketingOAuthState, OAUTH_STATE_REJECTED_MESSAGE } from '@/lib/services/integrations/marketingOAuthCallback';
import { oauthNonceCookieName, oauthNonceCookieOptions } from '@/lib/security/oauthState';

const ROUTE = 'integrations/google-ads/oauth/callback';

/**
 * GET /api/integrations/google-ads/oauth/callback
 * Google redirige aquí después de que el usuario autoriza.
 * Intercambia code → tokens → lista cuentas → guarda credenciales.
 *
 * Si hay una sola cuenta NO manager, se selecciona automáticamente.
 *
 * La organización, el usuario y la conexión salen de un `state` FIRMADO por
 * `/api/integrations/google-ads/oauth/authorize` (ver
 * `acceptMarketingOAuthState`), validado ANTES de canjear el `code`. Antes era
 * base64 sin firma: cualquiera podía crear una conexión en otra organización
 * o sobrescribir el refresh token de una conexión ajena.
 *
 * Cliente service-role: Google redirige sin garantizar la sesión; se usa solo
 * con la organización ya probada por la firma y el usuario revalidado como
 * admin activo de ella. Toda escritura filtra por esa organización.
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
    res.cookies.set(oauthNonceCookieName('google'), '', { ...oauthNonceCookieOptions(), maxAge: 0 });
    return res;
  };
  const fail = (msg: string) => redirect(`google_error=${encodeURIComponent(msg)}`);

  // Si el usuario canceló en Google
  if (errorParam) {
    return fail(errorDescription || 'Autorización cancelada por el usuario');
  }

  if (!code || !stateParam) {
    return fail('Faltan parámetros de OAuth');
  }

  try {
    const supabase = getServiceClient();

    const accepted = await acceptMarketingOAuthState(request, stateParam, {
      provider: 'google',
      connector: GOOGLE_ADS_CONNECTOR_CODE,
      route: ROUTE,
      service: supabase,
    });
    if (!accepted.ok) return fail(OAUTH_STATE_REJECTED_MESSAGE);
    const state = accepted.claims;

    // 1. Completar flujo OAuth: code → tokens → lista cuentas
    const oauthResult = await googleAdsService.completeOAuthFlow(code);

    // Filtrar cuentas no-manager (las cuentas del cliente real)
    const clientAccounts = oauthResult.customers.filter((c) => !c.isManager);
    const selectedAccount = clientAccounts.length > 0 ? clientAccounts[0] : oauthResult.customers[0];
    const connectionName = `Google Ads - ${selectedAccount?.name || 'Mi cuenta'}`;

    // 2. Si ya hay connection_id (validada contra la organización), usarla; si no, crear una nueva
    let connectionId = state.cid;

    if (!connectionId) {
      const { data: connector } = await supabase
        .from('integration_connectors')
        .select('id, provider_id')
        .eq('code', GOOGLE_ADS_CONNECTOR_CODE)
        .single();

      if (!connector) {
        throw new Error('Connector google_ads no encontrado en BD');
      }

      // Columnas y estado verificados contra el esquema: `name` (no
      // `connection_name`) y el CHECK de `status` no admite 'active'.
      const { data: newConnection, error: connError } = await supabase
        .from('integration_connections')
        .insert({
          organization_id: state.org,
          connector_id: connector.id,
          name: connectionName,
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
    } else {
      // Conexión existente de ESTA organización: estado utilizable.
      await supabase
        .from('integration_connections')
        .update({
          status: INTEGRATION_CONNECTION_USABLE_STATUS,
          name: connectionName,
          connected_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .eq('organization_id', state.org);
    }

    // 3. Guardar credenciales (conexión ya validada o recién creada en la organización firmada)
    await googleAdsService.saveCredentials(connectionId, {
      refreshToken: oauthResult.refreshToken,
      customerId: selectedAccount?.id || '',
    });

    // 4. Redirigir con éxito
    const accountCount = clientAccounts.length || oauthResult.customers.length;
    return redirect(
      `google_success=${encodeURIComponent(`Google Ads conectado exitosamente. ${accountCount} cuenta(s) encontradas.`)}`
    );
  } catch (error) {
    console.error('Error in Google Ads OAuth callback:', error);
    return fail(error instanceof Error ? error.message : 'Error en el proceso de autenticación con Google');
  }
}
