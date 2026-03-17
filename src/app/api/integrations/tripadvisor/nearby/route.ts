import { NextRequest, NextResponse } from 'next/server';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';
import type { TripAdvisorSearchCategory, TripAdvisorRadiusUnit } from '@/lib/services/integrations/tripadvisor';

/**
 * GET /api/integrations/tripadvisor/nearby
 * Buscar ubicaciones cercanas por coordenadas (proxy server-side).
 * Query params: latLong (requerido), category, radius, radiusUnit, language
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latLong = searchParams.get('latLong');

    if (!latLong) {
      return NextResponse.json(
        { error: 'latLong es requerido (formato: lat,lng)' },
        { status: 400 },
      );
    }

    const result = await tripadvisorContentService.searchNearbyLocations({
      latLong,
      category: (searchParams.get('category') as TripAdvisorSearchCategory) || undefined,
      phone: searchParams.get('phone') || undefined,
      address: searchParams.get('address') || undefined,
      radius: searchParams.get('radius') ? Number(searchParams.get('radius')) : undefined,
      radiusUnit: (searchParams.get('radiusUnit') as TripAdvisorRadiusUnit) || undefined,
      language: searchParams.get('language') || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Error en búsqueda cercana' },
        { status: result.error?.code || 500 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API TripAdvisor Nearby] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
