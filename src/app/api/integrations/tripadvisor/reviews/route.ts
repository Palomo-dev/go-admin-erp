import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';

/**
 * GET /api/integrations/tripadvisor/reviews
 * Obtener reseñas de una ubicación (proxy server-side).
 * Query params: locationId (requerido), language
 */
/*
 * SEGURIDAD (GO-sec, 2026-09-24): proxy con la API Key de TripAdvisor de la
 * PLATAFORMA (entorno). Antes el handler no comprobaba nada (solo el
 * middleware): ahora exige sesión validada y organización activa
 * (`withOrg`), para que la cuota de la llave no la gaste cualquiera. El
 * contenido es público y no depende de la organización.
 */
export const GET = withOrg(async (_ctx, request) => {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');

    if (!locationId || !/^\d{1,15}$/.test(locationId)) {
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
});
