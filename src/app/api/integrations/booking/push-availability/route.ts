import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingServices } from '@/lib/services/integrations/booking';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/booking/push-availability
 * Enviar actualización de disponibilidad a Booking.com.
 * Body: { connectionId: string, organizationId: number } — sync completo
 * Body: { connectionId: string, hotelId, roomId, ratePlanId, dates[] } — update puntual
 *
 * `organizationId` solo activa el sync completo: la organización efectiva es
 * la de la sesión (si el body trae otra → 403).
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/booking/push-availability' });
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

    // Si viene organizationId (ya verificado: es la de la sesión), sync completo
    if (body.organizationId) {
      const result = await booking.availability.syncFullAvailability(
        connectionId,
        ctx.organizationId,
      );
      return NextResponse.json(result);
    }

    // Si viene update puntual
    if (body.hotelId && body.roomId && body.ratePlanId && body.dates) {
      const result = await booking.availability.pushAvailability(connectionId, {
        hotelId: body.hotelId,
        roomId: body.roomId,
        ratePlanId: body.ratePlanId,
        dates: body.dates,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Se requiere organizationId (sync completo) o hotelId+roomId+ratePlanId+dates (update puntual)' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingAvailability] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
