import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/booking/push-rates
 * Enviar actualización de tarifas a Booking.com.
 * Body: { connectionId: string, hotelId: string, roomId: string, ratePlanId: string, dates: BookingDateRate[] }
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/booking/push-rates' });
    const { connectionId, hotelId, roomId, ratePlanId, dates } = body ?? {};

    if (!connectionId || !hotelId || !roomId || !ratePlanId || !dates) {
      return NextResponse.json(
        { error: 'Se requiere: connectionId, hotelId, roomId, ratePlanId, dates' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    const booking = createBookingServices(channelManagerClientsFor(ctx));
    const result = await booking.availability.pushRates(connectionId, {
      hotelId,
      roomId,
      ratePlanId,
      dates,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingRates] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
