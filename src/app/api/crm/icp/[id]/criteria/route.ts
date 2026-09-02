import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getICPCriteria,
  createICPCriterion,
} from '@/lib/services/crm/icpService';

/**
 * GET /api/crm/icp/[id]/criteria — Lista los criteria de un ICP profile.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const criteria = await getICPCriteria(id, ctx.supabase);

    return NextResponse.json({ success: true, data: criteria }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP Criteria] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/icp/[id]/criteria — Crea un criterion para un ICP profile.
 * Body: { field_key, operator, value, weight?, is_required? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.field_key || !body?.operator) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: field_key, operator' },
        { status: 400 }
      );
    }

    const criterion = await createICPCriterion(
      ctx.organizationId,
      id,
      {
        field_key: body.field_key,
        operator: body.operator,
        value: body.value,
        weight: body.weight,
        is_required: body.is_required,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: criterion }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP Criteria] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
