import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * GET /api/integrations/booking/sync-status?connectionId=xxx
 * Obtener estado de sincronización y logs recientes de una conexión de la
 * organización de la sesión.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'integrations/booking/sync-status' });
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    const booking = createBookingServices(channelManagerClientsFor(ctx));
    const [status, logs] = await Promise.all([
      booking.connections.getSyncStatus(connectionId),
      booking.connections.getSyncLogs(connectionId, 20),
    ]);

    return NextResponse.json({ status, logs });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingSyncStatus] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
