import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import {
  updateVertical,
  deleteVertical,
  type VerticalUpdateInput,
} from '@/lib/services/crm/verticalsService';

/**
 * Valida que el parámetro [id] sea un UUID válido (formato básico).
 */
function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * PATCH /api/crm/verticales/[id] — Actualiza una vertical existente.
 * Requiere rol admin/owner.
 * Body (campos opcionales): { name?, description?, is_active?, slug?, color?,
 *   sort_order?, positioning?, metadata? }
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
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, error: 'ID de vertical inválido' },
        { status: 400 }
      );
    }

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Cuerpo de la petición inválido' },
        { status: 400 }
      );
    }

    const update: VerticalUpdateInput = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (body.slug !== undefined) update.slug = body.slug;
    if (body.color !== undefined) update.color = body.color;
    if (body.sort_order !== undefined) update.sort_order = body.sort_order;
    if (body.positioning !== undefined) update.positioning = body.positioning;
    if (body.metadata !== undefined) update.metadata = body.metadata;

    const updated = await updateVertical(
      ctx.organizationId,
      id,
      update,
      ctx.supabase
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Vertical no encontrada en esta organización' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Verticales] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/verticales/[id] — Soft delete (marca is_active=false).
 * Requiere rol admin/owner.
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
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, error: 'ID de vertical inválido' },
        { status: 400 }
      );
    }

    const deleted = await deleteVertical(ctx.organizationId, id, ctx.supabase);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Vertical no encontrada o ya inactiva' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: { message: 'Vertical desactivada' } },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Verticales] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
