import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateICPCriterion, deleteICPCriterion } from '@/lib/services/crm/icpService';

/**
 * PATCH /api/crm/icp/[id]/criteria/[criterionId] — Actualiza un criterion.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; criterionId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { criterionId } = await params;
    const body = await request.json();

    const criterion = await updateICPCriterion(criterionId, ctx.organizationId, body, ctx.supabase);

    if (!criterion) {
      return NextResponse.json(
        { success: false, error: 'Criterio no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: criterion }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP Criteria] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/icp/[id]/criteria/[criterionId] — Elimina un criterion.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; criterionId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { criterionId } = await params;

    await deleteICPCriterion(criterionId, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP Criteria] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
