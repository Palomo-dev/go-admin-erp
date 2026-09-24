import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import {
  marketingConnectionInOrg,
  requestedCurrency,
  resolveOrgStoreDomain,
} from '@/lib/services/integrations/marketingAccess';

const ROUTE = 'integrations/meta/catalog-sync';

/**
 * POST /api/integrations/meta/catalog-sync
 * Sincroniza los productos activos de la organización DE LA SESIÓN al catálogo
 * de Facebook de una conexión suya.
 *
 * Body: { connection_id: uuid, currency?: ISO 4217 }. Una organización en el
 * body distinta de la de la sesión → 403 y registro (`readOrgBody`). La
 * conexión tiene que ser `meta_marketing` de esa organización (si no, 404 sin
 * revelar si existe en otra). El dominio lo calcula el servidor.
 * Requiere admin (`withOrg({ admin: true })`: rol 1/2, super admin o permiso).
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as {
      connection_id?: unknown;
      currency?: unknown;
    };

    if (!body.connection_id) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }
    const pedida = requestedCurrency(body.currency);
    if (pedida === false) {
      return NextResponse.json({ error: 'currency debe ser un código ISO 4217 (p. ej. USD)' }, { status: 400 });
    }

    if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'meta_marketing', ROUTE))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }
    const connectionId = body.connection_id as string;

    // Service-role SOLO para `integration_credentials`, con la conexión ya
    // validada contra la organización de la sesión: su RLS decide admin por
    // NOMBRE de rol y dejaría fuera a un admin por permiso (regla dura 6).
    const credentials = await metaMarketingService.getCredentials(connectionId, getServiceClient());
    if (!credentials?.accessToken || !credentials?.catalogId) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Meta Marketing (access_token y catalog_id requeridos)' },
        { status: 404 }
      );
    }

    const moneda = pedida || 'COP';
    const domain = await resolveOrgStoreDomain(ctx.supabase, ctx.organizationId);

    const products = await metaMarketingService.getProductsForSync(ctx.organizationId, domain, moneda, ctx.supabase);

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
      moneda
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('Error syncing Meta catalog:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al sincronizar catálogo' },
      { status: 500 }
    );
  }
}, { admin: true });
