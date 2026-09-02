import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { rejectCommission } from '@/lib/services/crm/commissionService';

/**
 * POST /api/crm/commissions/[id]/reject — Rechaza una comisión.
 * Body: { reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.reason) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: reason' },
        { status: 400 }
      );
    }

    const commission = await rejectCommission(id, ctx.organizationId, body.reason, ctx.supabase);

    if (!commission) {
      return NextResponse.json(
        { success: false, error: 'Comisión no encontrada o no se puede rechazar' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: commission }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Commissions Reject] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
