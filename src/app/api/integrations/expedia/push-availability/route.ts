import { NextRequest, NextResponse } from 'next/server';
import { expediaAvailabilityService } from '@/lib/services/integrations/expedia/expediaAvailabilityService';
import type { ExpediaAvailabilityUpdate } from '@/lib/services/integrations/expedia/expediaTypes';

/**
 * POST /api/integrations/expedia/push-availability
 * Enviar actualización de disponibilidad y tarifas a Expedia (AR API).
 *
 * Body (parcial):
 * { connectionId, propertyId, roomTypeId, ratePlanId, dates: [{ date, price?, totalInventoryAvailable?, closed?, minimumStay? }] }
 *
 * Body (sync completo):
 * { connectionId, organizationId, fullSync: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, organizationId, fullSync } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    // Sync completo
    if (fullSync && organizationId) {
      const result = await expediaAvailabilityService.syncFullAvailability(
        connectionId,
        parseInt(organizationId, 10),
      );
      return NextResponse.json(result);
    }

    // Push parcial
    const { propertyId, roomTypeId, ratePlanId, dates } = body;

    if (!propertyId || !roomTypeId || !ratePlanId || !dates || !Array.isArray(dates)) {
      return NextResponse.json(
        { error: 'propertyId, roomTypeId, ratePlanId y dates son requeridos para push parcial' },
        { status: 400 }
      );
    }

    const update: ExpediaAvailabilityUpdate = {
      propertyId,
      roomTypeId,
      ratePlanId,
      dates,
    };

    const result = await expediaAvailabilityService.pushAvailabilityAndRates(connectionId, update);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPushAvailability] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
