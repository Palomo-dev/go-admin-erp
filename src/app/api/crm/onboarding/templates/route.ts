import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getOnboardingTemplatesServer,
  createOnboardingTemplateServer,
} from '@/lib/services/crm/onboardingService';

/**
 * GET /api/crm/onboarding/templates — Lista plantillas de onboarding.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const templates = await getOnboardingTemplatesServer(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: templates }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Templates] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/onboarding/templates — Crea una plantilla de onboarding.
 * Body: { name, steps, default_duration_days?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.steps) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, steps' },
        { status: 400 }
      );
    }

    const template = await createOnboardingTemplateServer(
      ctx.organizationId,
      {
        name: body.name,
        steps: body.steps,
        default_duration_days: body.default_duration_days,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Onboarding Templates] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
