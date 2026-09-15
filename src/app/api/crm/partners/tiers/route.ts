import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getPartnerTiers, createPartnerTier } from '@/lib/services/crm/partnerService';
import { validateTierInput } from '@/lib/services/crm/f12Validation';
import { jsonOk, readJson, rejectForeignOrganization, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partner Tiers';

/** GET /api/crm/partners/tiers — tiers de la organización, de menor a mayor exigencia. */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const tiers = await getPartnerTiers(ctx.organizationId, ctx.supabase);
    return jsonOk(tiers);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * POST /api/crm/partners/tiers — crea un tier.
 * Body: { name, min_deals?, min_revenue?, commission_rate?, benefits?: string[] }
 * 409 si el nombre ya existe (UNIQUE organization_id, name).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const parsed = validateTierInput(body, { partial: false });
    if (!parsed.ok) return validationFail(parsed.errors);
    const v = parsed.value;
    const tier = await createPartnerTier(
      ctx.organizationId,
      { name: v.name!, min_deals: v.min_deals, min_revenue: v.min_revenue, commission_rate: v.commission_rate, benefits: v.benefits },
      ctx.supabase,
    );
    return jsonOk(tier, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
