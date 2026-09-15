import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { COHORT_LOOKBACK_MONTHS, getCohortRetention } from '@/lib/services/crm/revenueOsService';
import { addMonthsPlain } from '@/lib/services/crm/revenueOs/dateRange';
import { jsonOk, resolveRequestRange, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * GET /api/crm/revenue/cohorts?start&end — cohortes de `fn_cohort_retention`.
 * Sin `start`, se mira 24 meses atrás desde el fin (las cohortes necesitan
 * historia para M6/M12). Rango validado (400).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const hasStart = Boolean(new URL(request.url).searchParams.get('start'));
    const { timezone, today, range } = await resolveRequestRange(ctx, request);
    const start = hasStart ? range.start : addMonthsPlain(range.end, -COHORT_LOOKBACK_MONTHS);
    const cohorts = await getCohortRetention(ctx.organizationId, start, range.end, ctx.supabase);
    return jsonOk(cohorts, { period: { start, end: range.end, today, timezone } });
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Cohorts');
  }
}
