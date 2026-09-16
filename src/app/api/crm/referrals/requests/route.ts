import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getReferralRequests } from '@/lib/services/crm/referralsService';
import { jsonOk, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referral Requests';

/**
 * GET /api/crm/referrals/requests — tareas «pedir referido» abiertas
 * (`tasks.type='referido'`, las crea F10 al ganar una oportunidad), con el
 * cliente ganado resuelto para prellenar el registro del referido.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const requests = await getReferralRequests(ctx.organizationId, ctx.supabase);
    return jsonOk(requests);
  } catch (error) {
    return routeError(error, TAG);
  }
}
