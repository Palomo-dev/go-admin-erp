import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  getAutomationRules,
  createAutomationRule,
  validateRuleInput,
} from '@/lib/services/crm/automationService';
import { getAutomationSummary } from '@/lib/services/crm/automation/automationSummary';
import { automationRouteError } from '@/lib/services/crm/automation/automationRouteErrors';

function errorResponse(error: unknown, tag: string): NextResponse {
  return automationRouteError(error, `Automation Rules ${tag}`);
}

/**
 * GET /api/crm/automation-rules — Lista las reglas de la organización (sesión).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const [rules, summary, canManage] = await Promise.all([
      getAutomationRules(ctx.organizationId, ctx.supabase),
      getAutomationSummary(ctx.organizationId, ctx.supabase),
      hasOrgAdminOrPermission(ctx),
    ]);
    return NextResponse.json({ success: true, data: rules, summary, can_manage: canManage }, { status: 200 });
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
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const body = await readOrgBody(ctx, request);

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
