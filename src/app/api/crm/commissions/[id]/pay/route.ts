import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { payCommission } from '@/lib/services/crm/commissionService';

/**
 * POST /api/crm/commissions/[id]/pay — Marca una comisión como pagada.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const commission = await payCommission(id, ctx.organizationId, ctx.supabase);

    if (!commission) {
      return NextResponse.json(
        { success: false, error: 'Comisión no encontrada o no está en estado accrued' },
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
    console.error('[CRM Commissions Pay] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
