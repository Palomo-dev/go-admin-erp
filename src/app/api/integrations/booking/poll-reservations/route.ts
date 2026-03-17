import { NextRequest, NextResponse } from 'next/server';
import { bookingReservationService } from '@/lib/services/integrations/booking';

/**
 * POST /api/integrations/booking/poll-reservations
 * Ejecuta poll de reservas nuevas y modificadas desde Booking.com.
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

    // Poll reservas nuevas
    const newResult = await bookingReservationService.pollNewReservations(connectionId);

    // Poll modificaciones/cancelaciones
    const modResult = await bookingReservationService.pollModifiedReservations(connectionId);

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
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingPoll] Error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
