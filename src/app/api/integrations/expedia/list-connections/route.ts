import { NextRequest, NextResponse } from 'next/server';
import { expediaConnectionService } from '@/lib/services/integrations/expedia';

/**
 * GET /api/integrations/expedia/list-connections?organizationId=123
 * Obtener todas las conexiones Expedia Group de una organización.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    const connections = await expediaConnectionService.getConnections(
      parseInt(organizationId, 10)
    );

    return NextResponse.json({
      success: true,
      connections,
      total: connections.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaListConnections] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
