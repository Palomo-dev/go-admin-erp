import { NextRequest, NextResponse } from 'next/server';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';
import type { TripAdvisorSearchCategory, TripAdvisorRadiusUnit } from '@/lib/services/integrations/tripadvisor';

/**
 * GET /api/integrations/tripadvisor/search
 * Buscar ubicaciones por texto (proxy server-side para proteger API Key).
 * Query params: searchQuery, category, phone, address, latLong, radius, radiusUnit, language
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('searchQuery');

    if (!searchQuery) {
      return NextResponse.json(
        { error: 'searchQuery es requerido' },
        { status: 400 },
      );
    }

    const result = await tripadvisorContentService.searchLocations({
      searchQuery,
      category: (searchParams.get('category') as TripAdvisorSearchCategory) || undefined,
      phone: searchParams.get('phone') || undefined,
      address: searchParams.get('address') || undefined,
      latLong: searchParams.get('latLong') || undefined,
      radius: searchParams.get('radius') ? Number(searchParams.get('radius')) : undefined,
      radiusUnit: (searchParams.get('radiusUnit') as TripAdvisorRadiusUnit) || undefined,
      language: searchParams.get('language') || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Error en búsqueda' },
        { status: result.error?.code || 500 },
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API TripAdvisor Search] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
