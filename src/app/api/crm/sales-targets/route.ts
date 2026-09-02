import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getSalesTargets, createSalesTarget } from '@/lib/services/crm/salesTargetService';

/**
 * GET /api/crm/sales-targets — Lista cuotas comerciales.
 * Query: ?user_id=&period=&target_type=&period_start=&period_end=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters = {
      user_id: searchParams.get('user_id') || undefined,
      period: searchParams.get('period') || undefined,
      target_type: searchParams.get('target_type') || undefined,
      period_start: searchParams.get('period_start') || undefined,
      period_end: searchParams.get('period_end') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const result = await getSalesTargets(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
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
    console.error('[CRM Sales Targets] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/sales-targets — Crea una cuota comercial.
 * Body: { user_id, period, period_start, period_end, target_amount, target_currency?, target_type? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.user_id || !body?.period || !body?.period_start || !body?.period_end || body?.target_amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: user_id, period, period_start, period_end, target_amount' },
        { status: 400 }
      );
    }

    const validPeriods = ['monthly', 'quarterly', 'yearly'];
    if (!validPeriods.includes(body.period)) {
      return NextResponse.json(
        { success: false, error: 'period inválido. Valores: monthly, quarterly, yearly' },
        { status: 400 }
      );
    }

    const target = await createSalesTarget(
      ctx.organizationId,
      {
        user_id: body.user_id,
        period: body.period,
        period_start: body.period_start,
        period_end: body.period_end,
        target_amount: body.target_amount,
        target_currency: body.target_currency,
        target_type: body.target_type,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: target }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Sales Targets] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
