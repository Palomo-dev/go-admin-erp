import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateCallTag, deleteCallTag } from '@/lib/services/crm/callTagService';

/**
 * PATCH /api/crm/call-tags/[id] — Actualiza un tag de llamada.
 * Body: { name?, color?, category?, is_auto?, rules? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const tag = await updateCallTag(
      id,
      ctx.organizationId,
      {
        name: body.name,
        color: body.color,
        category: body.category,
        is_auto: body.is_auto,
        rules: body.rules,
      },
      ctx.supabase
    );

    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: tag }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Call Tags] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/call-tags/[id] — Elimina un tag de llamada.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteCallTag(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Call Tags] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
