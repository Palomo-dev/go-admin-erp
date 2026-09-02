import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateReferralProgram, deleteReferralProgram } from '@/lib/services/crm/referralsService';

/**
 * PATCH /api/crm/referrals/programs/[id] — Actualiza un programa de referidos.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const program = await updateReferralProgram(id, ctx.organizationId, body, ctx.supabase);

    if (!program) {
      return NextResponse.json(
        { success: false, error: 'Programa no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: program }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referral Programs] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/referrals/programs/[id] — Elimina un programa de referidos.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteReferralProgram(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referral Programs] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
