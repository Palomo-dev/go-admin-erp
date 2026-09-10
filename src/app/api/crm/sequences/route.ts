import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { getSequences, createSequence, validateSequenceInput } from '@/lib/services/crm/sequenceService';

function errorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[Sequences] ${tag}:`, message);
  const status = /inválida|inválido|requerido/i.test(message) ? 400 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * GET /api/crm/sequences — Lista las secuencias con sus pasos (sesión).
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const sequences = await getSequences(ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true, data: sequences }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error, 'GET error');
  }
}

/**
 * POST /api/crm/sequences — Crea una secuencia con sus pasos (admin).
 * `steps[]` se valida antes de escribir: `delay_days` entero 0–3650, canal del
 * CHECK real y `step_number` único (tester r1 #3).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json({ success: false, error: 'Falta el campo obligatorio: name' }, { status: 400 });
    }

    const issues = validateSequenceInput(body);
    if (issues.length) {
      return NextResponse.json({ success: false, error: 'Secuencia inválida', issues }, { status: 400 });
    }

    const sequence = await createSequence(
      ctx.organizationId,
      {
        name: body.name,
        description: body.description,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config,
        exit_conditions: body.exit_conditions,
        is_active: body.is_active,
        pause_on_reply: body.pause_on_reply,
        pipeline_id: body.pipeline_id,
        stage_id: body.stage_id,
        steps: body.steps,
        created_by: ctx.userId,
      },
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: sequence }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error, 'POST error');
  }
}
