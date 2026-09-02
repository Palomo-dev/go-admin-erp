import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateSalesTarget, deleteSalesTarget } from '@/lib/services/crm/salesTargetService';

/**
 * PATCH /api/crm/sales-targets/[id] — Actualiza una cuota comercial.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const target = await updateSalesTarget(id, ctx.organizationId, body, ctx.supabase);

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Cuota no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: target }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Sales Targets] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/sales-targets/[id] — Elimina una cuota comercial.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteSalesTarget(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Sales Targets] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
