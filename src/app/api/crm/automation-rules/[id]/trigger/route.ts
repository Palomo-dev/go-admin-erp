import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { executeAutomationRule, testRunAutomationRule } from '@/lib/services/crm/automationService';
import { CrmHttpError, exigirUuid, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { automationRouteError } from '@/lib/services/crm/automation/automationRouteErrors';

const schema = z.object({ opportunity_id: z.string().uuid().nullable().optional(), dry_run: z.boolean().optional() }).strict();

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
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const { id } = await params;
    const raw: unknown = await readOrgBody(ctx, request);
    exigirUuid(id, 'Regla');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CrmHttpError(400, 'prueba_invalida', 'Body inválido');
    const body = sinClavesDeOrganizacion(raw as Record<string, unknown>);
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new CrmHttpError(400, 'prueba_invalida', 'Revisa la oportunidad y el modo de prueba');
    const opportunityId = parsed.data.opportunity_id ?? null;

    if (parsed.data.dry_run === true) {
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
    return automationRouteError(error, 'POST /api/crm/automation-rules/[id]/trigger');
  }
}
