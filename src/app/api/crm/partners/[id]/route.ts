import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updatePartner, deletePartner } from '@/lib/services/crm/partnerService';

/**
 * PATCH /api/crm/partners/[id] — Actualiza un partner.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const partner = await updatePartner(id, ctx.organizationId, body, ctx.supabase);

    if (!partner) {
      return NextResponse.json(
        { success: false, error: 'Partner no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: partner }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partners] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/partners/[id] — Elimina un partner.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deletePartner(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partners] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
