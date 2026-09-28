import { NextRequest, NextResponse } from 'next/server';
import {
  generateFacebookFeedCSV,
  validateFeedToken,
  monedaPorDefectoFeed,
  registrarLecturaFeed,
  InvalidCurrencyError,
  RateUnavailableError,
} from '@/lib/services/facebookFeedService';

/**
 * GET /api/facebook-feed?org_id=123&token=abc[&currency=USD]
 *
 * Feed público del catálogo para Meta Commerce Manager (Facebook e Instagram).
 * Sin sesión: la autenticación es el token de ESA organización, comparado en
 * tiempo constante (`validateFeedToken`). Un token de otra organización no
 * sirve: se busca el token guardado para `org_id` y se compara con el recibido.
 *
 * Qué sale: solo productos `active`, no servicios, con precio e imagen, de
 * `org_id` (las variantes agrupadas por `item_group_id`). Nada de costos,
 * proveedores ni notas. Formato y exclusiones en `facebookCatalog/formatoMeta.ts`.
 *
 * Moneda: la de `currency` si viene; si no, la moneda por defecto elegida en el
 * diálogo; si no, la base de la organización.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const token = searchParams.get('token');

    if (!orgId || !token) {
      return NextResponse.json({ error: 'org_id y token son requeridos' }, { status: 400 });
    }
    const organizationId = Number.parseInt(orgId, 10);
    if (!Number.isFinite(organizationId) || organizationId <= 0 || String(organizationId) !== orgId.trim()) {
      return NextResponse.json({ error: 'org_id debe ser un número válido' }, { status: 400 });
    }
    if (token.length > 200 || !(await validateFeedToken(organizationId, token))) {
      return NextResponse.json({ error: 'Token inválido o no autorizado' }, { status: 403 });
    }

    const pedida = searchParams.get('currency')?.trim();
    if (pedida && !/^[A-Za-z]{3}$/.test(pedida)) {
      return NextResponse.json({ error: { code: 'INVALID_CURRENCY', message: 'La moneda debe ser un código de 3 letras', details: { currency: pedida } } }, { status: 400 });
    }
    const moneda = pedida ? pedida.toUpperCase() : await monedaPorDefectoFeed(organizationId);

    const { csv, count, rateDate } = await generateFacebookFeedCSV(organizationId, moneda);
    if (count === 0) {
      return NextResponse.json({ error: 'No hay productos activos para exportar' }, { status: 404 });
    }

    await registrarLecturaFeed(organizationId, { productos: count, moneda: moneda ?? 'base', agente: request.headers.get('user-agent') });

    // Commerce Manager exige text/csv inline y sin BOM. La caché de CDN es
    // corta: un token regenerado deja de servir en ≤ 15 min aunque la URL vieja
    // estuviera cacheada.
    const headers: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=300, s-maxage=900',
      'X-Product-Count': String(count),
      'Access-Control-Allow-Origin': '*',
    };
    if (moneda) {
      headers['X-Feed-Currency'] = moneda;
      if (rateDate) headers['X-Rate-Date'] = rateDate;
    }
    return new NextResponse(csv, { status: 200, headers });
  } catch (error: unknown) {
    if (error instanceof InvalidCurrencyError) {
      return NextResponse.json({ error: { code: 'INVALID_CURRENCY', message: error.message, details: { currency: error.currency } } }, { status: 400 });
    }
    if (error instanceof RateUnavailableError) {
      return NextResponse.json({ error: { code: 'RATE_UNAVAILABLE', message: error.message, details: { currency: error.currency } } }, { status: 503 });
    }
    console.error('Error in GET /api/facebook-feed:', error);
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } }, { status: 500 });
  }
}
