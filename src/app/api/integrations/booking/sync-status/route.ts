import { NextRequest, NextResponse } from 'next/server';
import { bookingConnectionService } from '@/lib/services/integrations/booking';

/**
 * GET /api/integrations/booking/sync-status?connectionId=xxx
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
      bookingConnectionService.getSyncStatus(connectionId),
      bookingConnectionService.getSyncLogs(connectionId, 20),
    ]);

    return NextResponse.json({ status, logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingSyncStatus] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
