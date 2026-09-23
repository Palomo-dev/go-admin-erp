import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';

/**
 * GET /api/integrations/booking/list-connections?organizationId=xxx
 * Listar conexiones de Booking.com API de la organización de la sesión.
 * `organizationId` en la query es opcional; si trae otra organización → 403.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'integrations/booking/list-connections' });

    const booking = createBookingServices(channelManagerClientsFor(ctx));
    const connections = await booking.connections.getConnections(ctx.organizationId);

    return NextResponse.json({ connections });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingListConn] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
