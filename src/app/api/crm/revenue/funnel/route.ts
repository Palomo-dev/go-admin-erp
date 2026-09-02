import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getPipelineFunnel } from '@/lib/services/crm/revenueOsService';

/**
 * GET /api/crm/revenue/funnel — Funnel de pipeline actual.
 *
 * Ejecuta fn_pipeline_funnel RPC.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const funnel = await getPipelineFunnel(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: funnel }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Revenue Funnel] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
