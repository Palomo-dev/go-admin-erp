import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getPartners, createPartner } from '@/lib/services/crm/partnerService';
import { validatePartnerInput } from '@/lib/services/crm/f12Validation';
import { canManagePartners, jsonOk, readJson, rejectForeignOrganization, requirePartnerManager, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partners';

/**
 * GET /api/crm/partners — partners de la organización con tier, tasa efectiva
 * y resumen de comisiones (registro, no dinero). `can_manage` dice si la
 * sesión puede aprobar/pagar/rechazar comisiones y borrar partners.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const partners = await getPartners(ctx.organizationId, ctx.supabase);
    return jsonOk(partners, { can_manage: canManagePartners(ctx) });
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * POST /api/crm/partners — crea un partner.
 * Body: { name, email, company_name?, phone?, tier_id?, commission_rate? (0 = hereda del tier), is_active? }
 * 409 correo ya usado en la organización · 404 tier ajeno · 403 organization_id ajeno.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    requirePartnerManager(ctx); // crear configuración exige el mismo rol que editarla/borrarla
    const parsed = validatePartnerInput(body, { partial: false });
    if (!parsed.ok) return validationFail(parsed.errors);
    const v = parsed.value;
    const partner = await createPartner(
      ctx.organizationId,
      { name: v.name!, email: v.email!, company_name: v.company_name, phone: v.phone, tier_id: v.tier_id, commission_rate: v.commission_rate, is_active: v.is_active },
      ctx.supabase,
    );
    return jsonOk(partner, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
