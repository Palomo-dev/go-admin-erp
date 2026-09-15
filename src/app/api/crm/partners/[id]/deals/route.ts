import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getPartnerDeals, registerPartnerDeal } from '@/lib/services/crm/partnerService';
import { validateDealInput } from '@/lib/services/crm/f12Validation';
import { canManagePartners, jsonOk, readJson, readPage, rejectForeignOrganization, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partner Deals';
type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/crm/partners/[id]/deals — deals del partner con la oportunidad resuelta.
 * Query: ?deal_type=&commission_status=&limit=&offset= · 404 partner ajeno.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    rejectForeignOrganization(TAG, searchParams.get('organization_id'), ctx);
    const result = await getPartnerDeals(id, ctx.organizationId, ctx.supabase, {
      deal_type: searchParams.get('deal_type') || undefined,
      commission_status: searchParams.get('commission_status') || undefined,
      ...readPage(searchParams),
    });
    return jsonOk(result.data, { count: result.count, can_manage: canManagePartners(ctx) });
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * POST /api/crm/partners/[id]/deals — registra un deal. La comisión se
 * calcula en servidor (monto de la oportunidad × tasa efectiva del partner o
 * del tier) y nace `pending`; `commission_amount`/`commission_status` del body
 * se ignoran. Evalúa la promoción automática de tier.
 * Body: { opportunity_id, deal_type (referral|co_sell|reseller) }
 * 404 partner u oportunidad ajenos · 409 oportunidad ya registrada para el partner.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const parsed = validateDealInput(body);
    if (!parsed.ok) return validationFail(parsed.errors);
    const result = await registerPartnerDeal(id, ctx.organizationId, parsed.value, ctx.supabase);
    return jsonOk(result, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
