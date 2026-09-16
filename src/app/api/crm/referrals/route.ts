import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getReferrals, createReferral } from '@/lib/services/crm/referralsService';
import { validateReferralInput } from '@/lib/services/crm/f12Validation';
import { jsonOk, readJson, readPage, rejectForeignOrganization, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referrals';

/**
 * GET /api/crm/referrals — referidos de la organización de la sesión, con
 * referidor, programa y oportunidad resueltos.
 * Query: ?status=&program_id=&referrer_customer_id=&reward_paid=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);
    rejectForeignOrganization(TAG, null, ctx, request);
    const rewardPaid = searchParams.get('reward_paid');
    const result = await getReferrals(ctx.organizationId, ctx.supabase, {
      status: searchParams.get('status') || undefined,
      program_id: searchParams.get('program_id') || undefined,
      referrer_customer_id: searchParams.get('referrer_customer_id') || undefined,
      reward_paid: rewardPaid !== null ? rewardPaid === 'true' : undefined,
      ...readPage(searchParams),
    });
    return jsonOk(result.data, { count: result.count });
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * POST /api/crm/referrals — registra un referido. Nace `pending`, sin
 * recompensa ni enlaces: `status`, `reward_paid` y `opportunity_id` del body
 * se ignoran (van por `/status`, `/reward` y `/convert`).
 * Body: { referrer_customer_id, referred_name, referred_email?, referred_phone?, program_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body, ctx, request);
    const parsed = validateReferralInput(body);
    if (!parsed.ok) return validationFail(parsed.errors);
    const referral = await createReferral(ctx.organizationId, parsed.value, ctx.supabase);
    return jsonOk(referral, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
