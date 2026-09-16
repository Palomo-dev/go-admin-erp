import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { deletePartnerTier, updatePartnerTier } from '@/lib/services/crm/partnerService';
import { validateTierInput } from '@/lib/services/crm/f12Validation';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requirePartnerManager, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';
import { readOrgBody } from '@/lib/security/organizationBody';

const TAG = 'CRM Partner Tiers';
type Params = { params: Promise<{ id: string }> };

/** PATCH /api/crm/partners/tiers/[id] — solo admin/manager (por id de rol); umbrales, tasa, beneficios, nombre (404 ajeno; 409 nombre repetido). */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    requirePartnerManager(ctx);
    const parsed = validateTierInput(body, { partial: true });
    if (!parsed.ok) return validationFail(parsed.errors);
    const tier = await updatePartnerTier(id, ctx.organizationId, parsed.value, ctx.supabase);
    if (!tier) return jsonFail(404, 'Tier no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(tier);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/** DELETE /api/crm/partners/tiers/[id] — solo admin/manager (por id de rol, como el PATCH); 409 si algún partner lo usa (no hay FK que lo impida). */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    // Regla dura 5 (b): sin body, pero la query podría traer otra organización.
    await readOrgBody(ctx, request);
    requirePartnerManager(ctx);
    const { id } = await params;
    const deleted = await deletePartnerTier(id, ctx.organizationId, ctx.supabase);
    if (!deleted) return jsonFail(404, 'Tier no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk({ id });
  } catch (error) {
    return routeError(error, TAG);
  }
}
