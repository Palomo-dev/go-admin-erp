import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getCalls,
  createCall,
  type CallFilters,
  type CallCreateInput,
} from '@/lib/services/crm/callManagementService';

/**
 * GET /api/crm/calls — Lista llamadas de la organización con filtros.
 *
 * Query params (opcionales):
 *   status, direction, customer_id, user_id, opportunity_id,
 *   from_date, to_date, limit, offset
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const filters: CallFilters = {};

    const status = searchParams.get('status');
    if (status) filters.status = status as CallFilters['status'];

    const direction = searchParams.get('direction');
    if (direction) filters.direction = direction as CallFilters['direction'];

    const customerId = searchParams.get('customer_id');
    if (customerId) filters.customer_id = customerId;

    const userId = searchParams.get('user_id');
    if (userId) filters.user_id = userId;

    const opportunityId = searchParams.get('opportunity_id');
    if (opportunityId) filters.opportunity_id = opportunityId;

    const fromDate = searchParams.get('from_date');
    if (fromDate) filters.from_date = fromDate;

    const toDate = searchParams.get('to_date');
    if (toDate) filters.to_date = toDate;

    const limit = searchParams.get('limit');
    if (limit) filters.limit = parseInt(limit, 10);

    const offset = searchParams.get('offset');
    if (offset) filters.offset = parseInt(offset, 10);

    const result = await getCalls(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/calls — Crea un registro de llamada manualmente.
 *
 * Body: CallCreateInput (provider, direction, from_number, to_number, ...)
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const body = await request.json();

    if (!body?.provider || !body?.direction || !body?.from_number || !body?.to_number) {
      return NextResponse.json(
        {
          success: false,
          error: 'Faltan campos obligatorios: provider, direction, from_number, to_number',
        },
        { status: 400 }
      );
    }

    const call = await createCall(
      ctx.organizationId,
      body as CallCreateInput,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: call }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
