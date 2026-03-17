import { NextRequest, NextResponse } from 'next/server';
import { expediaConnectionService } from '@/lib/services/integrations/expedia';
import type { ExpediaHealthCheckResult } from '@/lib/services/integrations/expedia/expediaTypes';

/**
 * POST /api/integrations/expedia/health-check
 * Verificar credenciales y conexión con Expedia Group.
 * Body: { connectionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    const result: ExpediaHealthCheckResult = await expediaConnectionService.healthCheck(connectionId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaHealth] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
