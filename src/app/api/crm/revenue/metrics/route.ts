import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getRevenueMetrics } from '@/lib/services/crm/revenueOsService';

/**
 * GET /api/crm/revenue/metrics — Métricas de revenue mensuales.
 *
 * Query params opcionales:
 * - start: fecha inicio (YYYY-MM-DD), default: 12 meses atrás
 * - end: fecha fin (YYYY-MM-DD), default: hoy
 *
 * Ejecuta fn_revenue_metrics RPC.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 12);

    const start = searchParams.get('start') || defaultStart.toISOString().slice(0, 10);
    const end = searchParams.get('end') || now.toISOString().slice(0, 10);

    const metrics = await getRevenueMetrics(ctx.organizationId, start, end, ctx.supabase);

    return NextResponse.json({ success: true, data: metrics }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Revenue Metrics] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
