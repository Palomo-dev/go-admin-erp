import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getOnboardingInstanceByOpportunity } from '@/lib/services/crm/onboardingService';
import { computeOnboardingProgress, parseTemplateSteps, resolveStepOwner } from '@/lib/services/crm/onboardingProgress';

/**
 * GET /api/crm/onboarding/by-opportunity/[opportunityId] — instancia de
 * onboarding de una oportunidad (pasos + responsable de la plantilla +
 * progreso), o `data: null` si aún no se ha iniciado. La organización sale de
 * la sesión (`getServerOrgContext`); una oportunidad de otra org devuelve null.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { opportunityId } = await params;
    const inst = await getOnboardingInstanceByOpportunity(opportunityId, ctx.organizationId, ctx.supabase);
    if (!inst) {
      return NextResponse.json({ success: true, data: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
    const templateSteps = parseTemplateSteps(inst.template?.steps);
    const steps = inst.steps.map((s) => ({ ...s, owner: resolveStepOwner(s, templateSteps) }));
    const { template, ...rest } = inst;
    return NextResponse.json(
      {
        success: true,
        data: {
          ...rest,
          template_name: template?.name ?? null,
          steps,
          progress: computeOnboardingProgress(steps),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding by-opportunity] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
