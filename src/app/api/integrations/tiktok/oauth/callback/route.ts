// ============================================================
// API Route: Callback OAuth de TikTok
// GET /api/integrations/tiktok/oauth/callback
// TikTok redirige aquí con auth_code después de autorizar.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code');
  const stateParam = searchParams.get('state');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io';

  if (!authCode || !stateParam) {
    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?tiktok_error=${encodeURIComponent('Faltan parámetros de OAuth')}`
    );
  }

  try {
    // Decodificar state
    const stateJson = Buffer.from(decodeURIComponent(stateParam), 'base64').toString('utf-8');
    const state = JSON.parse(stateJson) as {
      organization_id: number;
      user_id: string;
      timestamp: number;
    };

    // 1. Completar flujo OAuth: auth_code → access_token + advertiser_id
    const oauthResult = await tiktokMarketingService.completeOAuthFlow(authCode);

    const supabase = createRouteHandlerClient({ cookies });
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

    // 3. Crear conexión automáticamente
    const { data: newConnection, error: connError } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: state.organization_id,
        connector_id: connector.id,
        connection_name: `TikTok Marketing - ${oauthResult.advertiserName}`,
        status: 'active',
        environment: 'production',
        country_code: 'CO',
      })
      .select('id')
      .single();

    if (connError || !newConnection) {
      throw new Error(`Error creando conexión: ${connError?.message || 'Unknown'}`);
    }

    const connectionId = newConnection.id;

    // 4. Obtener datos de la organización para el setup
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name, subdomain')
      .eq('id', state.organization_id)
      .single();

    const { data: domainData } = await supabase
      .from('organization_domains')
      .select('host')
      .eq('organization_id', state.organization_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .maybeSingle();

    const domain = domainData?.host || `${orgData?.subdomain || 'shop'}.goadmin.io`;

    // 5. Ejecutar fullSetup: crea pixel + catálogo + sincroniza productos
    const setupResult = await tiktokMarketingService.fullSetup(
      connectionId,
      oauthResult.accessToken,
      appSecret,
      oauthResult.advertiserId,
      state.organization_id,
      orgData?.name || 'Mi Negocio',
      domain,
      'COP'
    );

    // 6. Redirigir con éxito
    const successMsg = encodeURIComponent(
      `TikTok conectado exitosamente. ` +
      `Catálogo: ${setupResult.catalogName}, ` +
      `Pixel: ${setupResult.pixelName}, ` +
      `Productos sincronizados: ${setupResult.productsSynced}`
    );

    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?tiktok_success=${successMsg}`
    );
  } catch (error) {
    console.error('Error in TikTok OAuth callback:', error);
    const msg = encodeURIComponent(
      error instanceof Error ? error.message : 'Error en el proceso de autenticación con TikTok'
    );
    return NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?tiktok_error=${msg}`);
  }
}
