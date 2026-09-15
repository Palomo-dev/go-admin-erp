import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import {
  getOnboardingInstance,
  OnboardingIncompleteError,
  updateOnboardingInstanceStatus,
} from '@/lib/services/crm/onboardingService';

/**
 * GET /api/crm/onboarding/instances/[id] — Obtiene una instancia con sus steps.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const instance = await getOnboardingInstance(id, ctx.organizationId, ctx.supabase);

    if (!instance) {
      return NextResponse.json(
        { success: false, error: 'Instancia de onboarding no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: instance }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Instance] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/onboarding/instances/[id] — Actualiza el estado de una instancia.
 * Body: { status: 'active' | 'completed' | 'at_risk' | 'churned' }
 * `completed` exige todos los pasos hechos (409 si no) y mueve la oportunidad
 * a la etapa `is_won` de su pipeline de onboarding (si mover falla, la
 * instancia vuelve a `active` y se responde 500). Regla 5 en el body.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();
    // Regla dura 5: la organización sale de la sesión; un body con otra → 403 y se registra.
    const foreignOrg = foreignOrganizationInBody(body?.organization_id, ctx.organizationId);
    if (foreignOrg !== null) {
      console.warn('[onboarding/instances PATCH] petición con organization_id ajeno en el body', { session: ctx.organizationId, body: foreignOrg });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }

    const validStatuses = ['active', 'completed', 'at_risk', 'churned'];
    if (!body?.status || !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: 'status inválido. Valores permitidos: active, completed, at_risk, churned' },
        { status: 400 }
      );
    }

    const instance = await updateOnboardingInstanceStatus(
      id,
      ctx.organizationId,
      body.status,
      ctx.supabase
    );

    if (!instance) {
      return NextResponse.json(
        { success: false, error: 'Instancia no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: instance }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    if (error instanceof OnboardingIncompleteError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    if (error instanceof Error && /no encontrada/.test(error.message)) {
      return NextResponse.json({ success: false, error: 'Instancia no encontrada' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Instance] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
