import { NextRequest, NextResponse } from 'next/server';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';

/**
 * GET /api/integrations/tripadvisor/reviews
 * Obtener reseñas de una ubicación (proxy server-side).
 * Query params: locationId (requerido), language
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

    const result = await tripadvisorContentService.getLocationReviews(locationId, {
      language: searchParams.get('language') || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Error obteniendo reseñas' },
        { status: result.error?.code || 500 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API TripAdvisor Reviews] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
