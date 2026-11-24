import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAutomationRuns, type AutomationRunStatus } from '@/lib/services/crm/automationService';
import { esFiltroHistorial } from '@/lib/services/crm/automation/automationListaLogica';

const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;

/**
 * GET /api/crm/automation-runs — Historial de ejecuciones (Figma 1373:1161).
 * Query: ?rule_id=&status=&trigger_type=&resultado=todas|ejecutadas|omitidas|conError|seco
 *        &desde=ISO&hasta=ISO&limit=&offset=
 * Siempre filtrado por la organización de la sesión.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const params = request.nextUrl.searchParams;
    const resultado = params.get('resultado');
    const desde = params.get('desde');
    const hasta = params.get('hasta');

    const result = await getAutomationRuns(ctx.organizationId, ctx.supabase, {
      rule_id: params.get('rule_id') || undefined,
      status: (params.get('status') as AutomationRunStatus | undefined) || undefined,
      trigger_type: params.get('trigger_type') || undefined,
      resultado: esFiltroHistorial(resultado) ? resultado : undefined,
      since: desde && ISO.test(desde) ? desde : undefined,
      until: hasta && ISO.test(hasta) ? hasta : undefined,
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
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Runs] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
