import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { INTEGRATION_CONNECTION_USABLE_STATUS } from '@/lib/integrations/connectionStatus';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import { isUuid, resolveOrgStoreDomain } from '@/lib/services/integrations/marketingAccess';

const ROUTE = 'integrations/meta/product-sync';

type RouteParams = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * POST /api/integrations/meta/product-sync
 * Sincronización en tiempo real de productos al catálogo de Meta.
 *
 * Dos llamadores, y en ninguno la organización sale del body:
 *  - Usuario (sesión + admin, `withOrg({ admin: true })`): la organización es
 *    la de la sesión. Body: { connection_id?, product_ids?, action? }. Sin
 *    `connection_id` se usa la conexión `connected` de Meta Marketing de esa
 *    organización.
 *  - Servidor (cron/job): `Authorization: Bearer ${CRON_SECRET}` o
 *    `x-cron-secret` (`verifyCronSecret`: fail-closed y comparación en tiempo
 *    constante). Body: { connection_id (obligatorio), product_ids?, action? };
 *    la organización es la de ESA conexión.
 *  En los dos, una organización en el body o la query distinta de la
 *  efectiva → 403 y registro (`readOrgBody`).
 *
 * Antes: aceptaba `x-api-key` igual a la service-role key (comparación
 * normal, y la clave más poderosa del sistema viajando en una cabecera),
 * tomaba `organization_id` del body en los dos caminos y borraba del
 * catálogo los SKU de productos de CUALQUIER organización (`.in('id', …)`
 * sin filtro de organización).
 *
 * - product_ids?: number[] (sync solo estos; si vacío, sync todos)
 * - action?: 'upsert' | 'delete' (default: 'upsert')
 */
export async function POST(request: NextRequest, routeParams: RouteParams): Promise<Response> {
  if (isServerCall(request)) return serverSync(request);
  return sessionSync(request, routeParams);
}

/** Petición servidor a servidor: trae credencial de cron (o la cabecera legacy, que se rechaza). */
function isServerCall(request: Request): boolean {
  return Boolean(
    request.headers.get('authorization') || request.headers.get('x-cron-secret') || request.headers.get('x-api-key')
  );
}

interface SyncInput {
  connectionId: unknown;
  productIds: number[];
  action: 'upsert' | 'delete';
}

/** Valida el body (sin la organización, que nunca se usa). `null` = 400. */
function parseInput(body: Record<string, unknown>): SyncInput | null {
  const action = body.action ?? 'upsert';
  if (action !== 'upsert' && action !== 'delete') return null;
  let productIds: number[] = [];
  if (body.product_ids != null) {
    const ids = body.product_ids;
    if (!Array.isArray(ids) || ids.length > 5000 || !ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
      return null;
    }
    productIds = ids as number[];
  }
  return { connectionId: body.connection_id, productIds, action };
}

const BAD_REQUEST = { error: 'Body inválido: product_ids (enteros positivos) y action (upsert | delete)' };

interface MetaConnection {
  id: string;
  organization_id: number;
}

/**
 * Conexión `connected` de Meta Marketing. Con `organizationId` filtra por esa
 * organización; con `connectionId` busca esa conexión. Nunca devuelve una de
 * otro conector ni en otro estado.
 */
async function findMetaConnection(
  db: SupabaseClient,
  filter: { organizationId?: number; connectionId?: string }
): Promise<MetaConnection | null> {
  let query = db
    .from('integration_connections')
    .select('id, organization_id, integration_connectors!inner ( code )')
    .eq('status', INTEGRATION_CONNECTION_USABLE_STATUS);
  if (filter.organizationId != null) query = query.eq('organization_id', filter.organizationId);
  if (filter.connectionId != null) query = query.eq('id', filter.connectionId);
  const { data: connections } = await query;

  const found = ((connections ?? []) as Array<Record<string, unknown>>).find((c) => {
    const rel = c.integration_connectors as { code?: string } | Array<{ code?: string }> | undefined;
    const code = Array.isArray(rel) ? rel[0]?.code : rel?.code;
    if (code !== 'meta_marketing') return false;
    // Defensa en profundidad: el filtro ya lo exige.
    return filter.organizationId == null || c.organization_id === filter.organizationId;
  });
  return found ? { id: found.id as string, organization_id: found.organization_id as number } : null;
}

// ─── Servidor a servidor ─────────────────────────────────────────────────────

async function serverSync(request: NextRequest): Promise<Response> {
  if (request.headers.get('x-api-key') && !request.headers.get('authorization') && !request.headers.get('x-cron-secret')) {
    console.warn(`[${ROUTE}] cabecera x-api-key rechazada: usar Authorization: Bearer CRON_SECRET`);
    return NextResponse.json({ error: 'cron_unauthorized' }, { status: 401 });
  }
  try {
    verifyCronSecret(request);
  } catch (err) {
    if (err instanceof WebhookError) return NextResponse.json({ error: err.code }, { status: err.statusCode });
    throw err;
  }

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 });
    }
    const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const input = parseInput(body);
    if (!input) return NextResponse.json(BAD_REQUEST, { status: 400 });
    if (!isUuid(input.connectionId)) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }

    // La organización sale de la CONEXIÓN, nunca del body.
    const service = getServiceClient();
    const connection = await findMetaConnection(service, { connectionId: input.connectionId });
    if (!connection) return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });

    readOrgBody({ organizationId: connection.organization_id }, body, { request, route: ROUTE });

    return await syncConnection(connection, input, service, service);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    return serverError(error);
  }
}

// ─── Usuario con sesión ──────────────────────────────────────────────────────

const sessionSync = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as Record<string, unknown>;
    const input = parseInput(body);
    if (!input) return NextResponse.json(BAD_REQUEST, { status: 400 });

    let connection: MetaConnection | null;
    if (input.connectionId != null && input.connectionId !== '') {
      connection = isUuid(input.connectionId)
        ? await findMetaConnection(ctx.supabase, { organizationId: ctx.organizationId, connectionId: input.connectionId })
        : null;
      if (!connection) {
        console.warn(`[${ROUTE}] conexión rechazada`, {
          connectionId: String(input.connectionId).slice(0, 64),
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        });
        return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
      }
    } else {
      connection = await findMetaConnection(ctx.supabase, { organizationId: ctx.organizationId });
      if (!connection) {
        return NextResponse.json({
          success: false,
          message: 'No hay conexión activa de Meta Marketing para esta organización',
        });
      }
    }

    return await syncConnection(connection, input, ctx.supabase, getServiceClient());
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return serverError(error);
  }
}, { admin: true });

// ─── Sincronización (organización ya resuelta) ──────────────────────────────

/**
 * `db` lee productos y dominio (sesión en el camino de usuario); `service`
 * solo credenciales y el evento de la conexión ya validada.
 */
async function syncConnection(
  connection: MetaConnection,
  input: SyncInput,
  db: SupabaseClient,
  service: SupabaseClient
): Promise<Response> {
  const organizationId = connection.organization_id;
  const { productIds, action } = input;

  const creds = await metaMarketingService.getCredentials(connection.id, service);
  if (!creds?.accessToken || !creds?.catalogId) {
    return NextResponse.json({
      success: false,
      message: 'Credenciales de Meta incompletas (falta access_token o catalog_id)',
    });
  }

  if (action === 'delete' && productIds.length > 0) {
    // Solo SKU de productos de ESTA organización.
    const { data: products } = await db
      .from('products')
      .select('sku')
      .eq('organization_id', organizationId)
      .in('id', productIds);

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
  const domain = await resolveOrgStoreDomain(db, organizationId);
  const allProducts = await metaMarketingService.getProductsForSync(organizationId, domain, undefined, db);
  const productsToSync = productIds.length > 0 ? allProducts.filter((p) => productIds.includes(p.id)) : allProducts;

  if (productsToSync.length === 0) {
    return NextResponse.json({ success: true, synced: 0, message: 'Sin productos para sincronizar' });
  }

  const result = await metaMarketingService.syncCatalog(creds.accessToken, creds.catalogId, productsToSync);

  // Registrar evento de sync. Columnas y CHECK verificados: `source` y
  // `direction` son NOT NULL y `status` solo admite received|processed|error.
  await service.from('integration_events').insert({
    connection_id: connection.id,
    organization_id: organizationId,
    source: 'sync',
    direction: 'outbound',
    event_type: 'catalog.product_sync',
    payload: {
      action,
      product_ids: productIds.length > 0 ? productIds : 'all',
      total: result.total,
      created: result.created,
      errors: result.errors,
    },
    status: result.errors > 0 ? 'error' : 'processed',
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, data: result });
}

function serverError(error: unknown): Response {
  console.error('Error in Meta product sync:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Error al sincronizar productos' },
    { status: 500 }
  );
}
