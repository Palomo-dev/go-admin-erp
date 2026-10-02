import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { testRunAutomationRule } from '@/lib/services/crm/automationService';

const schema = z.object({ opportunity_id: z.string().uuid().nullable().optional() }).strict();

/** Entrada de simulación exclusiva: no puede convertirse en ejecución real. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const { id } = await params;
    exigirUuid(id, 'Regla');
    const body: unknown = await readOrgBody(ctx, request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new CrmHttpError(400, 'prueba_invalida', 'Revisa la oportunidad para la prueba');
    }
    const parsed = schema.safeParse(sinClavesDeOrganizacion(body as Record<string, unknown>));
    if (!parsed.success) throw new CrmHttpError(400, 'prueba_invalida', 'Revisa la oportunidad para la prueba');
    const data = await testRunAutomationRule(id, ctx.organizationId, parsed.data.opportunity_id ?? null, ctx.supabase);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && /no encontrada/i.test(error.message)) {
      return respuestaErrorCrm(new CrmHttpError(404, 'regla_no_encontrada', 'Regla no encontrada'), 'POST /api/crm/automations/[id]/dry-run');
    }
    return respuestaErrorCrm(error, 'POST /api/crm/automations/[id]/dry-run');
  }
}
