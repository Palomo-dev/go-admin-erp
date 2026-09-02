import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getReferrals, createReferral } from '@/lib/services/crm/referralsService';

/**
 * GET /api/crm/referrals — Lista referidos.
 * Query: ?status=&program_id=&referrer_customer_id=&reward_paid=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const rewardPaid = searchParams.get('reward_paid');
    const filters = {
      status: searchParams.get('status') || undefined,
      program_id: searchParams.get('program_id') || undefined,
      referrer_customer_id: searchParams.get('referrer_customer_id') || undefined,
      reward_paid: rewardPaid !== null ? rewardPaid === 'true' : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const result = await getReferrals(ctx.organizationId, ctx.supabase, filters);

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
    console.error('[CRM Referrals] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/referrals — Crea un referido.
 * Body: { referrer_customer_id, referred_name, referred_email?, referred_phone?, program_id?, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.referrer_customer_id || !body?.referred_name) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: referrer_customer_id, referred_name' },
        { status: 400 }
      );
    }

    const referral = await createReferral(
      ctx.organizationId,
      {
        program_id: body.program_id,
        referrer_customer_id: body.referrer_customer_id,
        referred_customer_id: body.referred_customer_id,
        referred_name: body.referred_name,
        referred_email: body.referred_email,
        referred_phone: body.referred_phone,
        opportunity_id: body.opportunity_id,
        status: body.status,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: referral }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referrals] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
