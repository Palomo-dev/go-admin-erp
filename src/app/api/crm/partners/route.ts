import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getPartners, createPartner } from '@/lib/services/crm/partnerService';

/**
 * GET /api/crm/partners — Lista partners.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const partners = await getPartners(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: partners }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partners] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/partners — Crea un partner.
 * Body: { name, email, company_name?, phone?, tier_id?, commission_rate?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.email) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, email' },
        { status: 400 }
      );
    }

    const partner = await createPartner(
      ctx.organizationId,
      {
        name: body.name,
        company_name: body.company_name,
        email: body.email,
        phone: body.phone,
        tier_id: body.tier_id,
        commission_rate: body.commission_rate,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: partner }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Partners] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
