import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { metaMarketingService } from '@/lib/services/integrations/meta';

/**
 * GET /api/integrations/meta/oauth/callback
 * Facebook redirige aquí después de que el usuario autoriza.
 * Intercambia code → token → obtiene business → ejecuta fullSetup.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Si el usuario canceló en Facebook
  if (errorParam) {
    const msg = encodeURIComponent(errorDescription || 'Autorización cancelada por el usuario');
    return NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?meta_error=${msg}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?meta_error=${encodeURIComponent('Faltan parámetros de OAuth')}`
    );
  }

  try {
    // Decodificar state
    const stateJson = Buffer.from(decodeURIComponent(stateParam), 'base64').toString('utf-8');
    const state = JSON.parse(stateJson) as {
      organization_id: number;
      connection_id: string;
      user_id: string;
    };

    // 1. Completar flujo OAuth: code → long-lived token → business_id
    const oauthResult = await metaMarketingService.completeOAuthFlow(code);

    const supabase = createRouteHandlerClient({ cookies });
    const appSecret = process.env.META_APP_SECRET || '';

    // 2. Si ya hay connection_id, usar esa; si no, crear una nueva
    let connectionId = state.connection_id;

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
          organization_id: state.organization_id,
          connector_id: connector.id,
          connection_name: `Meta Marketing - ${oauthResult.businessName}`,
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
    }

    // 3. Obtener datos de la organización para el setup
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

    // 4. Ejecutar fullSetup: crea catálogo + pixel + sincroniza productos
    const setupResult = await metaMarketingService.fullSetup(
      connectionId,
      oauthResult.accessToken,
      appSecret,
      oauthResult.businessId,
      state.organization_id,
      orgData?.name || 'Mi Negocio',
      domain,
      'COP'
    );

    // 5. Redirigir con éxito
    const successMsg = encodeURIComponent(
      `Meta conectado exitosamente. ` +
      `Catálogo: ${setupResult.catalogName}, ` +
      `Pixel: ${setupResult.pixelName}, ` +
      `Productos sincronizados: ${setupResult.productsSynced}`
    );

    return NextResponse.redirect(
      `${appUrl}/app/integraciones/conexiones?meta_success=${successMsg}`
    );
  } catch (error) {
    console.error('Error in Meta OAuth callback:', error);
    const msg = encodeURIComponent(
      error instanceof Error ? error.message : 'Error en el proceso de autenticación con Meta'
    );
    return NextResponse.redirect(`${appUrl}/app/integraciones/conexiones?meta_error=${msg}`);
  }
}
