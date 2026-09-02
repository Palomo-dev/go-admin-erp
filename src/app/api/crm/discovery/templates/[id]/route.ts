import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateDiscoveryTemplate, deleteDiscoveryTemplate } from '@/lib/services/crm/discoveryService';

/**
 * PATCH /api/crm/discovery/templates/[id] — Actualiza un discovery template.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const template = await updateDiscoveryTemplate(id, ctx.organizationId, body, ctx.supabase);

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Discovery template no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: template }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery Templates] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/discovery/templates/[id] — Elimina un discovery template.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteDiscoveryTemplate(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery Templates] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
