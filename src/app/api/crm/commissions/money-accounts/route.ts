import { getServerOrgContext } from '@/lib/utils/orgContext';
import { listMoneyAccounts } from '@/lib/services/crm/commissionAdminService';
import { jsonOk, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * GET /api/crm/commissions/money-accounts — cuentas bancarias activas de la
 * organización de la sesión, para elegir de dónde sale el pago de una comisión.
 * Solo admin/manager (quien puede pagar).
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    return jsonOk(await listMoneyAccounts(ctx.organizationId, ctx.supabase));
  } catch (error) {
    return routeError(error, 'CRM Commissions Money Accounts');
  }
}
