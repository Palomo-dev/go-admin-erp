import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateTeamMember, removeTeamMember } from '@/lib/services/crm/salesStructureService';

/**
 * PATCH /api/crm/teams/[id]/members/[memberId] — Actualiza un miembro del equipo.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { memberId } = await params;
    const body = await request.json();

    const member = await updateTeamMember(memberId, ctx.organizationId, body, ctx.supabase);

    if (!member) {
      return NextResponse.json(
        { success: false, error: 'Miembro no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: member }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Team Members] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/teams/[id]/members/[memberId] — Elimina un miembro del equipo.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { memberId } = await params;

    await removeTeamMember(memberId, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Team Members] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
