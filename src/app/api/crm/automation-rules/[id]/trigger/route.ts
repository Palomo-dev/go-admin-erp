import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { executeAutomationRule, testRunAutomationRule } from '@/lib/services/crm/automationService';

/**
 * POST /api/crm/automation-rules/[id]/trigger — Ejecuta una regla a mano (admin).
 *
 * Body: `{ opportunity_id?: uuid, dry_run?: boolean }`.
 * El destinatario de los envíos NO se toma del cuerpo: el motor lo resuelve del
 * cliente de la oportunidad, de modo que el consentimiento (F7/F16) se aplica.
 * `dry_run` evalúa condiciones y devuelve el plan sin ejecutar nada.
 *
 * `force` fue RETIRADO (tester r2 N5): permitía ejecutar de verdad —con envíos
 * reales— una regla marcada como desactivada. Ahora se responde 400 y se
 * remite a `dry_run`; el interruptor `is_active` es absoluto.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;

    let body: { opportunity_id?: string; dry_run?: boolean; force?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Sin body — ejecución sin oportunidad asociada.
    }

    const opportunityId = typeof body.opportunity_id === 'string' ? body.opportunity_id : null;

    if (body.force !== undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'La opción `force` fue retirada: una regla desactivada no se ejecuta. Usa `dry_run` para probarla.',
          code: 'FORCE_REMOVED',
        },
        { status: 400 },
      );
    }

    if (body.dry_run) {
      const preview = await testRunAutomationRule(id, ctx.organizationId, opportunityId, ctx.supabase);
      return NextResponse.json({ success: true, data: preview }, { status: 200 });
    }

    const run = await executeAutomationRule(
      id,
      ctx.organizationId,
      opportunityId ? { opportunity_id: opportunityId } : {},
      ctx.supabase,
      { userId: ctx.userId },
    );

    return NextResponse.json({ success: true, data: run }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules Trigger] POST error:', message);
    const status = /no encontrada/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
