import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getRevenueMetrics } from '@/lib/services/crm/revenueOsService';
import { jsonOk, resolveRequestRange, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * GET /api/crm/revenue/metrics?start&end — filas mensuales de `fn_revenue_metrics`.
 * Rango por defecto: últimos 12 meses en la zona de la organización; validado (400).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { timezone, today, range } = await resolveRequestRange(ctx, request);
    const metrics = await getRevenueMetrics(ctx.organizationId, range.start, range.end, ctx.supabase);
    return jsonOk(metrics, { period: { ...range, today, timezone } });
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Metrics');
  }
}
