import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { metaMarketingService } from '@/lib/services/integrations/meta';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/integrations/meta/product-sync
 * Sincronización en tiempo real: se llama cuando un producto cambia.
 * Puede invocarse desde un webhook de Supabase (DB trigger) o manualmente.
 *
 * Body:
 * - organization_id: number (requerido)
 * - product_ids?: number[] (opcional, sync solo estos; si vacío, sync todos)
 * - action?: 'upsert' | 'delete' (default: 'upsert')
 */
export async function POST(request: NextRequest) {
  try {
    // Verificar API key para llamadas desde webhooks de Supabase
    const authHeader = request.headers.get('authorization');
    const apiKey = request.headers.get('x-api-key');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Permitir si viene con service role key o con sesión de usuario
    const isServiceCall = apiKey === serviceKey || authHeader === `Bearer ${serviceKey}`;

    if (!isServiceCall) {
      // Intentar autenticación de usuario normal
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
      const { cookies } = await import('next/headers');
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { organization_id, product_ids, action = 'upsert' } = body as {
      organization_id: number;
      product_ids?: number[];
      action?: 'upsert' | 'delete';
    };

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id es requerido' }, { status: 400 });
    }

    // Buscar conexión activa de Meta Marketing para esta organización
    const { data: connections } = await supabaseAdmin
      .from('integration_connections')
      .select(`
        id,
        organization_id,
        integration_connectors!inner ( code )
      `)
      .eq('organization_id', organization_id)
      .eq('status', 'active');

    const metaConn = (connections || []).find((c: Record<string, unknown>) => {
      const connector = c.integration_connectors as Record<string, unknown> | undefined;
      return connector?.code === 'meta_marketing';
    });

    if (!metaConn) {
      return NextResponse.json({
        success: false,
        message: 'No hay conexión activa de Meta Marketing para esta organización',
      });
    }

    const creds = await metaMarketingService.getCredentials(metaConn.id as string);
    if (!creds?.accessToken || !creds?.catalogId) {
      return NextResponse.json({
        success: false,
        message: 'Credenciales de Meta incompletas (falta access_token o catalog_id)',
      });
    }

    // Obtener dominio de la organización
    const { data: domainData } = await supabaseAdmin
      .from('organization_domains')
      .select('host')
      .eq('organization_id', organization_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .maybeSingle();

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('subdomain')
      .eq('id', organization_id)
      .single();

    const domain = domainData?.host || `${orgData?.subdomain || 'shop'}.goadmin.io`;

    if (action === 'delete' && product_ids && product_ids.length > 0) {
      // Eliminar productos del catálogo
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('sku')
        .in('id', product_ids);

      if (products && products.length > 0) {
        const apiUrl = `https://graph.facebook.com/v19.0/${creds.catalogId}/items_batch`;
        const requests = products.map((p: Record<string, unknown>) => ({
          method: 'DELETE',
          retailer_id: p.sku as string,
        }));

        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests }),
        });
      }

      return NextResponse.json({
        success: true,
        action: 'delete',
        count: products?.length || 0,
      });
    }

    // Upsert: sincronizar productos específicos o todos
    const allProducts = await metaMarketingService.getProductsForSync(organization_id, domain);
    const productsToSync = product_ids && product_ids.length > 0
      ? allProducts.filter((p) => product_ids.includes(p.id))
      : allProducts;

    if (productsToSync.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'Sin productos para sincronizar' });
    }

    const result = await metaMarketingService.syncCatalog(
      creds.accessToken,
      creds.catalogId,
      productsToSync
    );

    // Registrar evento de sync
    await supabaseAdmin.from('integration_events').insert({
      connection_id: metaConn.id,
      event_type: 'catalog.product_sync',
      payload: {
        action,
        product_ids: product_ids || 'all',
        total: result.total,
        created: result.created,
        errors: result.errors,
      },
      status: result.errors > 0 ? 'partial' : 'processed',
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in Meta product sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al sincronizar productos' },
      { status: 500 }
    );
  }
}
