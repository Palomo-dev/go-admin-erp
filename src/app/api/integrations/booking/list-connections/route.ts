import { NextRequest, NextResponse } from 'next/server';
import { bookingConnectionService } from '@/lib/services/integrations/booking';

/**
 * GET /api/integrations/booking/list-connections?organizationId=xxx
 * Listar conexiones de Booking.com API para una organización.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    const connections = await bookingConnectionService.getConnections(
      parseInt(organizationId, 10)
    );

    return NextResponse.json({ connections });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingListConn] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
