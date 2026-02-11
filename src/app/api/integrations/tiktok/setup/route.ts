import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';

/**
 * POST /api/integrations/tiktok/setup
 * Setup completo: valida token, crea pixel + catálogo, sincroniza productos.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      connection_id,
      access_token,
      app_secret,
      advertiser_id,
      organization_id,
      organization_name,
      domain,
      currency,
    } = body as {
      connection_id: string;
      access_token: string;
      app_secret: string;
      advertiser_id: string;
      organization_id: number;
      organization_name: string;
      domain: string;
      currency?: string;
    };

    if (!connection_id || !access_token || !advertiser_id || !organization_id || !domain) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connection_id, access_token, advertiser_id, organization_id, domain' },
        { status: 400 }
      );
    }

    // 1. Verificar token primero
    const healthCheck = await tiktokMarketingService.healthCheck(access_token, advertiser_id);
    if (!healthCheck.valid) {
      return NextResponse.json(
        { error: `Token inválido: ${healthCheck.message}` },
        { status: 400 }
      );
    }

    // 2. Ejecutar setup completo
    const result = await tiktokMarketingService.fullSetup(
      connection_id,
      access_token,
      app_secret || '',
      advertiser_id,
      organization_id,
      organization_name || 'Mi Negocio',
      domain,
      currency || 'COP'
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: `Setup completado. Pixel: ${result.pixelName} (${result.pixelCode}), Catálogo: ${result.catalogName} (${result.catalogId}), Productos sincronizados: ${result.productsSynced}`,
    });
  } catch (error) {
    console.error('Error in TikTok setup:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en el setup de TikTok' },
      { status: 500 }
    );
  }
}
