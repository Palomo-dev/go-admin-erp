import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateOnboardingStep } from '@/lib/services/crm/onboardingService';

/**
 * PATCH /api/crm/onboarding/instances/[id]/steps/[stepId] — Actualiza un step de onboarding.
 * Body: { is_completed?: boolean, notes?: string, completed_by?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { stepId } = await params;
    const body = await request.json();

    const updateData: { is_completed?: boolean; notes?: string; completed_by?: string } = {};

    if (body?.is_completed !== undefined) {
      updateData.is_completed = Boolean(body.is_completed);
      updateData.completed_by = body.completed_by || ctx.userId;
    }

    if (body?.notes !== undefined) {
      updateData.notes = String(body.notes);
    }

    const step = await updateOnboardingStep(
      stepId,
      ctx.organizationId,
      updateData,
      ctx.supabase
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
