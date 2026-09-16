import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import {
  getOnboardingInstances,
  createOnboardingInstance,
} from '@/lib/services/crm/onboardingService';

/**
 * GET /api/crm/onboarding/instances — Lista instancias de onboarding.
 * Query: ?status=&opportunity_id=&customer_id=&template_id=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters = {
      status: searchParams.get('status') || undefined,
      opportunity_id: searchParams.get('opportunity_id') || undefined,
      customer_id: searchParams.get('customer_id') || undefined,
      template_id: searchParams.get('template_id') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const result = await getOnboardingInstances(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json(
      { success: true, data: result.data, count: result.count },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Instances] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/onboarding/instances — Crea una instancia de onboarding desde una plantilla.
 * Body: { opportunity_id, template_id? } — sin `template_id` se usa la plantilla
 * activa por defecto de la organización. Idempotente por oportunidad (200 si
 * ya existía, 201 si se creó). La organización sale de la sesión; un body con
 * otra organización → 403 y se registra (regla 5).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();
    // Regla dura 5: la organización sale de la sesión; un body con otra → 403 y se registra.
    const foreignOrg = foreignOrganizationInBody(body?.organization_id, ctx.organizationId);
    if (foreignOrg !== null) {
      console.warn('[onboarding/instances POST] petición con organization_id ajeno en el body', { session: ctx.organizationId, body: foreignOrg });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }

    if (!body?.opportunity_id || typeof body.opportunity_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: opportunity_id' },
        { status: 400 }
      );
    }
    const templateId = typeof body.template_id === 'string' && body.template_id ? body.template_id : null;

    const instance = await createOnboardingInstance(
      ctx.organizationId,
      body.opportunity_id,
      templateId,
      ctx.supabase
    );

    if (!instance) {
      return NextResponse.json(
        { success: false, error: 'Oportunidad o plantilla no encontrada en la organización' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: instance }, { status: instance.already_existed ? 200 : 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Instances] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
