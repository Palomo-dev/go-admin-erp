import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import {
  getAutomationRules,
  createAutomationRule,
  validateRuleInput,
} from '@/lib/services/crm/automationService';

function errorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[Automation Rules] ${tag}:`, message);
  const status = /inválida|inválido|requerido/i.test(message) ? 400 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * GET /api/crm/automation-rules — Lista las reglas de la organización (sesión).
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const rules = await getAutomationRules(ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data: rules }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'GET error');
  }
}

/**
 * POST /api/crm/automation-rules — Crea una regla. Requiere rol de admin de la
 * organización (§7): una regla envía correos y WhatsApp en su nombre.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await request.json();

    if (!body?.name || !body?.trigger_type) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, trigger_type' },
        { status: 400 },
      );
    }

    const issues = validateRuleInput(body);
    if (issues.length) {
      return NextResponse.json({ success: false, error: 'Regla inválida', issues }, { status: 400 });
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
        event: body.event,
        pipeline_id: body.pipeline_id,
        stage_id: body.stage_id,
        run_once_per_opportunity: body.run_once_per_opportunity,
        cooldown_hours: body.cooldown_hours,
        created_by: ctx.userId,
      },
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error, 'POST error');
  }
}
