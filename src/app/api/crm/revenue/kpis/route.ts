import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getKpiCards } from '@/lib/services/crm/revenueOsService';

/**
 * GET /api/crm/revenue/kpis — KPI cards del dashboard.
 *
 * Retorna:
 * - pipeline_value: SUM opportunities.amount WHERE status='open'
 * - revenue_this_month: payments WHERE status='completed' AND payment_date en mes actual
 * - win_rate: won / (won + lost)
 * - open_deals: count opportunities WHERE status='open'
 * - calls_this_week: count calls en la semana actual
 * - emails_this_week: count email_messages en la semana actual
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const kpis = await getKpiCards(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: kpis }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Revenue KPIs] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
