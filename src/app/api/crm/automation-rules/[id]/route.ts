import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  updateAutomationRule,
  deleteAutomationRule,
  validateRuleInput,
} from '@/lib/services/crm/automationService';
import { exigirUuid } from '@/lib/services/crm/crmRouteSupport';
import { automationRouteError } from '@/lib/services/crm/automation/automationRouteErrors';

function errorResponse(error: unknown, tag: string): NextResponse {
  return automationRouteError(error, `Automation Rules ${tag}`);
}

/**
 * PATCH /api/crm/automation-rules/[id] — Actualiza una regla (admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const { id } = await params;
    const body = await readOrgBody(ctx, request);
    exigirUuid(id, 'Regla');

    const issues = validateRuleInput(body);
    if (issues.length) {
      return NextResponse.json({ success: false, error: 'Regla inválida', issues }, { status: 400 });
    }

    const rule = await updateAutomationRule(
      id,
      ctx.organizationId,
      { ...body, updated_by: ctx.userId },
      ctx.supabase,
    );

    if (!rule) {
      return NextResponse.json({ success: false, error: 'Regla no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: rule }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'PATCH error');
  }
}

/**
 * DELETE /api/crm/automation-rules/[id] — Elimina una regla (admin).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await requireOrgAdminOrPermission(ctx);
    const { id } = await params;
    exigirUuid(id, 'Regla');
    await deleteAutomationRule(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'DELETE error');
  }
}
