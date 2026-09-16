import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getReferralById, updateReferral } from '@/lib/services/crm/referralsService';
import { validateReferralPatch } from '@/lib/services/crm/f12Validation';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referrals';
type Params = { params: Promise<{ id: string }> };

/** GET /api/crm/referrals/[id] — un referido de la organización (404 si es ajeno). */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const referral = await getReferralById(id, ctx.organizationId, ctx.supabase);
    if (!referral) return jsonFail(404, 'Referido no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(referral);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * PATCH /api/crm/referrals/[id] — datos descriptivos (nombre, correo,
 * teléfono, programa). El estado va por `/status` y la recompensa por
 * `/reward`: aquí `status`/`reward_paid` se ignoran.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body, ctx, request);
    const parsed = validateReferralPatch(body);
    if (!parsed.ok) return validationFail(parsed.errors);
    const referral = await updateReferral(id, ctx.organizationId, parsed.value, ctx.supabase);
    if (!referral) return jsonFail(404, 'Referido no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(referral);
  } catch (error) {
    return routeError(error, TAG);
  }
}
