import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAutomationRuns, type AutomationRunStatus } from '@/lib/services/crm/automationService';

/**
 * GET /api/crm/automation-runs — Lista ejecuciones de automatización.
 * Query: ?rule_id=&status=&trigger_type=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const params = request.nextUrl.searchParams;

    const result = await getAutomationRuns(ctx.organizationId, ctx.supabase, {
      rule_id: params.get('rule_id') || undefined,
      status: (params.get('status') as AutomationRunStatus | undefined) || undefined,
      trigger_type: params.get('trigger_type') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : undefined,
    });

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Runs] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
