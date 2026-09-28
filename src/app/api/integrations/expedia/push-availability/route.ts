import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaAvailabilityService } from '@/lib/services/integrations/expedia/expediaAvailabilityService';
import type { ExpediaAvailabilityUpdate } from '@/lib/services/integrations/expedia/expediaTypes';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/expedia/push-availability
 * Enviar actualización de disponibilidad y tarifas a Expedia (AR API).
 *
 * Body (parcial):
 * { connectionId, propertyId, roomTypeId, ratePlanId, dates: [{ date, price?, totalInventoryAvailable?, closed?, minimumStay? }] }
 *
 * Body (sync completo):
 * { connectionId, organizationId, fullSync: true }
 *
 * La organización efectiva es la de la sesión (si el body trae otra → 403).
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/expedia/push-availability' });
    const { connectionId, organizationId, fullSync } = body ?? {};

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    const availability = createExpediaAvailabilityService(channelManagerClientsFor(ctx));

    // Sync completo (organizationId ya verificado: es la de la sesión)
    if (fullSync && organizationId) {
      const result = await availability.syncFullAvailability(
        connectionId,
        ctx.organizationId,
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

    const result = await availability.pushAvailabilityAndRates(connectionId, update);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPushAvailability] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
