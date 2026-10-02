import { requireSequenceManager, sequenceError } from '@/lib/services/crm/sequenceRouteSupport';
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { updateSequence, deleteSequence, validateSequenceInput } from '@/lib/services/crm/sequenceService';

const errorResponse = sequenceError;

/**
 * PATCH /api/crm/sequences/[id] — Actualiza una secuencia (admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireSequenceManager(ctx);
    const { id } = await params;
    const body = await readOrgBody(ctx, request);

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await requireSequenceManager(ctx);
    const { id } = await params;
    await deleteSequence(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'DELETE error');
  }
}
