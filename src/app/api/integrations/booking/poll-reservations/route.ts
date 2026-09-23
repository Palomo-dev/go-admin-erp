import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/booking/poll-reservations
 * Ejecuta poll de reservas nuevas y modificadas desde Booking.com.
 * Body: { connectionId: string } — la conexión debe ser de la organización de la sesión.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/booking/poll-reservations' });
    const { connectionId } = body ?? {};

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

    // Poll reservas nuevas
    const newResult = await booking.reservations.pollNewReservations(connectionId);

    // Poll modificaciones/cancelaciones
    const modResult = await booking.reservations.pollModifiedReservations(connectionId);

    return NextResponse.json({
      success: true,
      newReservations: {
        processed: newResult.processed,
        errors: newResult.errors,
        count: newResult.reservations.length,
      },
      modifications: {
        processed: modResult.processed,
        errors: modResult.errors,
      },
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingPoll] Error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
});
