import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import {
  updateAutomationRule,
  deleteAutomationRule,
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
 * PATCH /api/crm/automation-rules/[id] — Actualiza una regla (admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;
    const body = await request.json();

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;
    await deleteAutomationRule(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'DELETE error');
  }
}
