import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import { GOOGLE_ADS_CONNECTOR_CODE } from '@/lib/services/integrations/google-ads/googleAdsConfig';
import type { GoogleAdsOAuthState } from '@/lib/services/integrations/google-ads/googleAdsTypes';

/**
 * GET /api/integrations/google-ads/oauth/callback
 * Google redirige aquí después de que el usuario autoriza.
 * Intercambia code → tokens → lista cuentas → guarda credenciales.
 *
 * Si hay una sola cuenta NO manager, se selecciona automáticamente.
 * Si hay múltiples cuentas, redirige a página de selección.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Si el usuario canceló en Google
  if (errorParam) {
    const msg = encodeURIComponent(errorDescription || 'Autorización cancelada por el usuario');
    return NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?google_error=${msg}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?google_error=${encodeURIComponent('Faltan parámetros de OAuth')}`
    );
  }

  try {
    // Decodificar state
    const stateJson = Buffer.from(decodeURIComponent(stateParam), 'base64').toString('utf-8');
    const state = JSON.parse(stateJson) as GoogleAdsOAuthState;

    // 1. Completar flujo OAuth: code → tokens → lista cuentas
    const oauthResult = await googleAdsService.completeOAuthFlow(code);

    const supabase = createRouteHandlerClient({ cookies });

    // 2. Si ya hay connection_id, usar esa; si no, crear una nueva
    let connectionId = state.connection_id;

    if (!connectionId) {
      // Obtener el connector de google_ads
      const { data: connector } = await supabase
        .from('integration_connectors')
        .select('id, provider_id')
        .eq('code', GOOGLE_ADS_CONNECTOR_CODE)
        .single();

      if (!connector) {
        throw new Error('Connector google_ads no encontrado en BD');
      }

      // Filtrar cuentas no-manager (las cuentas del cliente real)
      const clientAccounts = oauthResult.customers.filter((c) => !c.isManager);
      const selectedAccount = clientAccounts.length > 0 ? clientAccounts[0] : oauthResult.customers[0];

      // Crear conexión automáticamente
      const { data: newConnection, error: connError } = await supabase
        .from('integration_connections')
        .insert({
          organization_id: state.organization_id,
          connector_id: connector.id,
          connection_name: `Google Ads - ${selectedAccount?.name || 'Mi cuenta'}`,
          status: 'active',
          environment: 'production',
          country_code: 'CO',
        })
        .select('id')
        .single();

      if (connError || !newConnection) {
        throw new Error(`Error creando conexión: ${connError?.message || 'Unknown'}`);
      }

      connectionId = newConnection.id;

      // 3. Guardar credenciales
      await googleAdsService.saveCredentials(connectionId, {
        refreshToken: oauthResult.refreshToken,
        customerId: selectedAccount?.id || '',
      });
    } else {
      // Actualizar credenciales en conexión existente
      const clientAccounts = oauthResult.customers.filter((c) => !c.isManager);
      const selectedAccount = clientAccounts.length > 0 ? clientAccounts[0] : oauthResult.customers[0];

      await googleAdsService.saveCredentials(connectionId, {
        refreshToken: oauthResult.refreshToken,
        customerId: selectedAccount?.id || '',
      });

      // Actualizar estado de la conexión a activa
      await supabase
        .from('integration_connections')
        .update({
          status: 'active',
          connection_name: `Google Ads - ${selectedAccount?.name || 'Mi cuenta'}`,
        })
        .eq('id', connectionId);
    }

    // 4. Redirigir con éxito
    const clientAccounts = oauthResult.customers.filter((c) => !c.isManager);
    const accountCount = clientAccounts.length || oauthResult.customers.length;
    const successMsg = encodeURIComponent(
      `Google Ads conectado exitosamente. ${accountCount} cuenta(s) encontradas.`
    );

    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?google_success=${successMsg}`
    );
  } catch (error) {
    console.error('Error in Google Ads OAuth callback:', error);
    const msg = encodeURIComponent(
      error instanceof Error ? error.message : 'Error en el proceso de autenticación con Google'
    );
    return NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?google_error=${msg}`);
  }
}
