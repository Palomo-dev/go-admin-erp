import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { CONNECTION_NOT_FOUND } from '@/lib/services/integrations/channelManagerAccess';
import {
  marketingConnectionInOrg,
  requestedCurrency,
  resolveOrgStoreDomain,
} from '@/lib/services/integrations/marketingAccess';

const ROUTE = 'integrations/meta/setup';

/**
 * POST /api/integrations/meta/setup
 * Setup completo: valida token, crea catálogo + pixel, sincroniza productos.
 * Se llama después de crear la conexión en el wizard.
 *
 * Body: { connection_id, access_token, app_secret?, business_id,
 * ad_account_id?, currency? }. La organización, su nombre y el dominio de la
 * tienda salen de la SESIÓN / del servidor; una organización ajena en el body
 * → 403 y registro. La conexión tiene que ser `meta_marketing` de la
 * organización de la sesión (si no, 404). Requiere admin.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = ((await readOrgBody(ctx, request, { route: ROUTE })) ?? {}) as {
      connection_id?: unknown;
      access_token?: unknown;
      app_secret?: unknown;
      business_id?: unknown;
      ad_account_id?: unknown;
      currency?: unknown;
    };

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const accessToken = str(body.access_token);
    const businessId = str(body.business_id);
    const appSecret = str(body.app_secret);

    if (!body.connection_id || !accessToken || !businessId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connection_id, access_token, business_id' },
        { status: 400 }
      );
    }
    const pedida = requestedCurrency(body.currency);
    if (pedida === false) {
      return NextResponse.json({ error: 'currency debe ser un código ISO 4217 (p. ej. USD)' }, { status: 400 });
    }

    // La conexión se valida ANTES de llamar a Meta o de escribir credenciales.
    if (!(await marketingConnectionInOrg(ctx, body.connection_id, 'meta_marketing', ROUTE))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }
    const connectionId = body.connection_id as string;

    // 1. Verificar token primero
    const healthCheck = await metaMarketingService.healthCheck(accessToken, appSecret);
    if (!healthCheck.valid) {
      return NextResponse.json(
        { error: `Token inválido: ${healthCheck.message}` },
        { status: 400 }
      );
    }

    // 2. Obtener Ad Account del business si no se proveyó
    let adAccountId = str(body.ad_account_id);
    if (!adAccountId) {
      const adAccounts = await metaMarketingService.getAdAccounts(accessToken, businessId);
      if (adAccounts.length === 0) {
        return NextResponse.json(
          { error: 'No se encontraron cuentas publicitarias (Ad Accounts) en el Business Manager. Se requiere al menos una Ad Account activa para crear el Pixel.' },
          { status: 400 }
        );
      }
      adAccountId = (adAccounts.find((a) => a.account_status === 1) || adAccounts[0]).id;
    }

    // 3. Ejecutar setup completo (crear catálogo + pixel + sync productos)
    // Moneda del catálogo: la pedida o, si no viene, la base de la organización
    // (resolveOrgCurrency), no 'COP' fijo.
    const moneda = pedida || (await resolveOrgCurrency(ctx.supabase, ctx.organizationId)).code;
    const domain = await resolveOrgStoreDomain(ctx.supabase, ctx.organizationId);

    // Productos con el cliente de sesión; credenciales con service-role, ya
    // validada la conexión (su RLS decide admin por nombre de rol).
    const result = await metaMarketingService.fullSetup(
      connectionId,
      accessToken,
      appSecret,
      businessId,
      adAccountId,
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
      message: `Setup completado. Catálogo: ${result.catalogName} (${result.catalogId}), Pixel: ${result.pixelName} (${result.pixelId}), Productos sincronizados: ${result.productsSynced}`,
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    console.error('Error in Meta setup:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error en el setup de Meta' },
      { status: 500 }
    );
  }
}, { admin: true });
