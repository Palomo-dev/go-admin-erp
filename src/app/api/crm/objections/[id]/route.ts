import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateObjection, deleteObjection } from '@/lib/services/crm/objectionService';

/**
 * PATCH /api/crm/objections/[id] — Actualiza una objection.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const objection = await updateObjection(id, ctx.organizationId, body, ctx.supabase);

    if (!objection) {
      return NextResponse.json(
        { success: false, error: 'Objection no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: objection }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/objections/[id] — Elimina una objection.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteObjection(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
