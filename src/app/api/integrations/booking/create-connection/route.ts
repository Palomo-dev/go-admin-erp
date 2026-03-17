import { NextRequest, NextResponse } from 'next/server';
import { bookingConnectionService } from '@/lib/services/integrations/booking';

/**
 * POST /api/integrations/booking/create-connection
 * Crear nueva conexión de Booking.com Connectivity API.
 * Body: { organizationId, hotelId, machineClientId, machineClientSecret, connectionName? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, hotelId, machineClientId, machineClientSecret, connectionName } = body;

    if (!organizationId || !hotelId || !machineClientId || !machineClientSecret) {
      return NextResponse.json(
        { error: 'Se requiere: organizationId, hotelId, machineClientId, machineClientSecret' },
        { status: 400 }
      );
    }

    const result = await bookingConnectionService.createConnection({
      organizationId,
      hotelId,
      machineClientId,
      machineClientSecret,
      connectionName,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingCreateConn] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
