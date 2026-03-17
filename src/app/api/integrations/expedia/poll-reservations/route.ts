import { NextRequest, NextResponse } from 'next/server';
import { expediaReservationService } from '@/lib/services/integrations/expedia/expediaReservationService';

/**
 * POST /api/integrations/expedia/poll-reservations
 * Ejecutar poll de reservas desde Expedia (Booking Retrieval API).
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

    const result = await expediaReservationService.pollReservations(connectionId);

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
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPollReservations] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
