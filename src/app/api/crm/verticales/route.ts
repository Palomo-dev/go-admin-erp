import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import {
  listVerticals,
  createVertical,
  type VerticalInput,
} from '@/lib/services/crm/verticalsService';

/**
 * GET /api/crm/verticales — Lista las verticales de la organización.
 * Query params:
 *   - includeInactive=true → incluye verticales inactivas (soft-deleted).
 *     Requiere rol admin/owner.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Solo admins pueden ver verticales inactivas
    if (includeInactive && !isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado para ver verticales inactivas' },
        { status: 403 }
      );
    }

    const verticales = await listVerticals(
      ctx.organizationId,
      ctx.supabase,
      includeInactive
    );

    return NextResponse.json({ success: true, data: verticales }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Verticales] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/verticales — Crea una nueva vertical.
 * Requiere rol admin/owner.
 * Body: { name, description?, slug?, color?, sort_order?, positioning?, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();

    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: se requiere rol admin u owner' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body?.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'El campo "name" es obligatorio' },
        { status: 400 }
      );
    }

    const input: VerticalInput = {
      name: body.name.trim(),
      description: body.description ?? null,
      slug: body.slug ?? null,
      color: body.color ?? null,
      sort_order: body.sort_order ?? 0,
      positioning: body.positioning ?? {},
      metadata: body.metadata ?? {},
    };

    const vertical = await createVertical(
      ctx.organizationId,
      input,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: vertical }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Verticales] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
