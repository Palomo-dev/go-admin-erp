import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { referralStats, readF12Period } from '@/lib/services/crm/f12ReadService';
import { canManagePartners, canConvertReferral, jsonOk, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    rejectForeignOrganization('CRM referrals stats', null, ctx, request);
    const data = await referralStats(ctx.organizationId, ctx.supabase, readF12Period(new URL(request.url).searchParams, 'month'));
    return jsonOk(data, { can_manage: await canManagePartners(ctx), can_register: await canConvertReferral(ctx) });
  } catch (error) { return routeError(error, 'CRM referrals stats'); }
}
