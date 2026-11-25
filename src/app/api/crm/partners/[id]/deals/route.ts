import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getPartnerDeals, registerPartnerDeal, type CommissionOverride } from '@/lib/services/crm/partnerService';
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
    rejectForeignOrganization(TAG, null, ctx, request);
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
 * del tier) y nace `pending`; `commission_status` del body se ignora.
 * `commission_amount` (Figma «Registrar deal» 1318:91569: comisión editable)
 * solo se acepta de admin/manager (`canManagePartners`, por id de rol): de 0
 * al monto de la oportunidad, y si difiere de la sugerida se guarda quién
 * (usuario de la sesión) y cuándo. A cualquier otro rol se le ignora y manda
 * la calculada. Evalúa la promoción automática de tier.
 * Body: { opportunity_id, deal_type (referral|co_sell|reseller), commission_amount? }
 * 400 comisión no numérica o fuera de rango · 404 partner u oportunidad ajenos ·
 * 409 oportunidad ya registrada para el partner.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body, ctx, request);
    const parsed = validateDealInput(body);
    if (!parsed.ok) return validationFail(parsed.errors);
    let override: CommissionOverride | null = null;
    const raw = body.commission_amount;
    if (canManagePartners(ctx) && raw !== undefined && raw !== null && raw !== '') {
      const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
      if (!Number.isFinite(amount)) return validationFail([{ field: 'commission_amount', message: 'La comisión debe ser un número' }]);
      override = { amount, userId: ctx.userId };
    }
    const result = await registerPartnerDeal(id, ctx.organizationId, parsed.value, ctx.supabase, override);
    return jsonOk(result, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
