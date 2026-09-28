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

const ROUTE = 'integrations/tiktok/catalog-sync';

/**
 * POST /api/integrations/tiktok/catalog-sync
 * Sincronización completa de todos los productos activos al catálogo de TikTok.
 *
 * Body: { connection_id: uuid, currency?: ISO 4217 }. La organización sale de
 * la sesión (organización ajena en el body → 403 y registro); la conexión
 * tiene que ser `tiktok_marketing` de esa organización (si no, 404). El
 * dominio lo calcula el servidor. Requiere admin.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as {
      connection_id?: unknown;
      currency?: unknown;
    };

    if (!body.connection_id) {
      return NextResponse.json({ error: 'Se requiere connection_id' }, { status: 400 });
    }
    const pedida = requestedCurrency(body.currency);
    if (pedida === false) {
      return NextResponse.json({ error: 'currency debe ser un código ISO 4217 (p. ej. USD)' }, { status: 400 });
    }

    if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'tiktok_marketing', ROUTE))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }
    const connectionId = body.connection_id as string;

    // Service-role SOLO para credenciales, con la conexión ya validada.
    const creds = await tiktokMarketingService.getCredentials(connectionId, getServiceClient());
    if (!creds?.accessToken || !creds?.advertiserId || !creds?.catalogId) {
      return NextResponse.json(
        { error: 'Credenciales incompletas. Ejecuta el setup primero.' },
        { status: 400 }
      );
    }

    const domain = await resolveOrgStoreDomain(ctx.supabase, ctx.organizationId);

    // Moneda del catálogo: la pedida o, si no viene, la base de la organización
    // (resolveOrgCurrency), no 'COP' fijo.
    const moneda = pedida || (await resolveOrgCurrency(ctx.supabase, ctx.organizationId)).code;

    const products = await tiktokMarketingService.getProductsForSync(ctx.organizationId, domain, moneda, ctx.supabase);

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, created: 0, updated: 0, errors: 0, details: ['No hay productos activos'] },
      });
    }

    const result = await tiktokMarketingService.syncCatalog(
      creds.accessToken,
      creds.advertiserId,
      creds.catalogId,
      products,
      moneda
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('Error in TikTok catalog sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en sincronización' },
      { status: 500 }
    );
  }
}, { admin: true });
