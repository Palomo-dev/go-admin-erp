import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/booking/create-connection
 * Crear nueva conexión de Booking.com Connectivity API.
 * Body: { hotelId, machineClientId, machineClientSecret, connectionName?, organizationId? }
 *
 * La organización sale de la sesión (`withOrg`); un `organizationId` distinto
 * en el body o la query → 403. Requiere administrador: guarda credenciales.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/booking/create-connection' });
    const { hotelId, machineClientId, machineClientSecret, connectionName } = body ?? {};

    if (!hotelId || !machineClientId || !machineClientSecret) {
      return NextResponse.json(
        { error: 'Se requiere: hotelId, machineClientId, machineClientSecret' },
        { status: 400 }
      );
    }

    const booking = createBookingServices(channelManagerClientsFor(ctx));
    const result = await booking.connections.createConnection({
      organizationId: ctx.organizationId,
      hotelId,
      machineClientId,
      machineClientSecret,
      connectionName,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingCreateConn] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, { admin: true });
