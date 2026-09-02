import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import {
  getTerritories,
  createTerritory,
} from '@/lib/services/crm/salesStructureService';

/**
 * GET /api/crm/territories — Lista los territories de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const territories = await getTerritories(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: territories }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Territories] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/territories — Crea un nuevo territory.
 * Body: { name, criteria?, is_active? }
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

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: name' },
        { status: 400 }
      );
    }

    const territory = await createTerritory(
      ctx.organizationId,
      {
        name: body.name,
        criteria: body.criteria,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: territory }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Territories] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
