import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateSalesTeam, deleteSalesTeam } from '@/lib/services/crm/salesStructureService';

/**
 * PATCH /api/crm/teams/[id] — Actualiza un sales_team.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const team = await updateSalesTeam(id, ctx.organizationId, body, ctx.supabase);

    if (!team) {
      return NextResponse.json(
        { success: false, error: 'Equipo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: team }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Teams] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/teams/[id] — Elimina un sales_team.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteSalesTeam(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Teams] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
