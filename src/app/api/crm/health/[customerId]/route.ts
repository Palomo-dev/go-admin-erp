import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getHealthScore,
  calculateHealthScore,
  getHealthTrend,
} from '@/lib/services/crm/healthScoreService';

/**
 * GET /api/crm/health/[customerId] — Obtiene el health score actual de un cliente.
 * Query: ?trend=true&months=6 — incluye la tendencia de snapshots.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { customerId } = await params;
    const { searchParams } = new URL(request.url);

    const health = await getHealthScore(ctx.organizationId, customerId, ctx.supabase);

    if (!health) {
      return NextResponse.json(
        { success: false, error: 'Cliente no encontrado' },
        { status: 404 }
      );
    }

    const response: Record<string, unknown> = { ...health };

    // Incluir tendencia si se solicita
    if (searchParams.get('trend') === 'true') {
      const months = searchParams.get('months')
        ? parseInt(searchParams.get('months')!, 10)
        : 6;
      const trend = await getHealthTrend(ctx.organizationId, customerId, ctx.supabase, months);
      response.trend = trend;
    }

    return NextResponse.json({ success: true, data: response }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Health] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/health/[customerId] — Recalcula el health score de un cliente.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { customerId } = await params;

    const result = await calculateHealthScore(ctx.organizationId, customerId, ctx.supabase);

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'No se pudo calcular el health score' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Health] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
