import { NextRequest, NextResponse } from 'next/server';
import { expediaConnectionService } from '@/lib/services/integrations/expedia';

/**
 * POST /api/integrations/expedia/create-connection
 * Crear una nueva conexión con Expedia Group.
 * Body: { organizationId, propertyId, eqcUsername, eqcPassword, spaceId?, connectionName? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, propertyId, eqcUsername, eqcPassword, spaceId, connectionName } = body;

    if (!organizationId || !propertyId || !eqcUsername || !eqcPassword) {
      return NextResponse.json(
        { error: 'organizationId, propertyId, eqcUsername y eqcPassword son requeridos' },
        { status: 400 }
      );
    }

    const result = await expediaConnectionService.createConnection({
      organizationId: parseInt(organizationId, 10),
      propertyId,
      eqcUsername,
      eqcPassword,
      spaceId,
      connectionName,
    });

    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[API ExpediaCreateConnection] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
