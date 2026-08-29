import { NextRequest, NextResponse } from 'next/server';
import {
  generateFacebookFeedCSV,
  validateFeedToken,
  InvalidCurrencyError,
  RateUnavailableError,
} from '@/lib/services/facebookFeedService';

/**
 * GET /api/facebook-feed?org_id=123&token=abc
 *
 * Retorna un CSV con el catálogo de productos en formato Facebook Commerce Manager.
 * Facebook puede programar la lectura de esta URL para sincronizar el catálogo automáticamente.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');
    const token = searchParams.get('token');

    if (!orgId || !token) {
      return NextResponse.json(
        { error: 'org_id y token son requeridos' },
        { status: 400 }
      );
    }

    const organizationId = parseInt(orgId, 10);
    if (isNaN(organizationId)) {
      return NextResponse.json(
        { error: 'org_id debe ser un número válido' },
        { status: 400 }
      );
    }

    // Validar token
    const isValid = await validateFeedToken(organizationId, token);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Token inválido o no autorizado' },
        { status: 403 }
      );
    }

    // Leer parámetro opcional de moneda destino
    const currency = searchParams.get('currency');
    const hasCurrency = !!currency && currency.trim() !== '';
    const targetCurrency = hasCurrency ? currency!.toUpperCase() : undefined;

    // Generar CSV
    const result = await generateFacebookFeedCSV(organizationId, targetCurrency);
    const { csv, count, rateDate } = result;

    if (count === 0) {
      return NextResponse.json(
        { error: 'No hay productos activos para exportar' },
        { status: 404 }
      );
    }

    // Retornar CSV con headers compatibles con Facebook Commerce Manager
    // Facebook requiere: Content-Type text/csv, Content-Disposition inline (no attachment)
    // Sin BOM (\uFEFF) porque Facebook puede no reconocer el formato
    const headers: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600',
      'X-Product-Count': String(count),
      'Access-Control-Allow-Origin': '*',
    };

    // Headers adicionales para feed multi-moneda
    if (hasCurrency && targetCurrency) {
      headers['X-Feed-Currency'] = targetCurrency;
      if (rateDate) {
        headers['X-Rate-Date'] = rateDate;
      }
    }

    return new NextResponse(csv, {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    if (error instanceof InvalidCurrencyError) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CURRENCY',
            message: error.message,
            details: { currency: error.currency },
          },
        },
        { status: 400 }
      );
    }
    if (error instanceof RateUnavailableError) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_UNAVAILABLE',
            message: error.message,
            details: { currency: error.currency },
          },
        },
        { status: 503 }
      );
    }
    console.error('Error in GET /api/facebook-feed:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Error interno del servidor' } },
      { status: 500 }
    );
  }
}
