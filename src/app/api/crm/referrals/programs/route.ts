import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getReferralPrograms, createReferralProgram } from '@/lib/services/crm/referralsService';
import { validateProgramInput } from '@/lib/services/crm/f12Validation';
import { getOrgBaseCurrency } from '@/lib/services/crm/salesTargetService';
import { jsonOk, readJson, rejectForeignOrganization, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referral Programs';

/**
 * GET /api/crm/referrals/programs — programas de la organización (?active=true
 * solo activos) y `currency`: moneda base de la organización
 * (`organization_currencies.is_base`, helper único de F13) o `null` si no
 * está configurada; la interfaz pinta la recompensa sin símbolo y lo dice.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);
    const [programs, currency] = await Promise.all([
      getReferralPrograms(ctx.organizationId, ctx.supabase, { activeOnly: searchParams.get('active') === 'true' }),
      getOrgBaseCurrency(ctx.organizationId, ctx.supabase),
    ]);
    return jsonOk(programs, { currency });
  } catch (error) {
    return routeError(error, TAG);
  }
}

/**
 * POST /api/crm/referrals/programs — crea un programa.
 * Body: { name, reward_type (credit|discount|cash|gift), reward_to (referrer|referred|both), reward_amount?, description?, is_active? }
 * 409 si el nombre ya existe (UNIQUE organization_id, name).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const parsed = validateProgramInput(body, { partial: false });
    if (!parsed.ok) return validationFail(parsed.errors);
    const v = parsed.value;
    const program = await createReferralProgram(
      ctx.organizationId,
      { name: v.name!, description: v.description, reward_type: v.reward_type!, reward_amount: v.reward_amount!, reward_to: v.reward_to!, is_active: v.is_active },
      ctx.supabase,
    );
    return jsonOk(program, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
