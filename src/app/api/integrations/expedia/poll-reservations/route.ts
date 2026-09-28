import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaReservationService } from '@/lib/services/integrations/expedia/expediaReservationService';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/expedia/poll-reservations
 * Ejecutar poll de reservas desde Expedia (Booking Retrieval API).
 * Body: { connectionId: string } — la conexión debe ser de la organización de la sesión.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/expedia/poll-reservations' });
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

    const reservations = createExpediaReservationService(channelManagerClientsFor(ctx));
    const result = await reservations.pollReservations(connectionId);

    return NextResponse.json({
      success: result.errors === 0,
      processed: result.processed,
      errors: result.errors,
      reservations: result.reservations.map(r => ({
        confirmationId: r.confirmationId,
        propertyId: r.propertyId,
        status: r.status,
        checkin: r.checkin,
        checkout: r.checkout,
        guest: `${r.guest.firstName} ${r.guest.lastName}`.trim(),
        totalPrice: r.totalPrice,
        currency: r.currency,
        pointOfSale: r.pointOfSale,
      })),
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPollReservations] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
