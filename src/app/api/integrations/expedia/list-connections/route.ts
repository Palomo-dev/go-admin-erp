import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaServices } from '@/lib/services/integrations/expedia';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';

/**
 * GET /api/integrations/expedia/list-connections?organizationId=123
 * Obtener las conexiones Expedia Group de la organización de la sesión.
 * `organizationId` en la query es opcional; si trae otra organización → 403.
 */
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'integrations/expedia/list-connections' });

    const expedia = createExpediaServices(channelManagerClientsFor(ctx));
    const connections = await expedia.connections.getConnections(ctx.organizationId);

    return NextResponse.json({
      success: true,
      connections,
      total: connections.length,
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaListConnections] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
