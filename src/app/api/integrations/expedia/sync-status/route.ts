import { NextRequest, NextResponse } from 'next/server';
import { expediaConnectionService } from '@/lib/services/integrations/expedia';

/**
 * GET /api/integrations/expedia/sync-status?connectionId=xxx
 * Obtener estado de sincronización y logs recientes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    const [status, logs] = await Promise.all([
      expediaConnectionService.getSyncStatus(connectionId),
      expediaConnectionService.getSyncLogs(connectionId, 20),
    ]);

    return NextResponse.json({ status, logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaSyncStatus] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
