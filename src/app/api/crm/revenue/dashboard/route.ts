import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getRevenueDashboard } from '@/lib/services/crm/revenueOsService';

/**
 * GET /api/crm/revenue/dashboard — Dashboard completo de Revenue OS.
 *
 * Agrega en una sola respuesta:
 * - Revenue metrics (últimos 12 meses)
 * - Pipeline funnel (actual)
 * - Cohort retention (últimos 24 meses)
 * - KPIs calculados: MRR, ARR, ARPA, Win rate, Sales cycle, Pipeline value, Comisiones
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const dashboard = await getRevenueDashboard(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: dashboard }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Revenue Dashboard] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
