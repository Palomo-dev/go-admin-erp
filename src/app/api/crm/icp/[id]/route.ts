import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateICPProfile, deleteICPProfile } from '@/lib/services/crm/icpService';

/**
 * PATCH /api/crm/icp/[id] — Actualiza un icp_profile.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const profile = await updateICPProfile(id, ctx.organizationId, body, ctx.supabase);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'ICP profile no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: profile }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/icp/[id] — Elimina un icp_profile (cascade borra criteria).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteICPProfile(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
