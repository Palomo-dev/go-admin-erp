import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { markRewardPaid } from '@/lib/services/crm/referralsService';
import { jsonOk, readJson, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referrals Reward';

/**
 * POST /api/crm/referrals/[id]/reward — marca la recompensa como pagada
 * (`reward_paid`, `reward_paid_at` = ahora). Es un REGISTRO: aquí no se mueve
 * dinero. Solo `converted`, con programa, una sola vez (409 en otro caso).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const referral = await markRewardPaid(id, ctx.organizationId, ctx.supabase);
    return jsonOk(referral);
  } catch (error) {
    return routeError(error, TAG);
  }
}
