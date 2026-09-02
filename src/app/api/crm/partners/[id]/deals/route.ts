import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getPartnerDeals, createPartnerDeal } from '@/lib/services/crm/partnerService';

/**
 * GET /api/crm/partners/[id]/deals — Lista deals de un partner.
 * Query: ?deal_type=&commission_status=&limit=&offset=
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const filters = {
      partner_id: id,
      deal_type: searchParams.get('deal_type') || undefined,
      commission_status: searchParams.get('commission_status') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const result = await getPartnerDeals(ctx.organizationId, ctx.supabase, filters);

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
    console.error('[CRM Partner Deals] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/partners/[id]/deals — Crea un deal para un partner.
 * Body: { opportunity_id, deal_type, commission_amount? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.opportunity_id || !body?.deal_type) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: opportunity_id, deal_type' },
        { status: 400 }
      );
    }

    const validDealTypes = ['referral', 'co_sell', 'reseller'];
    if (!validDealTypes.includes(body.deal_type)) {
      return NextResponse.json(
        { success: false, error: 'deal_type inválido. Valores: referral, co_sell, reseller' },
        { status: 400 }
      );
    }

    const deal = await createPartnerDeal(
      ctx.organizationId,
      {
        partner_id: id,
        opportunity_id: body.opportunity_id,
        deal_type: body.deal_type,
        commission_amount: body.commission_amount,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: deal }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partner Deals] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
