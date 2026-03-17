import { NextRequest, NextResponse } from 'next/server';
import { expediaProductService } from '@/lib/services/integrations/expedia/expediaProductService';

/**
 * GET /api/integrations/expedia/room-types?connectionId=xxx
 * Obtener room types y rate plans de Expedia Product API.
 * Query: connectionId (required), withRatePlans (optional, default true)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const withRatePlans = searchParams.get('withRatePlans') !== 'false';

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    const roomTypes = withRatePlans
      ? await expediaProductService.getRoomTypesWithRatePlans(connectionId)
      : await expediaProductService.getRoomTypes(connectionId);

    return NextResponse.json({
      success: true,
      roomTypes,
      total: roomTypes.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaRoomTypes] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
