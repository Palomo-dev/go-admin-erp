/**
 * API Route: Historial de uso de comunicaciones
 * GET /api/integrations/twilio/usage?channel=sms&limit=50&offset=0
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
    const searchParams = request.nextUrl.searchParams;
    const requested = searchParams.get('orgId');
    if (requested && Number(requested) !== ctx.organizationId) {
      return NextResponse.json({ error: 'orgId no coincide con la organización activa' }, { status: 403 });
    }

    const { data, count } = await commCreditsService.getUsageHistory(ctx.organizationId, {
      channel: searchParams.get('channel') || undefined,
      module: searchParams.get('module') || undefined,
      limit: Number(searchParams.get('limit')) || 50,
      offset: Number(searchParams.get('offset')) || 0,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('[API] Error consultando historial:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
