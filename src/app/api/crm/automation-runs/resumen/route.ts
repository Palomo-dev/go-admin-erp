import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAutomationRunsSummary } from '@/lib/services/crm/automationService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/automation-runs/resumen — KPIs del listado de automatizaciones
 * (Figma 1373:17): ejecuciones, omitidas y errores de 7 días, la semana
 * anterior y el último estado de cada regla. Organización de la sesión.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const data = await getAutomationRunsSummary(ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Runs] resumen error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
