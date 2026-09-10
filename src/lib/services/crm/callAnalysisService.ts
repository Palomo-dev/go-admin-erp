import type { SupabaseClient } from '@supabase/supabase-js';
import { Type, type Schema } from '@google/genai';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import { chargeAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { getUnitCost } from '@/lib/services/crm/pricingService';
import { getCallAiPolicy, type CallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { getTranscript, renderTranscriptForLlm, reconcileAiUsageModel, CreditLedger } from '@/lib/services/crm/transcriptionService';
import { recommendedGeminiModel } from '@/lib/services/crm/stt/geminiAudio';
import { tagCall } from '@/lib/services/crm/callTagService';
import { evaluateStageGate, type GateResult } from '@/lib/services/crm/stageGateService';
import {
  analysisZod,
  renderCallAnalysisPrompt,
  CALL_ANALYSIS_PROMPT_VERSION,
  SENTIMENTS,
  TEMPERATURES,
  TASK_TYPES,
  TASK_PRIORITIES,
  STEP_OWNERS,
  type AnalysisPromptContext,
  type CallAnalysisLlm,
} from '@/lib/services/crm/prompts/callAnalysisPrompt';
import {
  validateSuggestedStage,
  mapObjectionsToCatalog,
  buildTaskRow,
  buildObjectionRow,
  mergeDiscovery,
  maskSensitiveForLlm,
  assertDbEnum,
  AI_AUTHOR_VALUE,
  CALL_TAG_SOURCE_VALUES,
  type MappedObjection,
  type StageRef,
} from '@/lib/services/crm/callAnalysisRules';

/**
 * Servicio CRM — FASE 4: análisis IA de llamadas. SOLO SERVIDOR.
 * Tablas: call_analyses, call_transcripts, call_tags, call_tag_relations, tasks, opportunities, opportunity_objections.
 *
 * Pipeline: transcripción completada → contexto real (cliente, oportunidad,
 * etapas del pipeline, objeciones, etiquetas) → prompt v1 (español) → Gemini
 * 3.8 Flash con responseSchema ─fallo─► OpenAI gpt-5.6-luna (responses.parse
 * + zodTextFormat) → validación (etapa ∈ pipeline, objeciones ↔ catálogo,
 * tareas con enums reales) → call_analyses → etiquetas automáticas.
 * Créditos IA se debitan ANTES del proveedor (D6) y se reembolsan si falla.
 *
 * Fixes: C-6 (`customers.first_name/last_name/full_name`, `opportunities.name`),
 * C16 (`mixed`), tasks `priority='med'`/`status='open'`, stage validada + gate.
 *
 * DESVIACIÓN (sin DDL): temperatura, objection_ids, etiquetas sugeridas,
 * applied_actions, policy, prompt_version y costo van en `raw_response`
 * (columnas de FASE-04 §3.1 aún no existen).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AnalysisRawResponse {
  llm?: CallAnalysisLlm;
  provider_chain?: Array<{ provider: string; ok: boolean; error?: string; ms: number }>;
  temperature?: 'cold' | 'warm' | 'hot' | null;
  objection_ids?: string[];
  suggested_tags?: string[];
  applied_actions?: string[];
  policy?: 'auto' | 'suggest';
  prompt_version?: string;
  cost_usd?: number | null;
  credits?: number;
  rejected_stage_id?: string | null;
  stage_confidence_threshold?: number;
  usage?: Record<string, unknown> | null;
  error?: string;
  [k: string]: unknown;
}

export interface CallAnalysis {
  id: string;
  organization_id: number;
  call_id: string;
  transcript_id: string | null;
  provider: string;
  model: string | null;
  summary: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  quality_score: number | null;
  quality_breakdown: Record<string, unknown> | null;
  talk_ratio_agent: number | null;
  talk_ratio_customer: number | null;
  longest_monologue_seconds: number | null;
  questions_asked: number | null;
  next_steps: Array<{ action: string; owner?: string; due_date?: string | null; description?: string }> | null;
  detected_objections: MappedObjection[] | null;
  detected_competitors: string[] | null;
  budget_mentioned: number | null;
  decision_maker_identified: boolean | null;
  discovery_fields: Record<string, unknown> | null;
  suggested_stage_id: string | null;
  suggested_stage_confidence: number | null;
  suggested_tasks: Array<{ title: string; type?: string; priority?: string; due_date?: string | null; description?: string }> | null;
  applied: boolean;
  applied_by: string | null;
  applied_at: string | null;
  raw_response: AnalysisRawResponse | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisFilters {
  callId?: string;
  sentiment?: string;
  minQualityScore?: number;
  applied?: boolean;
  limit?: number;
  offset?: number;
}

export interface CallQualityMetric {
  user_id: string | null;
  call_date: string;
  total_calls: number;
  analyzed_calls: number;
  avg_quality: number | null;
  avg_talk_ratio_agent: number | null;
  avg_duration_seconds: number | null;
}

export interface AnalysisContext {
  call: { id: string; direction: string; mode: string | null; durationSeconds: number | null; userId: string | null; startedAt: string | null; customerId: string | null; opportunityId: string | null };
  customer: { id: string; fullName: string | null; companyName: string | null } | null;
  opportunity: {
    id: string; name: string; amount: number | null; currency: string | null; stageId: string; stageName: string; pipelineId: string;
    salespersonId: string | null; stages: StageRef[]; discoveryData: Record<string, unknown>;
  } | null;
  objections: Array<{ id: string; title: string; category: string; detection_signals: unknown }>;
  tags: Array<{ id: string; name: string }>;
  recentActivities: Array<{ type: string; outcome: string | null; occurredAt: string }>;
  transcript: { id: string; text: string; segmentCount: number; durationSeconds: number | null };
  policy: CallAiPolicy;
}

export type ApplyActions = { stage?: boolean; tasks?: number[] | 'all'; tags?: boolean; discovery?: boolean; objections?: boolean };
export interface ApplyResult {
  analysis: CallAnalysis;
  applied: string[];
  skipped: Array<{ action: string; reason: string }>;
  gate?: GateResult;
}

export class AnalysisError extends Error {
  code: 'NO_TRANSCRIPT' | 'INSUFFICIENT_CREDITS' | 'PROVIDER_ERROR' | 'CALL_NOT_FOUND' | 'PERSIST_ERROR';
  retryable: boolean;
  constructor(code: AnalysisError['code'], message: string, retryable = false) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
    this.retryable = retryable;
  }
}

// ─── Schema Gemini (Type + nullable) ─────────────────────────────────────────

export function toGeminiSchema(): Schema {
  const str = (nullable = false): Schema => ({ type: Type.STRING, nullable });
  const num = (nullable = false): Schema => ({ type: Type.NUMBER, nullable });
  const int = (): Schema => ({ type: Type.INTEGER });
  return {
    type: Type.OBJECT,
    required: ['summary', 'sentiment', 'sentiment_score', 'quality_score', 'quality_breakdown', 'talk_ratio_agent', 'talk_ratio_customer', 'longest_monologue_seconds', 'questions_asked', 'next_steps', 'objections', 'competitors', 'budget_mentioned', 'decision_maker_identified', 'discovery', 'suggested_stage_id', 'suggested_stage_confidence', 'suggested_tasks', 'tags', 'temperature'],
    properties: {
      summary: str(),
      sentiment: { type: Type.STRING, enum: [...SENTIMENTS] },
      sentiment_score: num(),
      quality_score: int(),
      quality_breakdown: { type: Type.OBJECT, required: ['greeting', 'discovery', 'pitch', 'objection_handling', 'closing', 'professionalism'], properties: { greeting: int(), discovery: int(), pitch: int(), objection_handling: int(), closing: int(), professionalism: int() } },
      talk_ratio_agent: num(),
      talk_ratio_customer: num(),
      longest_monologue_seconds: int(),
      questions_asked: int(),
      next_steps: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['action', 'owner', 'due_date'], properties: { action: str(), owner: { type: Type.STRING, enum: [...STEP_OWNERS] }, due_date: str(true) } } },
      objections: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['objection_id', 'label', 'quote', 'confidence'], properties: { objection_id: str(true), label: str(), quote: str(), confidence: num() } } },
      competitors: { type: Type.ARRAY, items: str() },
      budget_mentioned: num(true),
      decision_maker_identified: { type: Type.BOOLEAN },
      discovery: { type: Type.OBJECT, required: ['budget', 'authority', 'need', 'timeline', 'goals', 'obstacles', 'consequences'], properties: { budget: str(true), authority: str(true), need: str(true), timeline: str(true), goals: str(true), obstacles: str(true), consequences: str(true) } },
      suggested_stage_id: str(true),
      suggested_stage_confidence: num(),
      suggested_tasks: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['title', 'type', 'priority', 'due_date'], properties: { title: str(), type: { type: Type.STRING, enum: [...TASK_TYPES] }, priority: { type: Type.STRING, enum: [...TASK_PRIORITIES] }, due_date: str(true) } } },
      tags: { type: Type.ARRAY, items: str() },
      temperature: { type: Type.STRING, enum: [...TEMPERATURES] },
    },
  };
}

// ─── Contexto ────────────────────────────────────────────────────────────────

function exitCriteriaText(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 300);
  try {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.requirements)) return (o.requirements as Array<Record<string, unknown>>).map((r) => String(r.label ?? r.field ?? r.type ?? '')).filter(Boolean).join('; ').slice(0, 300);
    return Object.entries(o).filter(([, v]) => v).map(([k, v]) => (typeof v === 'boolean' ? k : `${k}=${String(v)}`)).join('; ').slice(0, 300);
  } catch {
    return '';
  }
}

export async function buildAnalysisContext(orgId: number, callId: string, supabase: SupabaseClient, policy?: CallAiPolicy): Promise<AnalysisContext> {
  const { data: callRow } = await supabase
    .from('calls')
    .select('id, direction, mode, duration_seconds, customer_id, opportunity_id, user_id, started_at')
    .eq('id', callId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!callRow) throw new AnalysisError('CALL_NOT_FOUND', `La llamada ${callId} no pertenece a la organización`);
  const c = callRow as Record<string, unknown>;

  const transcript = await getTranscript(callId, orgId, supabase, true);
  if (!transcript || transcript.status !== 'completed' || (!transcript.full_text && !(transcript.segments?.length))) {
    throw new AnalysisError('NO_TRANSCRIPT', 'La llamada no tiene transcripción completada');
  }
  const segments = transcript.segments ?? [];
  // §7: la transcripción sale del sistema hacia un proveedor de IA; se enmascaran
  // tarjetas/CVV/claves antes de enviarla (maskSensitiveForLlm documenta qué NO).
  const text = maskSensitiveForLlm(segments.length ? renderTranscriptForLlm(segments) : (transcript.full_text ?? ''));

  let customer: AnalysisContext['customer'] = null;
  if (c.customer_id) {
    const { data } = await supabase.from('customers').select('id, first_name, last_name, full_name, company_name').eq('id', c.customer_id).eq('organization_id', orgId).maybeSingle();
    if (data) {
      const d = data as Record<string, string | null>;
      customer = { id: d.id as string, fullName: d.full_name ?? ([d.first_name, d.last_name].filter(Boolean).join(' ') || null), companyName: d.company_name ?? null };
    }
  }

  let opportunity: AnalysisContext['opportunity'] = null;
  if (c.opportunity_id) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('id, name, amount, currency, stage_id, pipeline_id, discovery_data, salesperson_id')
      .eq('id', c.opportunity_id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (opp) {
      const o = opp as Record<string, unknown>;
      const { data: stages } = await supabase.from('stages').select('id, name, position, exit_criteria').eq('pipeline_id', o.pipeline_id as string).order('position', { ascending: true });
      const stageList = ((stages ?? []) as Array<Record<string, unknown>>).map((s) => ({ id: s.id as string, name: s.name as string, position: s.position as number, exit_criteria: s.exit_criteria }));
      opportunity = {
        id: o.id as string,
        name: (o.name as string) ?? '',
        amount: (o.amount as number) ?? null,
        currency: (o.currency as string) ?? null,
        stageId: o.stage_id as string,
        stageName: stageList.find((s) => s.id === o.stage_id)?.name ?? '',
        pipelineId: o.pipeline_id as string,
        salespersonId: (o.salesperson_id as string) ?? null,
        stages: stageList.map((s) => ({ id: s.id, name: s.name, position: s.position, exitCriteriaText: exitCriteriaText(s.exit_criteria) })) as StageRef[],
        discoveryData: ((o.discovery_data as Record<string, unknown>) ?? {}),
      };
    }
  }

  const [{ data: objections }, { data: tags }] = await Promise.all([
    supabase.from('objections').select('id, title, category, detection_signals').eq('organization_id', orgId).eq('is_active', true).order('sort_order', { ascending: true }).limit(60),
    supabase.from('call_tags').select('id, name').eq('organization_id', orgId).order('name').limit(100),
  ]);

  let recentActivities: AnalysisContext['recentActivities'] = [];
  if (opportunity) {
    const { data: acts } = await supabase
      .from('activities')
      .select('activity_type, outcome, occurred_at')
      .eq('organization_id', orgId)
      .eq('related_type', 'opportunity')
      .eq('related_id', opportunity.id)
      .neq('call_id', callId)
      .order('occurred_at', { ascending: false })
      .limit(5);
    recentActivities = ((acts ?? []) as Array<Record<string, unknown>>).map((a) => ({ type: a.activity_type as string, outcome: (a.outcome as string) ?? null, occurredAt: a.occurred_at as string }));
  }

  return {
    call: {
      id: callId,
      direction: (c.direction as string) ?? 'outbound',
      mode: (c.mode as string) ?? null,
      durationSeconds: (c.duration_seconds as number) ?? transcript.duration_seconds ?? null,
      userId: (c.user_id as string) ?? null,
      startedAt: (c.started_at as string) ?? null,
      customerId: (c.customer_id as string) ?? null,
      opportunityId: (c.opportunity_id as string) ?? null,
    },
    customer,
    opportunity,
    objections: ((objections ?? []) as AnalysisContext['objections']),
    tags: ((tags ?? []) as AnalysisContext['tags']),
    recentActivities,
    transcript: { id: transcript.id, text, segmentCount: segments.length, durationSeconds: transcript.duration_seconds },
    policy: policy ?? (await getCallAiPolicy(orgId)),
  };
}

function toPromptContext(ctx: AnalysisContext): AnalysisPromptContext {
  return {
    call: { direction: ctx.call.direction, durationSeconds: ctx.call.durationSeconds, startedAt: ctx.call.startedAt },
    customer: ctx.customer ? { fullName: ctx.customer.fullName, companyName: ctx.customer.companyName } : null,
    opportunity: ctx.opportunity
      ? { name: ctx.opportunity.name, amount: ctx.opportunity.amount, currency: ctx.opportunity.currency, stageId: ctx.opportunity.stageId, stageName: ctx.opportunity.stageName, stages: ctx.opportunity.stages.map((s) => ({ id: s.id, name: s.name, exitCriteriaText: (s as StageRef & { exitCriteriaText?: string }).exitCriteriaText ?? '' })), discoveryData: ctx.opportunity.discoveryData }
      : null,
    objections: ctx.objections.map((o) => ({ id: o.id, title: o.title, category: o.category, signalsText: Array.isArray(o.detection_signals) ? (o.detection_signals as unknown[]).map(String).join(', ').slice(0, 200) : '' })),
    tags: ctx.tags.map((t) => t.name),
    recentActivities: ctx.recentActivities,
    transcript: { text: ctx.transcript.text, segmentCount: ctx.transcript.segmentCount },
  };
}

// ─── Proveedores LLM ─────────────────────────────────────────────────────────

interface LlmOutcome {
  parsed: CallAnalysisLlm;
  provider: 'google' | 'openai';
  model: string;
  usage: { input: number; output: number } | null;
  chain: Array<{ provider: string; ok: boolean; error?: string; ms: number }>;
}

interface LlmRun {
  parsed: CallAnalysisLlm;
  usage: LlmOutcome['usage'];
  /** Modelo realmente usado (puede diferir si Gemini recomendó otro). */
  model?: string;
}

async function runGemini(apiKey: string, model: string, prompt: string): Promise<LlmRun> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  let usedModel = model;
  const call = async (extra = '') => {
    const response = await ai.models.generateContent({
      model: usedModel,
      contents: prompt + extra,
      config: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(), temperature: 0.2 },
    });
    if (!response.text) throw new Error('Gemini no devolvió texto');
    const u = response.usageMetadata;
    return { text: response.text, usage: u ? { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 } : null };
  };
  let r: Awaited<ReturnType<typeof call>>;
  try {
    r = await call();
  } catch (err) {
    // 404 "no longer available to new users … use models/X" (visto en E2E F4) → un reintento con X.
    const alt = recommendedGeminiModel(err);
    if (!alt || alt === usedModel) throw err;
    console.warn(`[callAnalysis] gemini: ${usedModel} no disponible, reintentando con ${alt}`);
    usedModel = alt;
    r = await call();
  }
  try {
    return { parsed: analysisZod.parse(JSON.parse(r.text)), usage: r.usage, model: usedModel };
  } catch {
    // Un reintento de reparación (caso borde 10 de FASE-04 §9.4).
    r = await call('\n\nLa respuesta anterior no cumplía el esquema. Responde SOLO con el JSON válido.');
    return { parsed: analysisZod.parse(JSON.parse(r.text)), usage: r.usage, model: usedModel };
  }
}

async function runOpenAi(apiKey: string, model: string, prompt: string): Promise<LlmRun> {
  const { default: OpenAI } = await import('openai');
  const { zodTextFormat } = await import('openai/helpers/zod');
  const openai = new OpenAI({ apiKey });
  const params = {
    model,
    reasoning: { effort: 'none' },
    store: false,
    input: [
      { role: 'system', content: 'Devuelve solo JSON conforme al esquema.' },
      { role: 'user', content: prompt },
    ],
    text: { format: zodTextFormat(analysisZod, 'call_analysis') },
  };
  const response = await openai.responses.parse(params as unknown as Parameters<typeof openai.responses.parse>[0]);
  const first = response.output?.[0] as { type?: string } | undefined;
  if (first?.type === 'refusal') throw new Error('OpenAI rechazó la solicitud (refusal)');
  const parsed = (response as { output_parsed?: unknown }).output_parsed;
  if (!parsed) throw new Error('OpenAI no devolvió output_parsed');
  const u = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  return { parsed: analysisZod.parse(parsed), usage: u ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0 } : null };
}

/** Cadena: proveedor `analysis` de la org (google por defecto) → el otro. Inyectable en tests vía `runners`. */
export async function runAnalysisLlm(
  orgId: number,
  prompt: string,
  policy: CallAiPolicy,
  runners?: Partial<Record<'google' | 'openai', (model: string) => Promise<LlmRun>>>,
): Promise<LlmOutcome> {
  const order: Array<'google' | 'openai'> = policy.analysisProvider === 'openai' ? ['openai', 'google'] : ['google', 'openai'];
  const chain: LlmOutcome['chain'] = [];
  let lastErr: unknown = null;
  for (const p of order) {
    const started = Date.now();
    try {
      let model: string;
      let run: (m: string) => Promise<LlmRun>;
      if (runners?.[p]) {
        model = p === 'google' ? (policy.analysisModel.startsWith('gemini') ? policy.analysisModel : 'gemini-3.8-flash') : 'gpt-5.6-luna';
        run = runners[p]!;
      } else {
        const cfg = await getProviderCredentials(orgId, 'analysis', p);
        const key = p === 'google' ? (cfg.credentials.GOOGLE_AI_API_KEY ?? cfg.credentials.GEMINI_API_KEY) : cfg.credentials.OPENAI_API_KEY;
        if (!cfg.isActive || !key) throw new Error(`Sin credenciales para ${p}`);
        const cfgModel = typeof cfg.settings?.model === 'string' ? (cfg.settings.model as string) : '';
        model = p === 'google' ? (cfgModel.startsWith('gemini') ? cfgModel : policy.analysisModel.startsWith('gemini') ? policy.analysisModel : 'gemini-3.8-flash') : (cfgModel.startsWith('gpt') ? cfgModel : 'gpt-5.6-luna');
        run = (m) => (p === 'google' ? runGemini(key, m, prompt) : runOpenAi(key, m, prompt));
      }
      const out = await run(model);
      chain.push({ provider: p, ok: true, ms: Date.now() - started });
      return { parsed: out.parsed, provider: p, model: out.model ?? model, usage: out.usage, chain };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      chain.push({ provider: p, ok: false, error: msg.slice(0, 300), ms: Date.now() - started });
      console.warn(`[callAnalysis] ${p} falló: ${msg.slice(0, 200)}`);
    }
  }
  const status = (lastErr as { status?: number })?.status;
  throw new AnalysisError('PROVIDER_ERROR', `Todos los proveedores de análisis fallaron: ${chain.map((c) => `${c.provider}=${c.error ?? 'ok'}`).join(' | ')}`, !status || status === 429 || status >= 500);
}

// ─── analyzeCall ─────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  force?: boolean;
  supabase?: SupabaseClient;
  jobId?: string | null;
  userId?: string | null;
  /** Inyección de runners LLM (tests). */
  runners?: Parameters<typeof runAnalysisLlm>[3];
}

function temperatureTag(t: string): string {
  return t === 'hot' ? 'Caliente' : t === 'cold' ? 'Frío' : 'Tibio';
}

/**
 * Analiza una llamada transcrita. Devuelve el análisis existente (último) si
 * ya hay uno y no `force`. Lanza `AnalysisError` (code/retryable).
 */
export async function analyzeCall(orgId: number, callId: string, opts: AnalyzeOptions = {}): Promise<CallAnalysis> {
  const sb = opts.supabase ?? getServiceClient();
  if (!opts.force) {
    const existing = await getAnalysis(callId, orgId, sb);
    if (existing && existing.summary) return existing;
  }
  const policy = await getCallAiPolicy(orgId);
  const ctx = await buildAnalysisContext(orgId, callId, sb, policy);
  const prompt = renderCallAnalysisPrompt(toPromptContext(ctx));

  // Créditos antes del proveedor (D6). Costo estimado con provider_pricing.
  const estTokensIn = Math.ceil(prompt.length / 4);
  const estTokensOut = 1500;
  const provider = policy.analysisProvider === 'openai' ? 'openai' : 'google';
  const skuIn = provider === 'openai' ? 'gpt_5_6_luna_in' : 'gemini_3_8_flash_in';
  const skuOut = provider === 'openai' ? 'gpt_5_6_luna_out' : 'gemini_3_8_flash_out';
  const [uIn, uOut] = await Promise.all([getUnitCost(provider, skuIn).catch(() => null), getUnitCost(provider, skuOut).catch(() => null)]);
  // Fallback documentado (docs-gemini.md): gemini-3.8-flash $0.75 in / $3.75 out por 1M
  // (promo hasta 31-dic-2026; $1.50/$7.50 después) si el sku no está sembrado.
  const inCost = uIn ?? (provider === 'google' ? 0.75 : 0.2);
  const outCost = uOut ?? (provider === 'google' ? 3.75 : 1.2);
  const estUsd = Number(((estTokensIn / 1e6) * inCost + (estTokensOut / 1e6) * outCost).toFixed(6));
  const credits = Math.max(1, Math.ceil(estUsd * 100));

  let charge: { credits: number; logId: number | null };
  try {
    charge = await chargeAiCredits({
      orgId,
      actionType: 'call_analyze',
      model: policy.analysisModel,
      provider,
      unitSku: uIn != null ? skuIn : undefined,
      units: estTokensIn / 1e6,
      credits,
      userId: opts.userId ?? ctx.call.userId,
      metadata: { call_id: callId, transcript_id: ctx.transcript.id, estimated_cost_usd: estUsd, job_id: opts.jobId ?? null },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) throw new AnalysisError('INSUFFICIENT_CREDITS', err.message, false);
    throw err;
  }

  /**
   * A partir de aquí los créditos YA están debitados. Cualquier salida por error
   * debe devolver EL SALDO NETO (cobro inicial + ajustes − lo ya devuelto por
   * `settle`), ni más ni menos: el libro mayor lo lleva la cuenta.
   *
   * Tester r1 nº 2 (cobrar 3 veces sin devolver) y r2 nº 1/nº 2 (devolver 59 por
   * un cobro de 30, o perder el débito de ajuste).
   */
  const ledger = new CreditLedger({
    orgId,
    actionType: 'call_analyze',
    model: policy.analysisModel,
    provider,
    charged: charge.credits,
    logId: charge.logId,
    userId: opts.userId ?? ctx.call.userId,
    supabase: sb,
  });
  /** Sufijo visible cuando el reembolso NO se pudo aplicar (tester r2 nº 4). */
  const refundSuffix = (r: { ok: boolean; refunded: number }) => (r.ok ? '' : ` (ADEMÁS: no se pudieron devolver ${ledger.unrefunded} créditos, revisa ai_usage_logs 'call_analyze:refund_failed')`);

  let out: LlmOutcome;
  try {
    out = await runAnalysisLlm(orgId, prompt, policy, opts.runners);
  } catch (err) {
    const refund = await ledger.refundOutstanding(err);
    // Fallo del PROVEEDOR: puede ser transitorio → el job puede reintentar.
    const base = err instanceof AnalysisError ? err : new AnalysisError('PROVIDER_ERROR', err instanceof Error ? err.message : 'Error LLM', true);
    if (!refund.ok) base.message = `${base.message}${refundSuffix(refund)}`;
    throw base;
  }

  try {
    return await persistAnalysis({ orgId, callId, ctx, policy, out, charge, ledger, provider, inCost, outCost, estUsd, sb, jobId: opts.jobId ?? null });
  } catch (err) {
    // Fallo DETERMINISTA posterior al modelo (CHECK, columna, red a Postgres):
    // reintentar sólo repetiría el gasto. Se reembolsa y se marca NO reintentable.
    const refund = await ledger.refundOutstanding(err);
    const base = err instanceof AnalysisError
      ? err
      : new AnalysisError('PERSIST_ERROR', err instanceof Error ? err.message : 'No se pudo guardar el análisis', false);
    if (!refund.ok) base.message = `${base.message}${refundSuffix(refund)}`;
    throw base;
  }
}

interface PersistAnalysisArgs {
  orgId: number;
  callId: string;
  ctx: AnalysisContext;
  policy: CallAiPolicy;
  out: LlmOutcome;
  charge: { credits: number; logId: number | null };
  /** Libro mayor de créditos de esta ejecución (cobros y devoluciones netos). */
  ledger: CreditLedger;
  provider: 'google' | 'openai';
  inCost: number;
  outCost: number;
  estUsd: number;
  sb: SupabaseClient;
  jobId: string | null;
}

/**
 * Valida la salida del LLM, reconcilia costo/créditos con el proveedor que
 * realmente respondió y guarda `call_analyses`. Separada de `analyzeCall` para
 * que TODO lo que ocurre después del cobro quede bajo un único try/catch con
 * reembolso garantizado.
 */
async function persistAnalysis(args: PersistAnalysisArgs): Promise<CallAnalysis> {
  const { orgId, callId, ctx, policy, out, charge, ledger, provider, inCost, outCost, estUsd, sb, jobId } = args;
  const llm = out.parsed;
  const stage = validateSuggestedStage(llm.suggested_stage_id, llm.suggested_stage_confidence, ctx.opportunity?.stages ?? [], ctx.opportunity?.stageId);
  const objections = mapObjectionsToCatalog(llm.objections, ctx.objections);
  const objectionIds = Array.from(new Set(objections.map((o) => o.objection_id).filter((x): x is string => !!x)));
  // D6 / tester r1 nº 4 y nº 5: el costo, el sku y los créditos se recalculan con
  // el proveedor y los tokens REALES, no con la estimación por longitud del prompt.
  const realSkuIn = out.provider === 'openai' ? 'gpt_5_6_luna_in' : 'gemini_3_8_flash_in';
  const realSkuOut = out.provider === 'openai' ? 'gpt_5_6_luna_out' : 'gemini_3_8_flash_out';
  let realInCost = inCost;
  let realOutCost = outCost;
  if (out.provider !== provider) {
    const [rIn, rOut] = await Promise.all([getUnitCost(out.provider, realSkuIn).catch(() => null), getUnitCost(out.provider, realSkuOut).catch(() => null)]);
    realInCost = rIn ?? (out.provider === 'google' ? 0.75 : 0.2);
    realOutCost = rOut ?? (out.provider === 'google' ? 3.75 : 1.2);
  }
  const tokensIn = out.usage?.input ?? 0;
  const tokensOut = out.usage?.output ?? 0;
  const realUsd = out.usage ? Number(((tokensIn / 1e6) * realInCost + (tokensOut / 1e6) * realOutCost).toFixed(6)) : estUsd;
  const changed = out.provider !== provider || out.model !== policy.analysisModel;
  // El log se corrige SIEMPRE que haya tokens reales (aunque no hubiera fallback):
  // antes el camino feliz dejaba `cost_amount` con la estimación de entrada.
  let reconciled: boolean | null = null;
  if (changed || out.usage) {
    reconciled = await reconcileAiUsageModel(sb, charge.logId, {
      provider: out.provider,
      model: out.model,
      costUsd: realUsd,
      unitSku: realSkuIn,
      units: tokensIn / 1e6,
      unitCostUsd: realInCost,
      extra: { real_tokens_in: tokensIn, real_tokens_out: tokensOut, unit_sku_out: realSkuOut, cost_source: out.usage ? 'provider_usage' : 'estimated' },
      fellBack: changed,
    });
    // Tester r2 nº 10: una reconciliación fallida dejaba el log mintiendo en
    // silencio; ahora se registra y queda en `raw_response`.
    if (!reconciled) console.error(`[callAnalysis] la reconciliación de ai_usage_logs=${charge.logId ?? 'n/a'} falló: el log conserva el proveedor/modelo estimado`);
  }
  const settled = await ledger.settle({
    model: out.model,
    provider: out.provider,
    realCredits: Math.max(1, Math.ceil(realUsd * 100)),
    metadata: { call_id: callId, reason: changed ? 'provider_fallback' : 'real_usage', estimated_cost_usd: estUsd, real_cost_usd: realUsd },
  });
  const tagNames = new Set<string>([...llm.tags.filter((t) => ctx.tags.some((k) => k.name === t)), temperatureTag(llm.temperature)]);
  if (ctx.transcript.segmentCount <= 1 && !llm.tags.includes('Sin respuesta / buzón')) tagNames.add('Sin respuesta / buzón');

  const raw: AnalysisRawResponse = {
    llm,
    provider_chain: out.chain,
    temperature: llm.temperature,
    objection_ids: objectionIds,
    suggested_tags: Array.from(tagNames),
    applied_actions: [],
    policy: policy.apply,
    prompt_version: CALL_ANALYSIS_PROMPT_VERSION,
    cost_usd: realUsd,
    estimated_cost_usd: estUsd,
    credits: settled.credits,
    credits_charged: charge.credits,
    credits_adjustment: settled.delta,
    // Ronda 4 (tester r3 N1): un ajuste a la baja rechazado por la RPC ya no se
    // publica como consumado; queda dicho en la propia fila para conciliar.
    // Ronda 5 (tester r4 P6): la clave de deuda sólo se publica si `unrefunded > 0`
    // (un ajuste AL ALZA rechazado es un INFRAcobro: no se debe nada).
    ...(settled.ok ? {} : { credit_settlement_error: settled.error, ...(settled.unrefunded > 0 ? { pending_refund_credits: settled.unrefunded } : {}) }),
    unit_sku_in: realSkuIn,
    unit_sku_out: realSkuOut,
    rejected_stage_id: stage.rejectedStageId,
    stage_confidence_threshold: policy.stageConfidenceThreshold,
    usage: out.usage,
    job_id: jobId,
    transcript_id: ctx.transcript.id,
    ...(reconciled === null ? {} : { usage_log_reconciled: reconciled }),
  };

  const { data: analysis, error } = await sb
    .from('call_analyses')
    .insert({
      organization_id: orgId,
      call_id: callId,
      transcript_id: ctx.transcript.id,
      provider: out.provider,
      model: out.model,
      summary: llm.summary,
      sentiment: llm.sentiment,
      sentiment_score: llm.sentiment_score,
      quality_score: Math.round(llm.quality_score),
      quality_breakdown: llm.quality_breakdown,
      talk_ratio_agent: llm.talk_ratio_agent,
      talk_ratio_customer: llm.talk_ratio_customer,
      longest_monologue_seconds: Math.round(llm.longest_monologue_seconds),
      questions_asked: Math.round(llm.questions_asked),
      next_steps: llm.next_steps,
      detected_objections: objections,
      detected_competitors: llm.competitors,
      budget_mentioned: llm.budget_mentioned,
      decision_maker_identified: llm.decision_maker_identified,
      discovery_fields: llm.discovery,
      suggested_stage_id: stage.stageId,
      suggested_stage_confidence: stage.confidence,
      suggested_tasks: llm.suggested_tasks,
      applied: false,
      raw_response: raw,
    })
    .select()
    .single();
  if (error || !analysis) throw new Error(`call_analyses insert falló: ${error?.message ?? 'sin datos'}`);
  const saved = analysis as CallAnalysis;

  /**
   * El etiquetado NO puede tumbar un análisis ya guardado (el gasto está hecho),
   * pero tampoco puede desaparecer en un `.catch()` vacío: un CHECK violado aquí
   * se perdía en silencio (tester r2 nº 5). Se registra como ERROR y queda en la
   * propia fila (`raw_response.tagging_error`) para poder verlo desde la UI/SQL.
   */
  try {
    await applyAutoTags(orgId, callId, saved, sb);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[callAnalysis] applyAutoTags falló para call=${callId} analysis=${saved.id}: ${message}`);
    const rawWithError: AnalysisRawResponse = { ...raw, tagging_error: message.slice(0, 500), tagging_failed_at: new Date().toISOString() };
    const { error: tagErr } = await sb.from('call_analyses').update({ raw_response: rawWithError, updated_at: new Date().toISOString() }).eq('id', saved.id).eq('organization_id', orgId);
    if (tagErr) console.error('[callAnalysis] no se pudo registrar tagging_error:', tagErr.message);
    saved.raw_response = rawWithError;
  }
  return saved;
}

/** Etiquetas automáticas: sugeridas por el LLM (existentes en la org) + temperatura + calidad baja. Idempotente. */
export async function applyAutoTags(orgId: number, callId: string, analysis: CallAnalysis, supabase: SupabaseClient): Promise<string[]> {
  const names = new Set<string>(analysis.raw_response?.suggested_tags ?? []);
  if (analysis.quality_score !== null && analysis.quality_score < 50) names.add('Calidad baja');
  const applied: string[] = [];
  for (const name of names) {
    const { data: found } = await supabase.from('call_tags').select('id').eq('organization_id', orgId).eq('name', name).maybeSingle();
    let tagId = (found as { id: string } | null)?.id;
    if (!tagId) {
      const color = name === 'Caliente' ? '#f97316' : name === 'Frío' ? '#60a5fa' : name === 'Calidad baja' ? '#f59e0b' : '#8b5cf6';
      const category = ['Caliente', 'Frío', 'Tibio'].includes(name) ? 'temperature' : name === 'Calidad baja' ? 'quality' : 'ia';
      const { data: created } = await supabase.from('call_tags').insert({ organization_id: orgId, name, color, category, is_auto: true }).select('id').single();
      tagId = (created as { id: string } | null)?.id;
    }
    if (tagId) {
      const source = assertDbEnum(AI_AUTHOR_VALUE, CALL_TAG_SOURCE_VALUES, 'call_tag_relations.source');
      const rel = await tagCall(orgId, callId, tagId, source, supabase, analysis.quality_score !== null ? analysis.quality_score / 100 : 0.5);
      if (rel) applied.push(name);
    }
  }
  return applied;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function getAnalysis(callId: string, orgId: number, supabase: SupabaseClient): Promise<CallAnalysis | null> {
  const { data, error } = await supabase.from('call_analyses').select('*').eq('call_id', callId).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as CallAnalysis;
}

export async function getAnalyses(orgId: number, supabase: SupabaseClient, filters?: AnalysisFilters): Promise<CallAnalysis[]> {
  let query = supabase.from('call_analyses').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  if (filters?.callId) query = query.eq('call_id', filters.callId);
  if (filters?.sentiment) query = query.eq('sentiment', filters.sentiment);
  if (filters?.minQualityScore !== undefined) query = query.gte('quality_score', filters.minQualityScore);
  if (filters?.applied !== undefined) query = query.eq('applied', filters.applied);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
  else if (!filters?.limit) query = query.limit(50);
  const { data, error } = await query;
  if (error) {
    console.warn('[callAnalysisService] getAnalyses error:', error.message);
    return [];
  }
  return (data as CallAnalysis[]) || [];
}

// ─── applyAnalysis ───────────────────────────────────────────────────────────

interface OppApplyRow {
  id: string;
  stage_id: string;
  pipeline_id: string;
  salesperson_id: string | null;
  discovery_data: Record<string, unknown> | null;
}

/**
 * Aplica selectivamente las acciones del análisis. Idempotente: cada acción
 * queda en `raw_response.applied_actions` (`stage`, `task:i`, `discovery`,
 * `objections`, `tags`) y no se repite. La etapa pasa por `evaluateStageGate`
 * salvo `ignoreGate`.
 */
export async function applyAnalysis(
  analysisId: string,
  orgId: number,
  userId: string | null,
  supabase: SupabaseClient,
  actions: ApplyActions,
  opts: { ignoreGate?: boolean; source?: 'user' | 'policy' } = {},
): Promise<ApplyResult | null> {
  const { data: row } = await supabase.from('call_analyses').select('*').eq('id', analysisId).eq('organization_id', orgId).maybeSingle();
  if (!row) return null;
  const analysis = row as CallAnalysis;
  const appliedSet = new Set<string>(analysis.raw_response?.applied_actions ?? []);
  const applied: string[] = [];
  const skipped: ApplyResult['skipped'] = [];
  let gate: GateResult | undefined;

  const { data: callRow } = await supabase.from('calls').select('opportunity_id, customer_id, user_id').eq('id', analysis.call_id).eq('organization_id', orgId).maybeSingle();
  const call = (callRow ?? {}) as { opportunity_id?: string | null; customer_id?: string | null; user_id?: string | null };
  let opp: OppApplyRow | null = null;
  if (call.opportunity_id) {
    const { data } = await supabase.from('opportunities').select('id, stage_id, pipeline_id, salesperson_id, discovery_data').eq('id', call.opportunity_id).eq('organization_id', orgId).maybeSingle();
    opp = (data as OppApplyRow | null) ?? null;
  }

  // Etapa
  if (actions.stage) {
    if (appliedSet.has('stage')) skipped.push({ action: 'stage', reason: 'already_applied' });
    else if (!analysis.suggested_stage_id || !opp) skipped.push({ action: 'stage', reason: 'no_suggestion_or_opportunity' });
    else {
      const { data: stages } = await supabase.from('stages').select('id, name').eq('pipeline_id', opp.pipeline_id);
      const valid = validateSuggestedStage(analysis.suggested_stage_id, analysis.suggested_stage_confidence, (stages ?? []) as StageRef[], opp.stage_id);
      if (!valid.stageId) skipped.push({ action: 'stage', reason: 'stage_not_in_pipeline' });
      else {
        gate = await evaluateStageGate(supabase, orgId, { opportunityId: opp.id, targetStageId: valid.stageId });
        if (!gate.ok && !opts.ignoreGate) skipped.push({ action: 'stage', reason: 'gate_not_met' });
        else {
          const { error } = await supabase.from('opportunities').update({ stage_id: valid.stageId, updated_at: new Date().toISOString() }).eq('id', opp.id).eq('organization_id', orgId);
          if (error) skipped.push({ action: 'stage', reason: error.message });
          else { applied.push('stage'); appliedSet.add('stage'); }
        }
      }
    }
  }

  // Tareas
  if (actions.tasks) {
    const tasks = analysis.suggested_tasks ?? [];
    const idx = actions.tasks === 'all' ? tasks.map((_, i) => i) : actions.tasks.filter((i) => Number.isInteger(i) && i >= 0 && i < tasks.length);
    const rows = idx
      .filter((i) => !appliedSet.has(`task:${i}`))
      .map((i) => buildTaskRow(tasks[i], i, {
        orgId,
        callId: analysis.call_id,
        opportunityId: opp?.id ?? null,
        customerId: call.customer_id ?? null,
        assignedTo: opp?.salesperson_id ?? call.user_id ?? userId ?? null,
        createdBy: userId ?? call.user_id ?? null,
        analysisId,
      }));
    if (rows.length) {
      const { error } = await supabase.from('tasks').insert(rows);
      if (error) skipped.push({ action: 'tasks', reason: error.message });
      else idx.filter((i) => !appliedSet.has(`task:${i}`)).forEach((i) => { applied.push(`task:${i}`); appliedSet.add(`task:${i}`); });
    } else skipped.push({ action: 'tasks', reason: idx.length ? 'already_applied' : 'no_tasks' });
  }

  // Discovery
  if (actions.discovery) {
    if (appliedSet.has('discovery')) skipped.push({ action: 'discovery', reason: 'already_applied' });
    else if (!opp || !analysis.discovery_fields) skipped.push({ action: 'discovery', reason: 'no_opportunity_or_discovery' });
    else {
      const { merged, added } = mergeDiscovery(opp.discovery_data, analysis.discovery_fields);
      if (added.length) {
        const { error } = await supabase.from('opportunities').update({ discovery_data: merged, updated_at: new Date().toISOString() }).eq('id', opp.id).eq('organization_id', orgId);
        if (error) skipped.push({ action: 'discovery', reason: error.message });
        else { applied.push('discovery'); appliedSet.add('discovery'); }
      } else skipped.push({ action: 'discovery', reason: 'nothing_new' });
    }
  }

  // Objeciones → opportunity_objections
  if (actions.objections) {
    const ids = analysis.raw_response?.objection_ids ?? [];
    if (appliedSet.has('objections')) skipped.push({ action: 'objections', reason: 'already_applied' });
    else if (!opp || ids.length === 0) skipped.push({ action: 'objections', reason: 'no_opportunity_or_objections' });
    else {
      const { data: existing } = await supabase.from('opportunity_objections').select('objection_id').eq('organization_id', orgId).eq('opportunity_id', opp.id).in('objection_id', ids);
      const have = new Set(((existing ?? []) as Array<{ objection_id: string }>).map((e) => e.objection_id));
      const rows = ids.filter((id) => !have.has(id)).map((id) => buildObjectionRow({
        orgId,
        opportunityId: opp!.id,
        objectionId: id,
        notes: analysis.detected_objections?.find((o) => o.objection_id === id)?.quote ?? null,
      }));
      // Ronda 3: el SELECT-then-INSERT no es atómico y dos `applyAnalysis`
      // concurrentes duplicaban filas. Con el índice único
      // `opportunity_objections_opp_objection_uidx` (DB r3) el UPSERT con
      // `ignoreDuplicates` deja el resultado en una sola fila por objeción.
      const { error } = rows.length
        ? await supabase.from('opportunity_objections').upsert(rows, { onConflict: 'opportunity_id,objection_id', ignoreDuplicates: true })
        : { error: null };
      if (error) skipped.push({ action: 'objections', reason: error.message });
      else { applied.push('objections'); appliedSet.add('objections'); }
    }
  }

  // Etiquetas
  if (actions.tags) {
    try {
      const names = await applyAutoTags(orgId, analysis.call_id, analysis, supabase);
      if (names.length && !appliedSet.has('tags')) { applied.push('tags'); appliedSet.add('tags'); }
      else skipped.push({ action: 'tags', reason: appliedSet.has('tags') ? 'already_applied' : 'no_tags' });
    } catch (e) {
      // No se traga: el motivo real viaja en `skipped` y queda en el log de error.
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[callAnalysisService] applyAutoTags falló en applyAnalysis (analysis=${analysisId}): ${message}`);
      skipped.push({ action: 'tags', reason: message });
    }
  }

  const now = new Date().toISOString();
  const raw: AnalysisRawResponse = { ...(analysis.raw_response ?? {}), applied_actions: Array.from(appliedSet), last_apply_source: opts.source ?? 'user', last_apply_at: now };
  const { data: updated, error: updErr } = await supabase
    .from('call_analyses')
    .update({
      raw_response: raw,
      applied: appliedSet.size > 0,
      applied_by: applied.length ? (userId ?? analysis.applied_by) : analysis.applied_by,
      applied_at: applied.length ? now : analysis.applied_at,
      updated_at: now,
    })
    .eq('id', analysisId)
    .eq('organization_id', orgId)
    .select()
    .single();
  if (updErr) console.error('[callAnalysisService] Error marcando applied:', updErr.message);
  return { analysis: (updated as CallAnalysis) ?? analysis, applied, skipped, gate };
}

/**
 * Acciones posteriores al análisis según política (`auto` | `suggest`).
 *  - auto: etapa (si confianza ≥ umbral y gate OK) + tareas + discovery + objeciones + etiquetas.
 *  - suggest: discovery + objeciones + etiquetas (nunca mueve etapa ni crea tareas).
 */
export async function runPostAnalysisActions(orgId: number, analysis: CallAnalysis, policy: CallAiPolicy, supabase: SupabaseClient): Promise<ApplyResult | null> {
  const conf = analysis.suggested_stage_confidence ?? 0;
  const actions: ApplyActions = policy.apply === 'auto'
    ? { stage: !!analysis.suggested_stage_id && conf >= policy.stageConfidenceThreshold, tasks: 'all', discovery: true, objections: true, tags: true }
    : { discovery: true, objections: true, tags: true };
  return applyAnalysis(analysis.id, orgId, null, supabase, actions, { source: 'policy' });
}

/** Ejecuta la función RPC fn_call_quality para obtener métricas de calidad. */
export async function getCallQualityMetrics(orgId: number, startDate: string, endDate: string, supabase: SupabaseClient, userId?: string): Promise<CallQualityMetric[]> {
  const { data, error } = await supabase.rpc('fn_call_quality', { p_org_id: orgId, p_start: startDate, p_end: endDate, p_user_id: userId ?? null });
  if (error) {
    console.warn('[callAnalysisService] fn_call_quality error:', error.message);
    return [];
  }
  return (data as CallQualityMetric[]) || [];
}
