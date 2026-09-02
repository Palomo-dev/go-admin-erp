import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAutomationRules, createAutomationRule } from '@/lib/services/crm/automationService';

/**
 * GET /api/crm/automation-rules — Lista las reglas de automatización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const rules = await getAutomationRules(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: rules }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/automation-rules — Crea una regla de automatización.
 * Body: { name, description?, trigger_type, trigger_config?, conditions?, actions?, is_active?, priority? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.trigger_type) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, trigger_type' },
        { status: 400 },
      );
    }

    const rule = await createAutomationRule(
      ctx.organizationId,
      {
        name: body.name,
        description: body.description,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config,
        conditions: body.conditions,
        actions: body.actions,
        is_active: body.is_active,
        priority: body.priority,
      },
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Automation Rules] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
