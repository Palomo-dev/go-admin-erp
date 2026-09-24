import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import {
  marketingConnectionInOrg,
  requestedCurrency,
  resolveOrgStoreDomain,
} from '@/lib/services/integrations/marketingAccess';

const ROUTE = 'integrations/tiktok/setup';

/**
 * POST /api/integrations/tiktok/setup
 * Setup completo: valida token, crea pixel + catálogo, sincroniza productos.
 *
 * Body: { connection_id, access_token, app_secret?, advertiser_id, currency? }.
 * La organización, su nombre y el dominio salen de la sesión / del servidor
 * (organización ajena en el body → 403 y registro). La conexión tiene que ser
 * `tiktok_marketing` de la organización de la sesión (si no, 404). Requiere admin.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as {
      connection_id?: unknown;
      access_token?: unknown;
      app_secret?: unknown;
      advertiser_id?: unknown;
      currency?: unknown;
    };

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const accessToken = str(body.access_token);
    const advertiserId = str(body.advertiser_id);

    if (!body.connection_id || !accessToken || !advertiserId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connection_id, access_token, advertiser_id' },
        { status: 400 }
      );
    }
    const pedida = requestedCurrency(body.currency);
    if (pedida === false) {
      return NextResponse.json({ error: 'currency debe ser un código ISO 4217 (p. ej. USD)' }, { status: 400 });
    }

    // La conexión se valida ANTES de llamar a TikTok o de escribir credenciales.
    if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'tiktok_marketing', ROUTE))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }
    const connectionId = body.connection_id as string;

    // 1. Verificar token primero
    const healthCheck = await tiktokMarketingService.healthCheck(accessToken, advertiserId);
    if (!healthCheck.valid) {
      return NextResponse.json(
        { error: `Token inválido: ${healthCheck.message}` },
        { status: 400 }
      );
    }

    // 2. Ejecutar setup completo
    const moneda = pedida || 'COP';
    const domain = await resolveOrgStoreDomain(ctx.supabase, ctx.organizationId);

    // Productos con el cliente de sesión; credenciales con service-role, ya
    // validada la conexión (su RLS decide admin por nombre de rol).
    const result = await tiktokMarketingService.fullSetup(
      connectionId,
      accessToken,
      str(body.app_secret),
      advertiserId,
      ctx.organizationId,
      ctx.organizationName || 'Mi Negocio',
      domain,
      moneda,
      ctx.supabase,
      getServiceClient()
    );

    return NextResponse.json({
      success: true,
      data: result,
      message: `Setup completado. Pixel: ${result.pixelName} (${result.pixelCode}), Catálogo: ${result.catalogName} (${result.catalogId}), Productos sincronizados: ${result.productsSynced}`,
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('Error in TikTok setup:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en el setup de TikTok' },
      { status: 500 }
    );
  }
}, { admin: true });
