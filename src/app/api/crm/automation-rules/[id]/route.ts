import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateAutomationRule, deleteAutomationRule } from '@/lib/services/crm/automationService';

/**
 * PATCH /api/crm/automation-rules/[id] — Actualiza una regla.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const rule = await updateAutomationRule(id, ctx.organizationId, body, ctx.supabase);

    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Regla no encontrada' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: rule }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/automation-rules/[id] — Elimina una regla.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteAutomationRule(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
