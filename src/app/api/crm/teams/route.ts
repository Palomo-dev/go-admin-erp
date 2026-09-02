import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getSalesTeams,
  createSalesTeam,
} from '@/lib/services/crm/salesStructureService';

/**
 * GET /api/crm/teams — Lista los sales_teams con sus miembros.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const teams = await getSalesTeams(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: teams }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Teams] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/teams — Crea un nuevo sales_team.
 * Body: { name, description?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: name' },
        { status: 400 }
      );
    }

    const team = await createSalesTeam(
      ctx.organizationId,
      {
        name: body.name,
        description: body.description,
        is_active: body.is_active,
        territory_id: body.territory_id || null,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: team }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Teams] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
