import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getStageAgent, listStageAgents, upsertStageAgent, deleteStageAgent, STAGE_AGENT_OBJECTIVES, STAGE_AGENT_CHANNELS, STAGE_AGENT_TRIGGERS } from '@/lib/services/crm/stageAgentService';
import { ALL_TOOL_NAMES, MANDATORY_TOOLS } from '@/lib/services/crm/voiceAgentTools';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
export const runtime = 'nodejs';
const schema = z.object({ stage_id: z.string().uuid(), voice_agent_id: z.string().uuid().nullable().optional(), channel: z.enum(STAGE_AGENT_CHANNELS).optional(), objective: z.enum(STAGE_AGENT_OBJECTIVES), objective_prompt: z.string().max(16000).nullable().optional(), product_id: z.number().int().positive().nullable().optional(), offer: z.record(z.unknown()).optional(), trigger_on: z.enum(STAGE_AGENT_TRIGGERS).optional(), trigger_config: z.record(z.unknown()).optional(), allowed_tools: z.array(z.string().refine(t => ALL_TOOL_NAMES.includes(t))).max(ALL_TOOL_NAMES.length).optional(), action_policy: z.enum(['auto', 'suggest']).optional(), max_attempts: z.number().int().min(1).max(10).optional(), config: z.record(z.unknown()).optional(), is_active: z.boolean().optional(), expected_updated_at: z.string().datetime({ offset: true }).nullable().optional() }).strict();
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request); const query = new URL(request.url).searchParams;
    readOrgBody(ctx, query, { request }); await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar, CRM_PERMISOS.etapasGestionar], 'GET stage-agents');
    const stageId = query.get('stage_id'), pipelineId = query.get('pipeline_id'); const channel = STAGE_AGENT_CHANNELS.find(value => value === (query.get('channel') ?? 'voice'));
    if (!channel) throw new CrmHttpError(400, 'canal_invalido', 'Canal inválido');
    if (stageId) exigirUuid(stageId, 'etapa'); if (pipelineId) exigirUuid(pipelineId, 'embudo');
    const data = stageId ? await getStageAgent(ctx.supabase, ctx.organizationId, stageId, channel) : await listStageAgents(ctx.supabase, ctx.organizationId, pipelineId ?? undefined);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET stage-agents'); }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request); const raw = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasGestionar], 'POST stage-agents');
    const parsed = schema.safeParse(sinClavesDeOrganizacion(raw));
    if (!parsed.success) throw new CrmHttpError(400, 'etapa_agente_invalida', 'Configuración de etapa inválida');
    const body = parsed.data; const current = await getStageAgent(ctx.supabase, ctx.organizationId, body.stage_id, body.channel ?? 'voice');
    if (current?.voice_agent_id && current.voice_agent_id !== body.voice_agent_id) throw new CrmHttpError(409, 'etapa_otro_agente', 'La etapa está asignada a otro agente');
    const stage = await ctx.supabase.from('stages').select('id, is_won, is_lost, pipelines:pipeline_id(organization_id)').eq('id', body.stage_id).maybeSingle();
    if (stage.error) throw stage.error;
    const ownPipeline = stage.data?.pipelines as unknown as { organization_id: number } | null;
    if (!stage.data || ownPipeline?.organization_id !== ctx.organizationId) throw new CrmHttpError(404, 'etapa_no_encontrada', 'Etapa no encontrada');
    if (stage.data.is_won || stage.data.is_lost) throw new CrmHttpError(400, 'etapa_cerrada', 'Las etapas de cierre no admiten agente');
    if (body.product_id) {
      const product = await ctx.supabase.from('products').select('id').eq('organization_id', ctx.organizationId).eq('id', body.product_id).maybeSingle();
      if (product.error) throw product.error;
      if (!product.data) throw new CrmHttpError(404, 'producto_no_encontrado', 'Producto no encontrado');
    }
    if (body.voice_agent_id) {
      const agent = await ctx.supabase.from('voice_agents').select('id, allowed_tools').eq('organization_id', ctx.organizationId).eq('id', body.voice_agent_id).maybeSingle();
      if (agent.error) throw agent.error;
      if (!agent.data) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
      const allowed = new Set([...(agent.data.allowed_tools ?? []), ...MANDATORY_TOOLS]);
      if (body.allowed_tools?.some(tool => !allowed.has(tool))) throw new CrmHttpError(400, 'herramienta_no_permitida', 'La etapa sólo admite herramientas del agente');
      body.allowed_tools = [...new Set([...(body.allowed_tools ?? agent.data.allowed_tools ?? []), ...MANDATORY_TOOLS])];
    }
    return NextResponse.json({ success: true, data: await upsertStageAgent(ctx.supabase, ctx.organizationId, body, ctx.userId, { preventReassignment: true, expectedUpdatedAt: body.expected_updated_at }) });
  } catch (error) { return respuestaErrorCrm(error, 'POST stage-agents'); }
}
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request); await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasGestionar], 'DELETE stage-agents'); const id = exigirUuid(new URL(request.url).searchParams.get('id') ?? '', 'configuración');
    await deleteStageAgent(ctx.supabase, ctx.organizationId, id); return NextResponse.json({ success: true });
  } catch (error) { return respuestaErrorCrm(error, 'DELETE stage-agents'); }
}
