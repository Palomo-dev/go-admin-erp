import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaServices } from '@/lib/services/integrations/expedia';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';

/**
 * POST /api/integrations/expedia/create-connection
 * Crear una nueva conexión con Expedia Group.
 * Body: { propertyId, eqcUsername, eqcPassword, spaceId?, connectionName?, organizationId? }
 *
 * La organización sale de la sesión (`withOrg`); un `organizationId` distinto
 * en el body o la query → 403. Requiere administrador: guarda credenciales.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: 'integrations/expedia/create-connection' });
    const { propertyId, eqcUsername, eqcPassword, spaceId, connectionName } = body ?? {};

    if (!propertyId || !eqcUsername || !eqcPassword) {
      return NextResponse.json(
        { error: 'propertyId, eqcUsername y eqcPassword son requeridos' },
        { status: 400 }
      );
    }

    const expedia = createExpediaServices(channelManagerClientsFor(ctx));
    const result = await expedia.connections.createConnection({
      organizationId: ctx.organizationId,
      propertyId,
      eqcUsername,
      eqcPassword,
      spaceId,
      connectionName,
    });

    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaCreateConnection] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, { admin: true });
