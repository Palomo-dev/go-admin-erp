import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { createExpediaServices } from '@/lib/services/integrations/expedia';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';
import { cuentaDeSocioConfigurada } from '@/lib/services/integrations/conexiones/credencialesOta';

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

    // Usuario y clave EQC: los de la cuenta de proveedor de conectividad del servidor si el body no
    // los trae (EXPEDIA_EQC_USERNAME/PASSWORD). Frente INT, 2026-11-07.
    if (!propertyId || ((!eqcUsername || !eqcPassword) && !cuentaDeSocioConfigurada('expedia'))) {
      return NextResponse.json(
        { error: 'propertyId es requerido (y eqcUsername/eqcPassword mientras GO Admin no tenga cuenta de proveedor de conectividad)' },
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
