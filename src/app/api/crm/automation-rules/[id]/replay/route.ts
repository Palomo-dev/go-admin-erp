/**
 * POST /api/crm/automation-rules/[id]/replay — prueba en seco retroactiva:
 * qué habría hecho la regla con los eventos de los últimos 30 días (Figma CRM
 * 1379:776). No ejecuta acciones ni escribe `automation_runs`.
 *
 * Mismo permiso que «Probar en seco» y «Ejecutar» (`.../trigger`): admin de la
 * organización. La organización sale de la sesión; una ajena en el body o la
 * query → 403. El body no admite nada más: no hay forma de pedir que se
 * ejecute.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdmin } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CrmHttpError, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { repetirAutomatizacion } from '@/lib/services/crm/automation/automationReplay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    requireOrgAdmin(ctx);
    const raw = await readOrgBody<unknown>(ctx, request);
    const { id } = await params;
    exigirUuid(id, 'Regla');
    const cuerpo = raw && typeof raw === 'object' && !Array.isArray(raw) ? sinClavesDeOrganizacion(raw as Record<string, unknown>) : raw ?? {};
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).length) {
      throw new CrmHttpError(400, 'prueba_invalida', 'La simulación no admite parámetros');
    }
    const data = await repetirAutomatizacion(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && /no encontrada/i.test(error.message)) {
      return respuestaErrorCrm(new CrmHttpError(404, 'regla_no_encontrada', 'Regla no encontrada'), 'POST /api/crm/automation-rules/[id]/replay');
    }
    return respuestaErrorCrm(error, 'POST /api/crm/automation-rules/[id]/replay');
  }
}
