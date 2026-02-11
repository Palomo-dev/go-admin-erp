import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { metaMarketingService } from '@/lib/services/integrations/meta';

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
    const { connection_id, organization_id, domain, currency } = body as {
      connection_id: string;
      organization_id: number;
      domain: string;
      currency?: string;
    };

    if (!connection_id || !organization_id || !domain) {
      return NextResponse.json(
        { error: 'connection_id, organization_id y domain son requeridos' },
        { status: 400 }
      );
    }

    const credentials = await metaMarketingService.getCredentials(connection_id);
    if (!credentials?.accessToken || !credentials?.catalogId) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Meta Marketing (access_token y catalog_id requeridos)' },
        { status: 404 }
      );
    }

    // Obtener productos de la organización
    const products = await metaMarketingService.getProductsForSync(
      organization_id,
      domain,
      currency || 'COP'
    );

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, created: 0, updated: 0, errors: 0, details: ['Sin productos activos para sincronizar'] },
      });
    }

    // Sincronizar al catálogo de Facebook
    const result = await metaMarketingService.syncCatalog(
      credentials.accessToken,
      credentials.catalogId,
      products,
      currency || 'COP'
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error syncing Meta catalog:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al sincronizar catálogo' },
      { status: 500 }
    );
  }
}
