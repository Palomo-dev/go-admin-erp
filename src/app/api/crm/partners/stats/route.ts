import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { partnerNetworkStats, readF12Period } from '@/lib/services/crm/f12ReadService';
import { canManagePartners, canRegisterPartnerDeal, jsonOk, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    rejectForeignOrganization('CRM partners stats', null, ctx, request);
    const data = await partnerNetworkStats(ctx.organizationId, ctx.supabase, readF12Period(new URL(request.url).searchParams, 'year'));
    return jsonOk(data, { can_manage: await canManagePartners(ctx), can_register: await canRegisterPartnerDeal(ctx) });
  } catch (error) { return routeError(error, 'CRM partners stats'); }
}
