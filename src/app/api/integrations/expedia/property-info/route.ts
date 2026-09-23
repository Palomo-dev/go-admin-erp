import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaProductService } from '@/lib/services/integrations/expedia/expediaProductService';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * GET /api/integrations/expedia/property-info?connectionId=xxx
 * Obtener información de la propiedad + room types desde Expedia.
 * Query: connectionId (required), full (optional, default false)
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'integrations/expedia/property-info' });
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const full = searchParams.get('full') === 'true';

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

    if (full) {
      const summary = await products.getFullPropertySummary(connectionId);
      return NextResponse.json({ success: true, ...summary });
    }

    const property = await products.getPropertyInfo(connectionId);

    if (!property) {
      return NextResponse.json(
        { success: false, message: 'No se pudo obtener información de la propiedad' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, property });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaPropertyInfo] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
