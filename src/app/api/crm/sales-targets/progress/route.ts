import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getTargetProgress } from '@/lib/services/crm/salesTargetService';
import { QUOTA_PERIODS, type QuotaPeriod } from '@/lib/services/crm/quotaProgress';
import { canManageCommissions } from '@/lib/services/crm/commissionTransitions';
import { getOrgTimezone } from '@/lib/services/crm/sellerDashboardService';
import { jsonFail, jsonOk, rejectForeignOrganization, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * GET /api/crm/sales-targets/progress — progreso de cuota (persiste `achieved_amount`).
 * Query: ?user_id=<required>&period=monthly|quarterly|yearly
 * Un empleado solo puede pedir el suyo (403 si pide otro). Fechas en la zona de la organización.
 * Escribe `achieved_amount`: un `organization_id` ajeno en el query → 403 y registro.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const sp = new URL(request.url).searchParams;
    rejectForeignOrganization('CRM Sales Targets Progress', null, ctx, request);
    const userId = sp.get('user_id');
    const period = sp.get('period') || 'monthly';
    if (!userId) return jsonFail(400, 'Parámetro requerido: user_id', { field: 'user_id' });
    if (!(QUOTA_PERIODS as readonly string[]).includes(period)) return jsonFail(400, 'period inválido. Valores: monthly, quarterly, yearly', { field: 'period' });
    if (!canManageCommissions(ctx) && userId !== ctx.userId) return jsonFail(403, 'Solo puedes consultar tu propio progreso', { code: 'FORBIDDEN' });

    const tz = await getOrgTimezone(ctx.organizationId, ctx.supabase);
    const progress = await getTargetProgress(ctx.organizationId, userId, period as QuotaPeriod, ctx.supabase, tz);
    return jsonOk(progress, { timezone: tz });
  } catch (error) {
    return routeError(error, 'CRM Sales Targets Progress');
  }
}
