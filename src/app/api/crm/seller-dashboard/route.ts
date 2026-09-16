import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getOrgTimezone, getSellerDashboard } from '@/lib/services/crm/sellerDashboardService';
import { canSeeLeaderboard } from '@/lib/services/crm/sellerDashboardModel';
import { jsonOk, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * GET /api/crm/seller-dashboard — panel del vendedor de la sesión.
 * Sin parámetros: el usuario y la organización salen de la sesión (cualquier
 * `user_id` del query se ignora). El ranking solo viaja si el rol de sesión
 * es admin/manager (`canSeeLeaderboard`, resuelto aquí, nunca en el cliente).
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const tz = await getOrgTimezone(ctx.organizationId, ctx.supabase);
    const data = await getSellerDashboard(ctx.organizationId, ctx.userId, tz, ctx.supabase, {
      includeLeaderboard: canSeeLeaderboard(ctx),
    });
    return jsonOk(data);
  } catch (error) {
    return routeError(error, 'CRM Seller Dashboard');
  }
}
