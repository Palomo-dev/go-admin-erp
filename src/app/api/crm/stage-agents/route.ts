/**
 * GET  /api/crm/stage-agents?stage_id=…|pipeline_id=… — configuración del agente por etapa.
 * POST /api/crm/stage-agents — crea o actualiza la configuración de una etapa.
 * DELETE /api/crm/stage-agents?id=… — la elimina.
 *
 * La organización SIEMPRE sale de la sesión (`getServerOrgContext`), nunca del body.
 * Solo el dueño/administrador de la organización puede escribir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import {
  getStageAgent,
  listStageAgents,
  upsertStageAgent,
  deleteStageAgent,
  STAGE_AGENT_OBJECTIVES,
  type StageAgentChannel,
  type StageAgentObjective,
} from '@/lib/services/crm/stageAgentService';

export const runtime = 'nodejs';

function fail(error: unknown) {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error('[stage-agents]', message);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const stageId = request.nextUrl.searchParams.get('stage_id');
    const pipelineId = request.nextUrl.searchParams.get('pipeline_id');
    const channel = (request.nextUrl.searchParams.get('channel') || 'voice') as StageAgentChannel;

    if (stageId) {
      const data = await getStageAgent(ctx.supabase, ctx.organizationId, stageId, channel);
      return NextResponse.json({ success: true, data }, { status: 200 });
    }
    const data = await listStageAgents(ctx.supabase, ctx.organizationId, pipelineId || undefined);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const body = await request.json();

    if (!body?.stage_id) {
      return NextResponse.json({ success: false, error: 'Falta stage_id' }, { status: 400 });
    }
    if (!body?.objective || !STAGE_AGENT_OBJECTIVES.includes(body.objective as StageAgentObjective)) {
      return NextResponse.json(
        { success: false, error: `objective inválido. Valores: ${STAGE_AGENT_OBJECTIVES.join(', ')}` },
        { status: 400 }
      );
    }

    const data = await upsertStageAgent(
      ctx.supabase,
      ctx.organizationId,
      {
        stage_id: body.stage_id,
        voice_agent_id: body.voice_agent_id ?? null,
        channel: body.channel,
        objective: body.objective,
        objective_prompt: body.objective_prompt,
        product_id: body.product_id ?? null,
        offer: body.offer,
        trigger_on: body.trigger_on,
        trigger_config: body.trigger_config,
        allowed_tools: body.allowed_tools,
        action_policy: body.action_policy,
        max_attempts: body.max_attempts,
        config: body.config,
        is_active: body.is_active,
      },
      ctx.userId
    );
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && !(error instanceof OrgContextError)) {
      // Errores de validación de negocio → 400, no 500.
      if (/inválid|obligatori|no pertenece|hay que/i.test(error.message)) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
    }
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Falta id' }, { status: 400 });
    await deleteStageAgent(ctx.supabase, ctx.organizationId, id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return fail(error);
  }
}
