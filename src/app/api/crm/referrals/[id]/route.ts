import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateReferralStatus, markRewardPaid } from '@/lib/services/crm/referralsService';

/**
 * PATCH /api/crm/referrals/[id] — Actualiza un referido.
 * Body: { status?: 'pending'|'contacted'|'qualified'|'converted'|'rejected', reward_paid?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    let result = null;

    if (body?.status) {
      const validStatuses = ['pending', 'contacted', 'qualified', 'converted', 'rejected'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: 'status inválido' },
          { status: 400 }
        );
      }
      result = await updateReferralStatus(id, ctx.organizationId, body.status, ctx.supabase);
    }

    if (body?.reward_paid === true) {
      result = await markRewardPaid(id, ctx.organizationId, ctx.supabase);
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Referido no encontrado o sin cambios' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Referrals] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
