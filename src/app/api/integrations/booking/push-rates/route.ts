import { NextRequest, NextResponse } from 'next/server';
import { bookingAvailabilityService } from '@/lib/services/integrations/booking';

/**
 * POST /api/integrations/booking/push-rates
 * Enviar actualización de tarifas a Booking.com.
 * Body: { connectionId: string, hotelId: string, roomId: string, ratePlanId: string, dates: BookingDateRate[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, hotelId, roomId, ratePlanId, dates } = body;

    if (!connectionId || !hotelId || !roomId || !ratePlanId || !dates) {
      return NextResponse.json(
        { error: 'Se requiere: connectionId, hotelId, roomId, ratePlanId, dates' },
        { status: 400 }
      );
    }

    const result = await bookingAvailabilityService.pushRates(connectionId, {
      hotelId,
      roomId,
      ratePlanId,
      dates,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingRates] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
