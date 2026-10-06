/**
 * «Probar» del editor de agentes de voz (Figma CRM 1318:775924, paso 5 de 5).
 *
 * Conversación de PRUEBA por texto con un cliente ficticio, sin marcar a nadie
 * ni ejecutar herramientas: lo que el agente pediría hacer vuelve como
 * «sugerida». Usa EXACTAMENTE lo que usa la llamada real (regla dura 7):
 *  - el prompt y el saludo de `agentRuntime` (`buildSystemPrompt`, `buildGreeting`),
 *    con la misma base de conocimiento (`cargarConocimientoVoz`), la fecha en la
 *    zona de la organización y la política de datos;
 *  - las mismas herramientas (`herramientasPermitidasVoz`) y el mismo modelo
 *    (`modeloVozDelAgente`) por el mismo adaptador (`openModelStream`).
 *
 * Créditos (CLAUDE.md §IA): se comprueba el saldo ANTES de llamar al proveedor
 * y se cobra con `chargeAiCredits` DESPUÉS de tener respuesta; una generación
 * fallida no se cobra. Permiso: `crm.campaigns.manage`, resuelto en la ruta.
 * SOLO servidor.
 */
import { z } from 'zod';
import { openModelStream, type AdapterChunk, type AdapterMessage } from '@/lib/ai/agent/openaiAdapter';
import type { JsonSchemaObject } from '@/lib/ai/agent/types';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits, InsufficientCreditsError } from './aiCostService';
import { getVoiceAgent, DEFAULT_FIRST_MESSAGE, DEFAULT_SYSTEM_PROMPT } from './voiceAgentService';
import {
  buildGreeting,
  buildSystemPrompt,
  cargarConocimientoVoz,
  DEFAULT_IDENTITY_DISCLOSURE,
  herramientasPermitidasVoz,
  modeloVozDelAgente,
  resolveMaxResponseTokens,
} from './voiceAgent/agentRuntime';
import { politicaDatosValida, zonaHorariaOrganizacion } from './voiceAgent/cumplimiento';
import { toolDefinitionsFor } from './voiceAgentTools';
import { resolveStageAgentContext } from './stageAgentService';
import { CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';

/** Rondas de herramientas antes de exigir una respuesta en texto (igual que la llamada). */
const RONDAS_HERRAMIENTAS = 2;

/** Lo que el editor manda del agente sin guardar (todas opcionales: manda la fila si existe). */
const borradorSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    purpose_type: z.string().max(40).optional(),
    system_prompt: z.string().max(20_000).optional(),
    first_message: z.string().max(2000).optional(),
    identity_disclosure: z.string().max(500).optional(),
    language: z.string().max(20).optional(),
    llm_model: z.string().max(80).optional(),
    temperature: z.number().min(0).max(2).optional(),
    allowed_tools: z.array(z.string().max(60)).max(40).optional(),
    max_turns: z.number().int().min(1).max(100).optional(),
    guardrails: z.record(z.unknown()).optional(),
    transfer_to_human_rules: z.record(z.unknown()).optional(),
  })
  .strict();

export const pruebaAgenteSchema = z
  .object({
    agent_id: z.string().uuid().nullable().optional(),
    /** Etapa del embudo (`stage_agents.id`) de ESTE agente: su objetivo y sus herramientas mandan. */
    stage_agent_id: z.string().uuid().nullable().optional(),
    draft: borradorSchema.optional(),
    customer: z.object({ name: z.string().trim().min(1).max(100), context: z.string().max(2000).default('') }).strict(),
    message: z.string().trim().min(1).max(3000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(5000) }).strict()).max(40).default([]),
  })
  .strict();
export type PruebaAgenteInput = z.infer<typeof pruebaAgenteSchema>;

export interface HerramientaSugerida {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** `suggested` = la habría ejecutado en una llamada real; `denied` = no está permitida o los argumentos no sirven. */
  status: 'suggested' | 'denied';
}

export interface ResultadoPruebaAgente {
  greeting: string;
  reply: string;
  model: string;
  tool_calls: HerramientaSugerida[];
  usage: { prompt_tokens: number; completion_tokens: number };
  credits: number;
  dry_run: true;
}

/** Una herramienta pedida por el modelo → sugerencia (nunca se ejecuta). */
export function sugerirHerramienta(call: NonNullable<AdapterChunk['toolCall']>, permitidas: readonly string[]): HerramientaSugerida {
  let args: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(call.arguments || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('args');
    args = raw as Record<string, unknown>;
  } catch {
    return { id: call.id, name: call.name, args, status: 'denied' };
  }
  return { id: call.id, name: call.name, args, status: permitidas.includes(call.name) ? 'suggested' : 'denied' };
}

/** Instrucción extra del modo prueba: deja claro al modelo que nada tiene efectos. */
export function instruccionPrueba(customer: { name: string; context: string }, idioma: string): string {
  return (
    '\nPRUEBA EN SECO: conversas por texto con un cliente ficticio. Las herramientas son solo sugerencias sin ' +
    'efectos: no digas que creaste, enviaste, agendaste ni llamaste nada. No hay acceso a fichas reales. ' +
    `Contexto ficticio del cliente: ${JSON.stringify(customer)}. Responde en el idioma ${idioma}.`
  );
}

export async function probarAgenteVoz(ctx: CrmSesion, raw: unknown): Promise<ResultadoPruebaAgente> {
  const parsed = pruebaAgenteSchema.safeParse(raw);
  if (!parsed.success) throw new CrmHttpError(400, 'prueba_invalida', 'Datos de la prueba inválidos');
  const input = parsed.data;
  const id = input.agent_id ? exigirUuid(input.agent_id, 'agente') : null;
  const guardado = id ? await getVoiceAgent(id, ctx.organizationId, ctx.supabase) : null;
  if (id && !guardado) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
  const agente = { ...(guardado ?? {}), ...(input.draft ?? {}) } as Partial<NonNullable<typeof guardado>> & z.infer<typeof borradorSchema>;
  if (!agente.name?.trim()) throw new CrmHttpError(400, 'agente_incompleto', 'Ponle nombre al agente antes de probarlo');
  const turnos = Math.min(agente.max_turns ?? 20, 100);
  if (input.history.length >= turnos * 2) throw new CrmHttpError(409, 'limite_turnos', 'La prueba llegó al máximo de turnos del agente');

  const [orgRes, commRes, zonaHoraria, conocimiento, modelo] = await Promise.all([
    ctx.supabase.from('organizations').select('name').eq('id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('comm_settings').select('data_policy_url').eq('organization_id', ctx.organizationId).maybeSingle(),
    zonaHorariaOrganizacion(ctx.supabase, ctx.organizationId),
    cargarConocimientoVoz(ctx.supabase, ctx.organizationId),
    modeloVozDelAgente(ctx.supabase, ctx.organizationId, agente.llm_model),
  ]);
  if (orgRes.error) throw orgRes.error;
  if (commRes.error) throw commRes.error;
  const organizationName = (orgRes.data as { name?: string } | null)?.name || 'nuestra empresa';
  const politica = (commRes.data as { data_policy_url?: string | null } | null)?.data_policy_url ?? null;
  const identityDisclosure = agente.identity_disclosure?.trim() || DEFAULT_IDENTITY_DISCLOSURE;
  let stage: Awaited<ReturnType<typeof resolveStageAgentContext>> = null;
  if (input.stage_agent_id) {
    const fila = await ctx.supabase
      .from('stage_agents')
      .select('id, voice_agent_id, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('id', input.stage_agent_id)
      .maybeSingle();
    if (fila.error) throw fila.error;
    const sa = fila.data as { voice_agent_id: string | null; is_active: boolean } | null;
    if (!sa || !sa.is_active || !id || sa.voice_agent_id !== id) throw new CrmHttpError(400, 'etapa_no_disponible', 'Esa etapa no usa este agente');
    stage = await resolveStageAgentContext(ctx.supabase, ctx.organizationId, { stageAgentId: input.stage_agent_id });
  }
  const permitidas = herramientasPermitidasVoz(stage?.allowedTools, agente.allowed_tools);

  const greeting = buildGreeting({
    firstMessage: agente.first_message ?? DEFAULT_FIRST_MESSAGE,
    identityDisclosure,
    organizationName,
    customerName: input.customer.name,
    recordingEnabled: false,
    consentMessage: '',
  });
  const prompt = buildSystemPrompt({
    organizationName,
    identityDisclosure,
    agent: {
      name: agente.name,
      system_prompt: agente.system_prompt || DEFAULT_SYSTEM_PROMPT,
      purpose_type: agente.purpose_type ?? 'custom',
      guardrails: (agente.guardrails ?? {}) as Record<string, unknown>,
      transfer_to_human_rules: (agente.transfer_to_human_rules ?? {}) as Record<string, unknown>,
      max_turns: turnos,
    } as Parameters<typeof buildSystemPrompt>[0]['agent'],
    stage,
    customerName: input.customer.name,
    recordingEnabled: false,
    consentMessage: '',
    contexto: { ahora: new Date(), zonaHoraria, politicaDatosUrl: politicaDatosValida(politica) ? politica : null },
    conocimiento,
  });
  const messages: AdapterMessage[] = [
    { role: 'system', content: prompt + instruccionPrueba(input.customer, agente.language ?? 'es-CO') },
    { role: 'assistant', content: greeting },
    ...input.history,
    { role: 'user', content: input.message },
  ];

  // Saldo ANTES del proveedor; el cobro, después de la respuesta.
  const saldo = await checkAICredits(ctx.organizationId);
  if (!saldo.allowed) throw new InsufficientCreditsError('ai', saldo.error);

  const herramientas = toolDefinitionsFor(permitidas).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as unknown as JsonSchemaObject,
  }));
  const sugeridas: HerramientaSugerida[] = [];
  let reply = '';
  let modeloReal = modelo;
  let promptTokens = 0;
  let completionTokens = 0;
  for (let ronda = 0; ronda <= RONDAS_HERRAMIENTAS; ronda++) {
    const stream = await openModelStream({
      model: modeloReal,
      messages,
      tools: ronda < RONDAS_HERRAMIENTAS ? herramientas : [],
      temperature: Number(agente.temperature ?? 0.7),
      maxTokens: resolveMaxResponseTokens(agente.guardrails as Record<string, unknown> | undefined),
      logTag: '[CRM prueba agente]',
    });
    modeloReal = stream.model;
    const pedidas: NonNullable<AdapterChunk['toolCall']>[] = [];
    let texto = '';
    for await (const chunk of stream.chunks) {
      if (chunk.delta) texto += chunk.delta;
      if (chunk.toolCall) pedidas.push(chunk.toolCall);
      if (chunk.usage) {
        promptTokens += Math.max(0, chunk.usage.promptTokens || 0);
        completionTokens += Math.max(0, chunk.usage.completionTokens || 0);
      }
    }
    if (pedidas.length === 0) {
      reply = texto.trim();
      break;
    }
    messages.push({ role: 'assistant', content: texto || null, toolCalls: pedidas });
    for (const call of pedidas) {
      const s = sugerirHerramienta(call, permitidas);
      sugeridas.push(s);
      messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify({ ...s, dry_run: true, applied: false }) });
    }
  }
  if (!reply) throw new CrmHttpError(502, 'respuesta_vacia', 'El modelo no devolvió una respuesta');

  const cobro = await chargeAiCredits({
    orgId: ctx.organizationId,
    actionType: 'voice_agent_test',
    model: modeloReal,
    units: Math.max(1, promptTokens + completionTokens),
    userId: ctx.userId,
    metadata: { dry_run: true, voice_agent_id: id, stage_agent_id: input.stage_agent_id ?? null, prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
  return {
    greeting,
    reply,
    model: modeloReal,
    tool_calls: sugeridas,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    credits: cobro.credits,
    dry_run: true,
  };
}
