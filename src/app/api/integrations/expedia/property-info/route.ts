import { NextRequest, NextResponse } from 'next/server';
import { expediaProductService } from '@/lib/services/integrations/expedia/expediaProductService';

/**
 * GET /api/integrations/expedia/property-info?connectionId=xxx
 * Obtener información de la propiedad + room types desde Expedia.
 * Query: connectionId (required), full (optional, default false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const full = searchParams.get('full') === 'true';

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (full) {
      const summary = await expediaProductService.getFullPropertySummary(connectionId);
      return NextResponse.json({ success: true, ...summary });
    }

    const property = await expediaProductService.getPropertyInfo(connectionId);

    if (!property) {
      return NextResponse.json(
        { success: false, message: 'No se pudo obtener información de la propiedad' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, property });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPropertyInfo] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
