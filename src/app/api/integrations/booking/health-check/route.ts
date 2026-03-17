import { NextRequest, NextResponse } from 'next/server';
import { bookingAuthService } from '@/lib/services/integrations/booking';
import {
  BOOKING_ENDPOINTS,
  BOOKING_CREDENTIAL_PURPOSES,
  getSupplyUrl,
  getXmlHeaders,
} from '@/lib/services/integrations/booking/bookingConfig';
import type { BookingHealthCheckResult } from '@/lib/services/integrations/booking/bookingTypes';

/**
 * POST /api/integrations/booking/health-check
 * Verificar credenciales y conexión con Booking.com.
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

    const result: BookingHealthCheckResult = {
      connected: false,
      message: '',
    };

    // 1. Verificar credenciales
    const credentials = await bookingAuthService.getCredentials(connectionId);
    if (!credentials) {
      result.message = 'Credenciales no encontradas o incompletas';
      return NextResponse.json(result);
    }

    result.hotelId = credentials.hotelId;

    // 2. Verificar token
    const token = await bookingAuthService.getValidToken(connectionId);
    if (!token) {
      result.message = 'No se pudo obtener token de autenticación. Verificar machine_client_id y machine_client_secret.';
      result.tokenValid = false;
      return NextResponse.json(result);
    }

    result.tokenValid = true;

    // 3. Test request: obtener info de propiedad (OTA_HotelDescriptiveInfo)
    try {
      const url = getSupplyUrl(BOOKING_ENDPOINTS.CONTENT_READ);
      const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelDescriptiveInfoRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <HotelDescriptiveInfos>
    <HotelDescriptiveInfo HotelCode="${credentials.hotelId}" />
  </HotelDescriptiveInfos>
</OTA_HotelDescriptiveInfoRQ>`;

      const response = await fetch(url, {
        method: 'POST',
        headers: getXmlHeaders(token),
        body: xmlBody,
      });

      if (response.ok) {
        const responseText = await response.text();
        // Extraer nombre del hotel si está en la respuesta
        const hotelNameMatch = responseText.match(/HotelName="([^"]*)"/);
        if (hotelNameMatch) {
          result.hotelName = hotelNameMatch[1];
        }
        result.connected = true;
        result.message = `Conexión exitosa con propiedad ${result.hotelName || credentials.hotelId}`;
      } else {
        result.message = `Error conectando con Booking.com (HTTP ${response.status})`;
      }
    } catch (fetchErr) {
      result.message = `Error de red: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingHealth] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
