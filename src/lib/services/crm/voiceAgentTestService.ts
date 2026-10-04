import { z } from 'zod';
import { openModelStream, type AdapterMessage, type AdapterChunk } from '@/lib/ai/agent/openaiAdapter';
import type { JsonSchemaObject } from '@/lib/ai/agent/types';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { chargeAiCredits, InsufficientCreditsError } from './aiCostService';
import { getVoiceAgent, DEFAULT_FIRST_MESSAGE, DEFAULT_SYSTEM_PROMPT } from './voiceAgentService';
import { buildSystemPrompt, buildGreeting, resolveMaxResponseTokens } from './voiceAgent/agentRuntime';
import { zonaHorariaOrganizacion, politicaDatosValida } from './voiceAgent/cumplimiento';
import { resolveStageAgentContext } from './stageAgentService';
import { toolDefinitionsFor, MANDATORY_TOOLS } from './voiceAgentTools';
import { parseVoiceAgentConfig, validateAgentReferences } from './voiceAgentConfig';
import { CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';

export const voiceAgentTestSchema = z.object({
  draft: z.record(z.unknown()).optional(), stage_agent_id: z.string().uuid().nullable().optional(),
  customer: z.object({ name: z.string().trim().min(1).max(100), context: z.string().max(2000) }).strict(),
  message: z.string().trim().min(1).max(3000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(5000) }).strict()).max(40).default([]),
}).strict();
export type VoiceAgentTestInput = z.infer<typeof voiceAgentTestSchema>;
export interface TestToolCall { id: string; name: string; args: Record<string, unknown>; status: 'suggested' | 'denied'; }
export interface VoiceAgentTestResult { reply: string; greeting: string; model: string; tool_calls: TestToolCall[]; usage: { prompt_tokens: number; completion_tokens: number }; credits: number; cost_amount: number | null; dry_run: true }

/** Único simulador: no ejecuta herramientas, no guarda trazas ni lee clientes. */
export function suggestTestTool(call: NonNullable<AdapterChunk['toolCall']>, allowed: string[]): TestToolCall {
  let args: Record<string, unknown> = {};
  try { const raw: unknown = JSON.parse(call.arguments); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('args'); args = raw as Record<string, unknown>; }
  catch { return { id: call.id, name: call.name, args, status: 'denied' }; }
  return { id: call.id, name: call.name, args, status: allowed.includes(call.name) ? 'suggested' : 'denied' };
}
export async function testVoiceAgent(ctx: CrmSesion, id: string | null, raw: unknown): Promise<VoiceAgentTestResult> {
  const parsed = voiceAgentTestSchema.safeParse(raw);
  if (!parsed.success) throw new CrmHttpError(400, 'prueba_invalida', 'Prueba inválida');
  const input = parsed.data;
  if (id) exigirUuid(id, 'agente');
  const current = id ? await getVoiceAgent(id, ctx.organizationId, ctx.supabase) : null;
  if (id && !current) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
  const draft = input.draft ? parseVoiceAgentConfig(input.draft, !current) : null;
  if (!current && !draft) throw new CrmHttpError(400, 'agente_requerido', 'Configura el agente');
  if (draft) await validateAgentReferences(ctx, draft, current ?? undefined);
  const agent = { ...current, ...draft };
  const model = agent.llm_model?.trim();
  if (!model || !agent.name || !agent.identity_disclosure?.trim()) throw new CrmHttpError(400, 'agente_incompleto', 'Configura nombre, identidad y modelo');
  const turns = Math.min(agent.max_turns ?? 20, 100);
  if (input.history.length >= turns * 2) throw new CrmHttpError(400, 'limite_turnos', 'Se alcanzó el límite de turnos');
  const modelRow = await ctx.supabase.from('ai_modelos_disponibles').select('provider, model').eq('model', model).maybeSingle();
  if (modelRow.error) throw modelRow.error;
  if (!modelRow.data || modelRow.data.provider !== 'openai') throw new CrmHttpError(400, 'modelo_no_disponible', 'El runtime de voz requiere un modelo compatible del catálogo');
  const [org, comm, tz] = await Promise.all([
    ctx.supabase.from('organizations').select('name').eq('id', ctx.organizationId).single(),
    ctx.supabase.from('comm_settings').select('data_policy_url').eq('organization_id', ctx.organizationId).maybeSingle(),
    zonaHorariaOrganizacion(ctx.supabase, ctx.organizationId),
  ]);
  if (org.error) throw org.error; if (comm.error) throw comm.error;
  let stage = null;
  if (input.stage_agent_id) {
    const row = await ctx.supabase.from('stage_agents').select('id, voice_agent_id, is_active').eq('organization_id', ctx.organizationId).eq('id', input.stage_agent_id).maybeSingle();
    if (row.error) throw row.error;
    if (!row.data || !row.data.is_active || !id || row.data.voice_agent_id !== id) throw new CrmHttpError(400, 'etapa_no_disponible', 'Etapa no disponible para este agente');
    stage = await resolveStageAgentContext(ctx.supabase, ctx.organizationId, { stageAgentId: input.stage_agent_id });
  }
  const allowed = [...new Set([...(stage?.allowedTools?.length ? stage.allowedTools : agent.allowed_tools ?? []), ...MANDATORY_TOOLS])];
  const identity = agent.identity_disclosure;
  const organizationName = org.data.name;
  const greeting = buildGreeting({ firstMessage: agent.first_message ?? DEFAULT_FIRST_MESSAGE, identityDisclosure: identity, organizationName, customerName: input.customer.name, recordingEnabled: false, consentMessage: '' });
  const prompt = buildSystemPrompt({ organizationName, identityDisclosure: identity, agent: { name: agent.name, system_prompt: agent.system_prompt || DEFAULT_SYSTEM_PROMPT, purpose_type: agent.purpose_type ?? 'custom', guardrails: agent.guardrails ?? {}, transfer_to_human_rules: agent.transfer_to_human_rules ?? {}, max_turns: turns }, stage, customerName: input.customer.name, recordingEnabled: false, consentMessage: '', contexto: { ahora: new Date(), zonaHoraria: tz, politicaDatosUrl: politicaDatosValida(comm.data?.data_policy_url) ? comm.data?.data_policy_url ?? null : null } });
  const messages: AdapterMessage[] = [{ role: 'system', content: `${prompt}\nPRUEBA EN SECO: conversas por texto con un cliente ficticio. Todas las herramientas son sugerencias sin efectos; no afirmes que creaste, enviaste, agendaste o llamaste. No hay acceso a fichas reales. Contexto ficticio: ${JSON.stringify(input.customer)}. Responde en el idioma ${agent.language ?? 'es-CO'}.` }, { role: 'assistant', content: greeting }, ...input.history, { role: 'user', content: input.message }];
  // El cliente privilegiado sólo se obtiene después de validar sesión, agente y etapa.
  const settings = await ensureAiSettings(ctx.organizationId, getServiceClient());
  if (settings.credits_remaining < 1) throw new InsufficientCreditsError('ai');
  const toolCalls: TestToolCall[] = []; let reply = ''; let actualModel = model; let promptTokens = 0; let completionTokens = 0;
  for (let round = 0; round < 3; round++) {
    const stream = await openModelStream({ model: actualModel, messages, tools: round === 2 ? [] : toolDefinitionsFor(allowed).map(t => ({ ...t.function, parameters: t.function.parameters as unknown as JsonSchemaObject })), temperature: Number(agent.temperature ?? 0.7), maxTokens: resolveMaxResponseTokens(agent.guardrails ?? {}), logTag: '[CRM prueba agente]' });
    actualModel = stream.model;
    const calls: NonNullable<AdapterChunk['toolCall']>[] = []; let text = ''; let usage = false;
    for await (const chunk of stream.chunks) {
      if (chunk.delta) text += chunk.delta;
      if (chunk.toolCall) calls.push(chunk.toolCall);
      if (chunk.usage) { if (!Number.isFinite(chunk.usage.promptTokens) || !Number.isFinite(chunk.usage.completionTokens) || chunk.usage.promptTokens < 0 || chunk.usage.completionTokens < 0) throw new CrmHttpError(502, 'uso_invalido', 'Uso IA inválido'); promptTokens += chunk.usage.promptTokens; completionTokens += chunk.usage.completionTokens; usage = true; }
    }
    if (!usage) throw new CrmHttpError(502, 'uso_ausente', 'El proveedor no informó consumo');
    if (!calls.length) { reply = text.trim(); break; }
    messages.push({ role: 'assistant', content: text || null, toolCalls: calls });
    for (const call of calls) { const suggestion = suggestTestTool(call, allowed); toolCalls.push(suggestion); messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify({ ...suggestion, dry_run: true, applied: false, fictional_context: input.customer }) }); }
  }
  if (!reply) throw new CrmHttpError(502, 'respuesta_vacia', 'El proveedor no devolvió una respuesta');
  const charged = await chargeAiCredits({ orgId: ctx.organizationId, actionType: 'voice_agent_test', model: actualModel, units: promptTokens + completionTokens, userId: ctx.userId, metadata: { dry_run: true, voice_agent_id: id, stage_agent_id: input.stage_agent_id ?? null, prompt_tokens: promptTokens, completion_tokens: completionTokens } });
  return { reply, greeting, model: actualModel, tool_calls: toolCalls, usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens }, credits: charged.credits, cost_amount: charged.cost_amount, dry_run: true };
}
