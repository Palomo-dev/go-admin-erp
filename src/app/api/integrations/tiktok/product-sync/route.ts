import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';

/**
 * POST /api/integrations/tiktok/product-sync
 * Sincronización incremental: procesa cambios individuales de productos.
 * Disparado por triggers de BD o manualmente.
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

    const { connection_id, organization_id, product_ids, domain, currency } =
      await request.json();

    if (!connection_id || !organization_id) {
      return NextResponse.json(
        { error: 'Se requieren connection_id y organization_id' },
        { status: 400 }
      );
    }

    const creds = await tiktokMarketingService.getCredentials(connection_id);
    if (!creds?.accessToken || !creds?.advertiserId || !creds?.catalogId) {
      return NextResponse.json(
        { error: 'Credenciales incompletas. Ejecuta el setup primero.' },
        { status: 400 }
      );
    }

    // Obtener dominio
    let finalDomain = domain;
    if (!finalDomain) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('subdomain')
        .eq('id', organization_id)
        .single();

      const { data: domainData } = await supabase
        .from('organization_domains')
        .select('host')
        .eq('organization_id', organization_id)
        .eq('is_primary', true)
        .eq('is_active', true)
        .maybeSingle();

      finalDomain = domainData?.host || `${orgData?.subdomain || 'shop'}.goadmin.io`;
    }

    // Obtener productos específicos o todos los pendientes
    let products = await tiktokMarketingService.getProductsForSync(
      organization_id,
      finalDomain,
      currency || 'COP'
    );

    // Filtrar por IDs específicos si se proporcionan
    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      products = products.filter((p) => product_ids.includes(p.id));
    }

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, created: 0, updated: 0, errors: 0, details: ['Sin productos para sincronizar'] },
      });
    }

    const result = await tiktokMarketingService.syncCatalog(
      creds.accessToken,
      creds.advertiserId,
      creds.catalogId,
      products,
      currency || 'COP'
    );

    // Marcar eventos pendientes como procesados
    if (product_ids && product_ids.length > 0) {
      await supabase
        .from('integration_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('connection_id', connection_id)
        .eq('status', 'pending')
        .in('event_type', ['catalog.product_changed', 'catalog.price_changed']);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in TikTok product sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en sincronización' },
      { status: 500 }
    );
  }
}
