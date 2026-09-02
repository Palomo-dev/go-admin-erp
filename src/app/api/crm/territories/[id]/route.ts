import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { updateTerritory, deleteTerritory } from '@/lib/services/crm/salesStructureService';

/**
 * PATCH /api/crm/territories/[id] — Actualiza un territory.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();

    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: se requiere rol admin u owner' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const territory = await updateTerritory(id, ctx.organizationId, body, ctx.supabase);

    if (!territory) {
      return NextResponse.json(
        { success: false, error: 'Territorio no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: territory }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Territories] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/territories/[id] — Elimina un territory.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();

    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: se requiere rol admin u owner' },
        { status: 403 }
      );
    }

    const { id } = await params;

    await deleteTerritory(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Territories] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
