import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createBookingAuthService } from '@/lib/services/integrations/booking';
import {
  BOOKING_ENDPOINTS,
  getSupplyUrl,
  getXmlHeaders,
} from '@/lib/services/integrations/booking/bookingConfig';
import type { BookingHealthCheckResult } from '@/lib/services/integrations/booking/bookingTypes';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/booking/health-check
 * Verificar credenciales y conexión con Booking.com.
 *
 * Body: { connectionId: string } — conexión guardada de la organización de la sesión.
 * Body: { testOnly: true, hotelId, machineClientId, machineClientSecret } — prueba
 *   credenciales todavía sin guardar (asistente de nueva conexión). No toca la base.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/booking/health-check' });
    const { connectionId } = body ?? {};
    const auth = createBookingAuthService(channelManagerClientsFor(ctx));

    const result: BookingHealthCheckResult = {
      connected: false,
      message: '',
    };

    // Prueba de credenciales sin guardar (el asistente no tiene connectionId aún)
    if (!connectionId && body?.testOnly === true) {
      const { hotelId, machineClientId, machineClientSecret } = body;
      if (!hotelId || !machineClientId || !machineClientSecret) {
        return NextResponse.json(
          { error: 'Se requiere: hotelId, machineClientId, machineClientSecret' },
          { status: 400 }
        );
      }
      result.hotelId = String(hotelId);
      const tokenInfo = await auth.requestNewToken({
        hotelId: String(hotelId),
        machineClientId: String(machineClientId),
        machineClientSecret: String(machineClientSecret),
      });
      if (!tokenInfo) {
        result.message = 'No se pudo obtener token de autenticación. Verificar machine_client_id y machine_client_secret.';
        result.tokenValid = false;
        return NextResponse.json(result);
      }
      result.tokenValid = true;
      await probeProperty(result, tokenInfo.accessToken, String(hotelId));
      return NextResponse.json(result);
    }

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    // 1. Verificar credenciales
    const credentials = await auth.getCredentials(connectionId);
    if (!credentials) {
      result.message = 'Credenciales no encontradas o incompletas';
      return NextResponse.json(result);
    }

    result.hotelId = credentials.hotelId;

    // 2. Verificar token
    const token = await auth.getValidToken(connectionId);
    if (!token) {
      result.message = 'No se pudo obtener token de autenticación. Verificar machine_client_id y machine_client_secret.';
      result.tokenValid = false;
      return NextResponse.json(result);
    }

    result.tokenValid = true;

    // 3. Test request: obtener info de propiedad (OTA_HotelDescriptiveInfo)
    await probeProperty(result, token, credentials.hotelId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API BookingHealth] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

/** Pide OTA_HotelDescriptiveInfo y completa `result` (connected, hotelName, message). */
async function probeProperty(result: BookingHealthCheckResult, token: string, hotelId: string): Promise<void> {
  try {
    const url = getSupplyUrl(BOOKING_ENDPOINTS.CONTENT_READ);
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelDescriptiveInfoRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0">
  <HotelDescriptiveInfos>
    <HotelDescriptiveInfo HotelCode="${escapeXmlAttr(hotelId)}" />
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
      result.message = `Conexión exitosa con propiedad ${result.hotelName || hotelId}`;
    } else {
      result.message = `Error conectando con Booking.com (HTTP ${response.status})`;
    }
  } catch (fetchErr) {
    result.message = `Error de red: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
  }
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
