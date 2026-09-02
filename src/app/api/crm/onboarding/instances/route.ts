import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
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
 * Body: { opportunity_id, template_id }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.opportunity_id || !body?.template_id) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: opportunity_id, template_id' },
        { status: 400 }
      );
    }

    const instance = await createOnboardingInstance(
      ctx.organizationId,
      body.opportunity_id,
      body.template_id,
      ctx.supabase
    );

    if (!instance) {
      return NextResponse.json(
        { success: false, error: 'No se pudo crear la instancia de onboarding' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: instance }, { status: 201 });
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
