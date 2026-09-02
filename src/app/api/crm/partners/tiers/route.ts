import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getPartnerTiers, createPartnerTier } from '@/lib/services/crm/partnerService';

/**
 * GET /api/crm/partners/tiers — Lista tiers de partners.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const tiers = await getPartnerTiers(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: tiers }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partner Tiers] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/partners/tiers — Crea un tier de partner.
 * Body: { name, min_deals?, min_revenue?, commission_rate?, benefits? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name' },
        { status: 400 }
      );
    }

    const tier = await createPartnerTier(
      ctx.organizationId,
      {
        name: body.name,
        min_deals: body.min_deals,
        min_revenue: body.min_revenue,
        commission_rate: body.commission_rate,
        benefits: body.benefits,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: tier }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partner Tiers] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
