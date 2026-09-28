import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaProductService } from '@/lib/services/integrations/expedia/expediaProductService';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * GET /api/integrations/expedia/room-types?connectionId=xxx
 * Obtener room types y rate plans de Expedia Product API.
 * Query: connectionId (required), withRatePlans (optional, default true)
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'integrations/expedia/room-types' });
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const withRatePlans = searchParams.get('withRatePlans') !== 'false';

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    const products = createExpediaProductService(channelManagerClientsFor(ctx));
    const roomTypes = withRatePlans
      ? await products.getRoomTypesWithRatePlans(connectionId)
      : await products.getRoomTypes(connectionId);

    return NextResponse.json({
      success: true,
      roomTypes,
      total: roomTypes.length,
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaRoomTypes] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
