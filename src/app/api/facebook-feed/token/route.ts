import {
  regenerateFeedToken,
  getFeedConfig,
  getFeedCurrencies,
  getOrCreateFeedToken,
  setDefaultFeedCurrency,
  InvalidCurrencyError,
} from '@/lib/services/facebookFeedService';
import { puedeGestionarFeedMeta } from '@/lib/services/productosPermisos';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

/**
 * POST /api/facebook-feed/token
 * Body: { action: 'get' | 'get_token' | 'get_currencies' | 'regenerate' | 'set_default_currency', currency?: string }
 *
 * La organización sale de la sesión (`withOrg`), nunca del body: si el body
 * trae otra, 403 `FOREIGN_ORGANIZATION` y registro (regla dura 5). Leer el
 * token es de cualquier miembro activo (ya lo ve en `organization_preferences`);
 * regenerarlo o cambiar la moneda exige permiso resuelto en el servidor.
 */
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ action?: string; currency?: unknown }>(ctx, request, { route: 'facebook-feed/token' });
  const orgId = ctx.organizationId;
  const action = typeof body.action === 'string' ? body.action : 'get';

  try {
    if (action === 'regenerate' || action === 'set_default_currency') {
      if (!(await puedeGestionarFeedMeta(ctx))) return jsonError(403, 'FORBIDDEN', 'No tienes permiso para gestionar el feed de Meta');
    }

    if (action === 'set_default_currency') {
      const currency = typeof body.currency === 'string' ? body.currency.trim() : '';
      if (!/^[A-Za-z]{3}$/.test(currency)) return jsonError(400, 'INVALID_CURRENCY', 'La moneda debe ser un código de 3 letras');
      return Response.json(await setDefaultFeedCurrency(orgId, currency));
    }

    if (action === 'get_token') {
      return Response.json({ success: true, token: await getOrCreateFeedToken(orgId) });
    }

    if (action === 'get_currencies') {
      const cfg = await getFeedCurrencies(orgId);
      return Response.json({ success: true, currencies: cfg.currencies, rate_date: cfg.rateDate, default_currency: cfg.defaultCurrency, base_currency: cfg.baseCurrency });
    }

    if (action === 'regenerate') await regenerateFeedToken(orgId);

    const config = await getFeedConfig(orgId);
    return Response.json({
      success: true,
      organization_id: orgId,
      token: config.token,
      token_created_at: config.tokenCreadoEn,
      last_read: config.ultimaLectura,
      currencies: config.currencies,
      rate_date: config.rateDate,
      default_currency: config.defaultCurrency,
      base_currency: config.baseCurrency,
    });
  } catch (error: unknown) {
    if (error instanceof InvalidCurrencyError) return jsonError(400, 'INVALID_CURRENCY', error.message);
    console.error('Error in POST /api/facebook-feed/token:', error);
    return jsonError(500, 'INTERNAL', 'Error interno del servidor');
  }
});
