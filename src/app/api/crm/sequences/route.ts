import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getSequences, createSequence, validateSequenceInput } from '@/lib/services/crm/sequenceService';
import { type SequenceStats } from '@/lib/services/crm/sequenceStats';
import { readSequenceOverview } from '@/lib/services/crm/sequenceOverview';
import { canManageSequences, requireSequenceManager, sequenceError } from '@/lib/services/crm/sequenceRouteSupport';

const EMPTY_STATS: SequenceStats = { active: 0, total: 0, replied: 0, response_rate: null };

const errorResponse = sequenceError;

/**
 * GET /api/crm/sequences — Lista las secuencias con sus pasos (sesión).
 * Cada una lleva `enrollment_stats` (inscritos activos, tasa de respuesta)
 * para las tarjetas de la lista (brief UX 6.3). Se llama `enrollment_stats`
 * y no `stats` porque `sequences.stats` ya es una columna jsonb.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    if (request) readOrgBody(ctx, null, { request });
    const [sequences, overview, canManage] = await Promise.all([
      getSequences(ctx.organizationId, ctx.supabase),
      readSequenceOverview(ctx.organizationId, ctx.supabase),
      canManageSequences(ctx),
    ]);
    const data = sequences.map((s) => ({ ...s, enrollment_stats: overview.stats[s.id] ?? EMPTY_STATS }));
    return NextResponse.json({ success: true, data, can_manage: canManage, summary: overview.summary }, { status: 200 });
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
    const ctx = await getServerOrgContext(request);
    await requireSequenceManager(ctx);
    const body = await readOrgBody(ctx, request);

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
