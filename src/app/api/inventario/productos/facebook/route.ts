import { generarFeedMeta, InvalidCurrencyError, RateUnavailableError } from '@/lib/services/facebookFeedService';
import { jsonError, readOrgBody, withOrg } from '@/lib/utils/orgContext';

/**
 * GET /api/inventario/productos/facebook?formato=csv|resumen[&currency=USD]
 *
 * Con sesión (`withOrg`): la organización es la de la sesión. Mismo generador
 * que el feed público (`generarFeedMeta`), así lo que se descarga es
 * exactamente lo que lee Meta.
 *   - `csv`: el catálogo en formato Meta, como descarga (sin BOM, igual que el feed).
 *   - `resumen`: incluidos, excluidos con motivo (hasta 500) y moneda.
 */
export const GET = withOrg(async (ctx, request) => {
  // Regla 5: una organización en la query distinta de la sesión es 403.
  readOrgBody(ctx, {}, { route: 'inventario/productos/facebook', request });
  const url = new URL(request.url);
  const formato = url.searchParams.get('formato') === 'csv' ? 'csv' : 'resumen';
  const moneda = url.searchParams.get('currency')?.trim() || null;
  if (moneda && !/^[A-Za-z]{3}$/.test(moneda)) return jsonError(400, 'INVALID_CURRENCY', 'La moneda debe ser un código de 3 letras');

  try {
    const feed = await generarFeedMeta(ctx.organizationId, moneda);
    if (formato === 'csv') {
      return new Response(feed.csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="catalogo_meta_${feed.moneda.toLowerCase()}.csv"`,
          'Cache-Control': 'no-store',
          'X-Product-Count': String(feed.filas.length),
        },
      });
    }
    return Response.json({
      moneda: feed.moneda,
      moneda_base: feed.monedaBase,
      rate_date: feed.rateDate ?? null,
      resumen: feed.resumen,
      excluidos: feed.excluidos.filter((e) => e.motivo !== 'padreConVariantes').slice(0, 500),
    });
  } catch (error) {
    if (error instanceof InvalidCurrencyError) return jsonError(400, 'INVALID_CURRENCY', error.message);
    if (error instanceof RateUnavailableError) return jsonError(503, 'RATE_UNAVAILABLE', error.message);
    console.error('[inventario/productos/facebook]', error);
    return jsonError(500, 'INTERNAL', 'No se pudo generar el catálogo de Meta');
  }
});
