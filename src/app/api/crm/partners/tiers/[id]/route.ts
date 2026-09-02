import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updatePartnerTier, deletePartnerTier } from '@/lib/services/crm/partnerService';

/**
 * PATCH /api/crm/partners/tiers/[id] — Actualiza un tier de partner.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const tier = await updatePartnerTier(id, ctx.organizationId, body, ctx.supabase);

    if (!tier) {
      return NextResponse.json(
        { success: false, error: 'Tier no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: tier }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partner Tiers] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/partners/tiers/[id] — Elimina un tier de partner.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deletePartnerTier(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partner Tiers] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
