import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { updateSequence, deleteSequence, validateSequenceInput } from '@/lib/services/crm/sequenceService';

function errorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[Sequences] ${tag}:`, message);
  const status = /inscripciones activas/i.test(message) ? 409
    : /inválida|inválido|requerido/i.test(message) ? 400
    : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * PATCH /api/crm/sequences/[id] — Actualiza una secuencia (admin).
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

    const issues = validateSequenceInput(body);
    if (issues.length) {
      return NextResponse.json({ success: false, error: 'Secuencia inválida', issues }, { status: 400 });
    }

    const sequence = await updateSequence(id, ctx.organizationId, body, ctx.supabase);
    if (!sequence) {
      return NextResponse.json({ success: false, error: 'Secuencia no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: sequence }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'PATCH error');
  }
}

/**
 * DELETE /api/crm/sequences/[id] — Elimina una secuencia (admin).
 * 409 si quedan inscripciones vivas.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;
    await deleteSequence(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'DELETE error');
  }
}
