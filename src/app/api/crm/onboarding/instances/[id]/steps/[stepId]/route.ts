import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { updateOnboardingStep } from '@/lib/services/crm/onboardingService';

/**
 * PATCH /api/crm/onboarding/instances/[id]/steps/[stepId] — Actualiza un step de onboarding.
 * Body: { is_completed?: boolean, notes?: string }
 * `completed_by` es SIEMPRE el usuario de la sesión (nunca del body) y el
 * step debe pertenecer a la instancia `[id]` y a la organización de la sesión.
 * Regla 5: un body con otra organización → 403 y se registra.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id, stepId } = await params;
    const body = await request.json().catch(() => ({}));
    // Regla dura 5: la organización sale de la sesión; un body con otra → 403 y se registra.
    const foreignOrg = foreignOrganizationInBody(body?.organization_id, ctx.organizationId);
    if (foreignOrg !== null) {
      console.warn('[onboarding/steps PATCH] petición con organization_id ajeno en el body', { session: ctx.organizationId, body: foreignOrg });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }

    const updateData: { is_completed?: boolean; notes?: string; completed_by?: string } = {};

    if (body?.is_completed !== undefined) {
      updateData.is_completed = Boolean(body.is_completed);
      updateData.completed_by = ctx.userId;
    }

    if (body?.notes !== undefined) {
      updateData.notes = String(body.notes).slice(0, 2000);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'Nada que actualizar: envía is_completed o notes' }, { status: 400 });
    }

    const step = await updateOnboardingStep(
      stepId,
      ctx.organizationId,
      updateData,
      ctx.supabase,
      { instanceId: id }
    );

    if (!step) {
      return NextResponse.json(
        { success: false, error: 'Step no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: step }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Step] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
