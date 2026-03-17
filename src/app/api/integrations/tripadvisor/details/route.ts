import { NextRequest, NextResponse } from 'next/server';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';

/**
 * GET /api/integrations/tripadvisor/details
 * Obtener detalles de una ubicación (proxy server-side).
 * Query params: locationId (requerido), language, currency
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');

    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId es requerido' },
        { status: 400 },
      );
    }

    const result = await tripadvisorContentService.getLocationDetails(locationId, {
      language: searchParams.get('language') || undefined,
      currency: searchParams.get('currency') || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Error obteniendo detalles' },
        { status: result.error?.code || 500 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API TripAdvisor Details] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
