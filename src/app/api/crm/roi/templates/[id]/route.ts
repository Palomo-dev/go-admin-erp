import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateRoiCalculator, deleteRoiCalculator } from '@/lib/services/crm/roiService';

/**
 * PATCH /api/crm/roi/templates/[id] — Actualiza una calculadora de ROI.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const calculator = await updateRoiCalculator(id, ctx.organizationId, body, ctx.supabase);

    if (!calculator) {
      return NextResponse.json(
        { success: false, error: 'Calculadora ROI no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: calculator }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ROI Templates] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/roi/templates/[id] — Elimina una calculadora de ROI.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteRoiCalculator(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ROI Templates] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
