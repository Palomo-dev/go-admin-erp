import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getReferralPrograms, createReferralProgram } from '@/lib/services/crm/referralsService';

/**
 * GET /api/crm/referrals/programs — Lista programas de referidos.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const programs = await getReferralPrograms(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: programs }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referral Programs] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/referrals/programs — Crea un programa de referidos.
 * Body: { name, reward_type, reward_amount, reward_to, description?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.reward_type || !body?.reward_to) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, reward_type, reward_to' },
        { status: 400 }
      );
    }

    const program = await createReferralProgram(
      ctx.organizationId,
      {
        name: body.name,
        description: body.description,
        reward_type: body.reward_type,
        reward_amount: body.reward_amount ?? 0,
        reward_to: body.reward_to,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: program }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referral Programs] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
