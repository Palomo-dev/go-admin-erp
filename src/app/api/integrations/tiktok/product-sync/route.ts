import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import {
  marketingConnectionInOrg,
  requestedCurrency,
  resolveOrgStoreDomain,
} from '@/lib/services/integrations/marketingAccess';

const ROUTE = 'integrations/tiktok/product-sync';

/**
 * POST /api/integrations/tiktok/product-sync
 * Sincronización incremental: procesa cambios individuales de productos.
 *
 * Body: { connection_id: uuid, product_ids?: number[], currency?: ISO 4217 }.
 * La organización sale de la sesión (organización ajena en el body → 403 y
 * registro); la conexión tiene que ser `tiktok_marketing` de esa organización
 * (si no, 404). `product_ids` solo FILTRA los productos de la organización de
 * la sesión: un id de otra organización nunca llega a TikTok. Requiere admin.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as {
      connection_id?: unknown;
      product_ids?: unknown;
      currency?: unknown;
    };

    if (!body.connection_id) {
      return NextResponse.json({ error: 'Se requiere connection_id' }, { status: 400 });
    }
    let productIds: number[] = [];
    if (body.product_ids != null) {
      const ok =
        Array.isArray(body.product_ids) &&
        body.product_ids.length <= 5000 &&
        body.product_ids.every((id) => Number.isInteger(id) && (id as number) > 0);
      if (!ok) {
        return NextResponse.json({ error: 'product_ids debe ser una lista de ids enteros positivos' }, { status: 400 });
      }
      productIds = body.product_ids as number[];
    }
    const pedida = requestedCurrency(body.currency);
    if (pedida === false) {
      return NextResponse.json({ error: 'currency debe ser un código ISO 4217 (p. ej. USD)' }, { status: 400 });
    }

    if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'tiktok_marketing', ROUTE))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }
    const connectionId = body.connection_id as string;

    // Service-role SOLO para credenciales y eventos de ESTA conexión, ya
    // validada contra la organización de la sesión.
    const service = getServiceClient();
    const creds = await tiktokMarketingService.getCredentials(connectionId, service);
    if (!creds?.accessToken || !creds?.advertiserId || !creds?.catalogId) {
      return NextResponse.json(
        { error: 'Credenciales incompletas. Ejecuta el setup primero.' },
        { status: 400 }
      );
    }

    const domain = await resolveOrgStoreDomain(ctx.supabase, ctx.organizationId);

    // Obtener productos específicos o todos los pendientes
    // Moneda del catálogo: la pedida o, si no viene, la base de la organización
    // (resolveOrgCurrency), no 'COP' fijo.
    const moneda = pedida || (await resolveOrgCurrency(ctx.supabase, ctx.organizationId)).code;

    let products = await tiktokMarketingService.getProductsForSync(ctx.organizationId, domain, moneda, ctx.supabase);

    // Filtrar por IDs específicos si se proporcionan
    if (productIds.length > 0) {
      products = products.filter((p) => productIds.includes(p.id));
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
      moneda
    );

    // Marcar eventos pendientes como procesados (integration_events no tiene
    // política UPDATE para `authenticated`: con el cliente de sesión no haría nada).
    // «Pendiente» es `received`: el CHECK solo admite received|processed|error;
    // el filtro anterior por 'pending' no casaba nunca con ninguna fila.
    if (productIds.length > 0) {
      await service
        .from('integration_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('connection_id', connectionId)
        .eq('status', 'received')
        .in('event_type', ['catalog.product_changed', 'catalog.price_changed']);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('Error in TikTok product sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en sincronización' },
      { status: 500 }
    );
  }
}, { admin: true });
