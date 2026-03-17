import { NextRequest, NextResponse } from 'next/server';
import { bookingAvailabilityService } from '@/lib/services/integrations/booking';

/**
 * POST /api/integrations/booking/push-availability
 * Enviar actualización de disponibilidad a Booking.com.
 * Body: { connectionId: string, organizationId: number } — sync completo
 * Body: { connectionId: string, hotelId, roomId, ratePlanId, dates[] } — update puntual
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

    // Si viene organizationId, hacer sync completo
    if (body.organizationId) {
      const result = await bookingAvailabilityService.syncFullAvailability(
        connectionId,
        body.organizationId,
      );
      return NextResponse.json(result);
    }

    // Si viene update puntual
    if (body.hotelId && body.roomId && body.ratePlanId && body.dates) {
      const result = await bookingAvailabilityService.pushAvailability(connectionId, {
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
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingAvailability] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
