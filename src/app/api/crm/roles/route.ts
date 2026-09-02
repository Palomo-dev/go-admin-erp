import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getSalesRoles,
  createSalesRole,
} from '@/lib/services/crm/salesStructureService';

/**
 * GET /api/crm/roles — Lista los sales_roles de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const roles = await getSalesRoles(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: roles }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Roles] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/roles — Crea un nuevo sales_role.
 * Body: { code, name, area, responsibilities?, is_active?, sort_order? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.code || !body?.name || !body?.area) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: code, name, area' },
        { status: 400 }
      );
    }

    const role = await createSalesRole(
      ctx.organizationId,
      {
        code: body.code,
        name: body.name,
        area: body.area,
        responsibilities: body.responsibilities,
        is_active: body.is_active,
        sort_order: body.sort_order,
        job_position_id: body.job_position_id || null,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Roles] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
