import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaServices } from '@/lib/services/integrations/expedia';
import type { ExpediaHealthCheckResult } from '@/lib/services/integrations/expedia/expediaTypes';
import {
  channelManagerClientsFor,
  connectionBelongsToOrg,
  CONNECTION_NOT_FOUND,
} from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/expedia/health-check
 * Verificar credenciales y conexión con Expedia Group.
 * Body: { connectionId: string } — la conexión debe ser de la organización de la sesión.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/expedia/health-check' });
    const { connectionId } = body ?? {};

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    if (!(await connectionBelongsToOrg(ctx, connectionId))) {
      return NextResponse.json(CONNECTION_NOT_FOUND, { status: 404 });
    }

    const expedia = createExpediaServices(channelManagerClientsFor(ctx));
    const result: ExpediaHealthCheckResult = await expedia.connections.healthCheck(connectionId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaHealth] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
