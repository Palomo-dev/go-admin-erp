import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getTeamMembers,
  addTeamMember,
} from '@/lib/services/crm/salesStructureService';

/**
 * GET /api/crm/teams/[id]/members — Lista los miembros de un equipo.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const members = await getTeamMembers(id, ctx.supabase);

    return NextResponse.json({ success: true, data: members }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Team Members] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/teams/[id]/members — Añade un miembro al equipo.
 * Body: { user_id, sales_role_id?, quota_amount?, quota_currency?, is_active? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.user_id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: user_id' },
        { status: 400 }
      );
    }

    const member = await addTeamMember(
      ctx.organizationId,
      id,
      {
        user_id: body.user_id,
        sales_role_id: body.sales_role_id,
        quota_amount: body.quota_amount,
        quota_currency: body.quota_currency,
        is_active: body.is_active,
        territory_id: body.territory_id || null,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Team Members] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
