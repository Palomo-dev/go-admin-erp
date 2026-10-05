import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getAutomationRuns, type AutomationRunStatus } from '@/lib/services/crm/automationService';

const schema = z.object({
  rule_id: z.string().uuid().optional(), status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']).optional(),
  trigger_type: z.enum(['stage_change', 'field_change', 'schedule', 'event', 'manual']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(), offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/**
 * GET /api/crm/automation-runs — Lista ejecuciones de automatización.
 * Query: ?rule_id=&status=&trigger_type=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const params = request.nextUrl.searchParams;
    const parsed = schema.safeParse(Object.fromEntries(['rule_id', 'status', 'trigger_type', 'limit', 'offset']
      .filter(key => params.has(key)).map(key => [key, params.get(key)])));
    if (!parsed.success) throw new CrmHttpError(400, 'filtros_invalidos', 'Revisa los filtros del historial');

    const result = await getAutomationRuns(ctx.organizationId, ctx.supabase, {
      ...parsed.data, status: parsed.data.status as AutomationRunStatus | undefined,
    });

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
      { status: 200 },
    );
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'GET /api/crm/automation-runs');
  }
}
