import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { assertProgramInOrg, deleteReferralProgram, updateReferralProgram } from '@/lib/services/crm/referralsService';
import { validateProgramInput } from '@/lib/services/crm/f12Validation';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requirePartnerManager, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';
import { readOrgBody } from '@/lib/security/organizationBody';

const TAG = 'CRM Referral Programs';
type Params = { params: Promise<{ id: string }> };

/** PATCH /api/crm/referrals/programs/[id] — solo admin/manager (por id de rol, como el DELETE: cambia la recompensa); edición parcial (404 si es ajeno; 409 nombre repetido). */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    requirePartnerManager(ctx);
    const parsed = validateProgramInput(body, { partial: true });
    if (!parsed.ok) return validationFail(parsed.errors);
    const current = await assertProgramInOrg(id, ctx.organizationId, ctx.supabase);
    // La regla «descuento ≤ 100 %» se evalúa contra la fila real cuando el body no trae el tipo.
    const type = parsed.value.reward_type ?? current.reward_type;
    const amount = parsed.value.reward_amount ?? Number(current.reward_amount);
    if (type === 'discount' && amount > 100) {
      return validationFail([{ field: 'reward_amount', message: 'Un descuento no puede superar el 100 %' }]);
    }
    const program = await updateReferralProgram(id, ctx.organizationId, parsed.value, ctx.supabase);
    if (!program) return jsonFail(404, 'Programa no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(program);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/** DELETE /api/crm/referrals/programs/[id] — solo admin/manager (por id de rol); los referidos enlazados quedan con `program_id = NULL` (FK ON DELETE SET NULL). */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    // Regla dura 5 (b): sin body, pero la query podría traer otra organización.
    await readOrgBody(ctx, request);
    requirePartnerManager(ctx);
    const { id } = await params;
    const deleted = await deleteReferralProgram(id, ctx.organizationId, ctx.supabase);
    if (!deleted) return jsonFail(404, 'Programa no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk({ id });
  } catch (error) {
    return routeError(error, TAG);
  }
}
