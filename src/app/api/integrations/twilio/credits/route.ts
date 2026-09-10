/**
 * API Route: Consultar créditos de comunicación
 * GET /api/integrations/twilio/credits
 *
 * F0: sesión + org activa (`getServerOrgContext`); el `orgId` de la query se
 * ignora (si viene y no coincide → 403).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { commCreditsService } from '@/lib/services/commCreditsService';

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const requested = request.nextUrl.searchParams.get('orgId');
    if (requested && Number(requested) !== ctx.organizationId) {
      return NextResponse.json({ error: 'orgId no coincide con la organización activa' }, { status: 403 });
    }
    const orgId = ctx.organizationId;

    const [credits, usage] = await Promise.all([
      commCreditsService.getCreditsStatus(orgId),
      commCreditsService.getMonthlyUsageSummary(orgId),
    ]);

    if (!credits) {
      return NextResponse.json(
        { error: 'No se encontraron créditos para esta organización' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      credits,
      monthlyUsage: usage,
    });
  } catch (error) {
    console.error('[API] Error consultando créditos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
