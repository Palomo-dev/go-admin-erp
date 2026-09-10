/**
 * Prompt v1 de análisis de llamada (FASE-04 §4.5) + schema JSON exacto + zod.
 *
 * - `CALL_ANALYSIS_JSON_SCHEMA`: JSON Schema estricto (todas las claves
 *   required, `additionalProperties:false`) para OpenAI `zodTextFormat` y
 *   como referencia; Gemini usa `toGeminiSchema()` (nullable en vez de
 *   `type:[x,'null']`, que su subset no acepta de forma fiable).
 * - `analysisZod`: validación de la salida (acepta `mixed`, enums de tareas
 *   con `med|critical`, etc.). Todas las claves requeridas y `nullable`
 *   (OpenAI strict no admite `optional`).
 * - Módulo puro: sin SDKs ni Supabase (testeable). El schema para Gemini
 *   (`Type`/`nullable`) se construye en callAnalysisService.ts.
 */

import { z } from 'zod';

export const CALL_ANALYSIS_PROMPT_VERSION = 'v1';

export const SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'] as const;
export const TEMPERATURES = ['cold', 'warm', 'hot'] as const;
export const TASK_TYPES = ['call', 'email', 'whatsapp', 'meeting', 'task'] as const;
export const TASK_PRIORITIES = ['low', 'med', 'high', 'critical'] as const;
export const STEP_OWNERS = ['agent', 'customer'] as const;

export const analysisZod = z.object({
  summary: z.string().min(1).max(4000),
  sentiment: z.enum(SENTIMENTS),
  sentiment_score: z.number().min(-1).max(1),
  quality_score: z.number().min(0).max(100),
  quality_breakdown: z.object({
    greeting: z.number().min(0).max(100),
    discovery: z.number().min(0).max(100),
    pitch: z.number().min(0).max(100),
    objection_handling: z.number().min(0).max(100),
    closing: z.number().min(0).max(100),
    professionalism: z.number().min(0).max(100),
  }),
  talk_ratio_agent: z.number().min(0).max(1),
  talk_ratio_customer: z.number().min(0).max(1),
  longest_monologue_seconds: z.number().min(0),
  questions_asked: z.number().min(0),
  next_steps: z.array(
    z.object({
      action: z.string(),
      owner: z.enum(STEP_OWNERS),
      due_date: z.string().nullable(),
    }),
  ),
  objections: z.array(
    z.object({
      objection_id: z.string().nullable(),
      label: z.string(),
      quote: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  competitors: z.array(z.string()),
  budget_mentioned: z.number().nullable(),
  decision_maker_identified: z.boolean(),
  discovery: z.object({
    budget: z.string().nullable(),
    authority: z.string().nullable(),
    need: z.string().nullable(),
    timeline: z.string().nullable(),
    goals: z.string().nullable(),
    obstacles: z.string().nullable(),
    consequences: z.string().nullable(),
  }),
  suggested_stage_id: z.string().nullable(),
  suggested_stage_confidence: z.number().min(0).max(1),
  suggested_tasks: z.array(
    z.object({
      title: z.string(),
      type: z.enum(TASK_TYPES),
      priority: z.enum(TASK_PRIORITIES),
      due_date: z.string().nullable(),
    }),
  ),
  tags: z.array(z.string()),
  temperature: z.enum(TEMPERATURES),
});

export type CallAnalysisLlm = z.infer<typeof analysisZod>;

const nullable = (t: 'string' | 'number') => ({ type: [t, 'null'] });

/** JSON Schema exacto (FASE-04 §4.5). */
export const CALL_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary', 'sentiment', 'sentiment_score', 'quality_score', 'quality_breakdown', 'talk_ratio_agent', 'talk_ratio_customer',
    'longest_monologue_seconds', 'questions_asked', 'next_steps', 'objections', 'competitors', 'budget_mentioned',
    'decision_maker_identified', 'discovery', 'suggested_stage_id', 'suggested_stage_confidence', 'suggested_tasks', 'tags', 'temperature',
  ],
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string', enum: [...SENTIMENTS] },
    sentiment_score: { type: 'number' },
    quality_score: { type: 'integer' },
    quality_breakdown: {
      type: 'object',
      additionalProperties: false,
      required: ['greeting', 'discovery', 'pitch', 'objection_handling', 'closing', 'professionalism'],
      properties: {
        greeting: { type: 'integer' }, discovery: { type: 'integer' }, pitch: { type: 'integer' },
        objection_handling: { type: 'integer' }, closing: { type: 'integer' }, professionalism: { type: 'integer' },
      },
    },
    talk_ratio_agent: { type: 'number' },
    talk_ratio_customer: { type: 'number' },
    longest_monologue_seconds: { type: 'integer' },
    questions_asked: { type: 'integer' },
    next_steps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['action', 'owner', 'due_date'],
        properties: { action: { type: 'string' }, owner: { type: 'string', enum: [...STEP_OWNERS] }, due_date: nullable('string') },
      },
    },
    objections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['objection_id', 'label', 'quote', 'confidence'],
        properties: { objection_id: nullable('string'), label: { type: 'string' }, quote: { type: 'string' }, confidence: { type: 'number' } },
      },
    },
    competitors: { type: 'array', items: { type: 'string' } },
    budget_mentioned: nullable('number'),
    decision_maker_identified: { type: 'boolean' },
    discovery: {
      type: 'object', additionalProperties: false,
      required: ['budget', 'authority', 'need', 'timeline', 'goals', 'obstacles', 'consequences'],
      properties: {
        budget: nullable('string'), authority: nullable('string'), need: nullable('string'), timeline: nullable('string'),
        goals: nullable('string'), obstacles: nullable('string'), consequences: nullable('string'),
      },
    },
    suggested_stage_id: nullable('string'),
    suggested_stage_confidence: { type: 'number' },
    suggested_tasks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'type', 'priority', 'due_date'],
        properties: {
          title: { type: 'string' }, type: { type: 'string', enum: [...TASK_TYPES] },
          priority: { type: 'string', enum: [...TASK_PRIORITIES] }, due_date: nullable('string'),
        },
      },
    },
    tags: { type: 'array', items: { type: 'string' } },
    temperature: { type: 'string', enum: [...TEMPERATURES] },
  },
} as const;

// ─── Contexto y render del prompt ────────────────────────────────────────────

export interface AnalysisPromptContext {
  call: { direction: string; durationSeconds: number | null; startedAt: string | null };
  customer: { fullName: string | null; companyName: string | null } | null;
  opportunity: {
    name: string;
    amount: number | null;
    currency: string | null;
    stageId: string;
    stageName: string;
    stages: Array<{ id: string; name: string; exitCriteriaText: string }>;
    discoveryData: Record<string, unknown>;
  } | null;
  objections: Array<{ id: string; title: string; category: string; signalsText: string }>;
  tags: string[];
  recentActivities: Array<{ type: string; outcome: string | null; occurredAt: string }>;
  transcript: { text: string; segmentCount: number };
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'desconocida';
  return iso.slice(0, 10);
}

export function renderCallAnalysisPrompt(ctx: AnalysisPromptContext): string {
  const opp = ctx.opportunity;
  const stagesText = opp?.stages.length
    ? opp.stages.map((s) => `  - ${s.id} | ${s.name} | criterios de salida: ${s.exitCriteriaText || 'no definidos'}`).join('\n')
    : '  (sin oportunidad asociada: suggested_stage_id debe ser null)';
  const objText = ctx.objections.length
    ? ctx.objections.map((o) => `  - ${o.id} | ${o.title} | ${o.category} | señales: ${o.signalsText || '-'}`).join('\n')
    : '  (catálogo vacío: usa objection_id null y describe la objeción en label)';
  const actText = ctx.recentActivities.length
    ? ctx.recentActivities.map((a) => `${fmtDate(a.occurredAt)} ${a.type}${a.outcome ? ` (${a.outcome})` : ''}`).join('; ')
    : 'ninguna';

  return `Eres analista senior de ventas B2B en Colombia. Analiza la transcripción de una llamada comercial y devuelve
EXCLUSIVAMENTE un JSON válido conforme al esquema. No inventes datos: si algo no se dice en la llamada, usa null o [].

CONTEXTO
- Dirección: ${ctx.call.direction} · Duración: ${ctx.call.durationSeconds ?? 'desconocida'} s · Fecha: ${fmtDate(ctx.call.startedAt)}
- Cliente: ${ctx.customer?.fullName ?? 'desconocido'} (${ctx.customer?.companyName ?? 'sin empresa'})
- Oportunidad: ${opp?.name ?? 'sin oportunidad'} · Monto: ${opp?.amount ?? 'n/d'} ${opp?.currency ?? ''}
- Etapa actual: ${opp?.stageName ?? 'n/d'} (id ${opp?.stageId ?? 'n/d'})
- Etapas del pipeline, en orden (usa SOLO estos ids en suggested_stage_id; null si no hay evidencia clara):
${stagesText}
- Catálogo de objeciones de la organización (usa el id en objections[].objection_id; null si no encaja):
${objText}
- Etiquetas disponibles: ${ctx.tags.length ? ctx.tags.join(', ') : 'ninguna'}
- Discovery ya conocido: ${JSON.stringify(opp?.discoveryData ?? {})}
- Actividades recientes: ${actText}

REGLAS
1. summary: 3-5 frases, en español neutro, hechos y acuerdos, sin adjetivos vacíos.
2. sentiment: positive | neutral | negative | mixed (mixed = cambia de tono o hay señales opuestas). sentiment_score entre -1 y 1.
3. quality_score 0-100 = promedio ponderado de quality_breakdown (greeting 10 %, discovery 25 %, pitch 20 %,
   objection_handling 20 %, closing 15 %, professionalism 10 %). Sé exigente: 80+ solo con próximo paso fechado.
4. talk_ratio_agent + talk_ratio_customer = 1, calculados con los turnos marcados [AGENTE]/[CLIENTE].
5. objections: cada objeción con objection_id del catálogo o null, quote textual corto y confidence.
6. next_steps: compromisos explícitos; due_date ISO (YYYY-MM-DD) relativa a la fecha de la llamada; owner agent|customer.
7. suggested_stage_id: solo si los criterios de salida de la etapa actual se cumplen en la llamada; confidence 0-1.
8. suggested_tasks: máximo 3, accionables, con due_date; type call|email|whatsapp|meeting|task; priority low|med|high|critical.
9. temperature: hot (decisor + presupuesto + fecha), warm (interés y próximo paso), cold (evasivas, sin próximo paso).
10. discovery: budget, authority, need, timeline (BANT) y goals, obstacles, consequences (GOC); string corto o null.
11. tags: subconjunto de las etiquetas disponibles; añade "Sin respuesta / buzón" si no hubo conversación real.
12. Idioma de salida: español. No incluyas texto fuera del JSON.

TRANSCRIPCIÓN (${ctx.transcript.segmentCount} turnos; formato por línea: [mm:ss] [AGENTE|CLIENTE]: texto)
${ctx.transcript.text}`;
}
