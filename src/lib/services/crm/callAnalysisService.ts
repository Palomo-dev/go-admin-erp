import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import { getTranscript } from '@/lib/services/crm/transcriptionService';
import { tagCall } from '@/lib/services/crm/callTagService';

/**
 * Servicio CRM - FASE 4: Análisis IA de llamadas.
 * Tablas: call_analyses, call_transcripts
 *
 * Pipeline:
 *  1. Obtiene la transcripción de la llamada
 *  2. Llama al proveedor de análisis (Gemini 2.5 Flash default)
 *  3. Prompt configurable con contexto del pipeline
 *  4. Valida respuesta con zod
 *  5. Guarda resultado en call_analyses
 *  6. Aplica acciones automáticas (tags, update opportunity, create tasks)
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

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
  next_steps: Array<{ action: string; description?: string; due_date?: string }> | null;
  detected_objections: Array<{ type: string; text: string; confidence?: number }> | null;
  detected_competitors: string[] | null;
  budget_mentioned: number | null;
  decision_maker_identified: boolean | null;
  discovery_fields: Record<string, unknown> | null;
  suggested_stage_id: string | null;
  suggested_stage_confidence: number | null;
  suggested_tasks: Array<{ title: string; description?: string; priority?: string; due_date?: string }> | null;
  applied: boolean;
  applied_by: string | null;
  applied_at: string | null;
  raw_response: Record<string, unknown> | null;
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

// ─── Schema de validación zod para respuesta del LLM ─────────────────────────

const analysisSchema = z.object({
  summary: z.string().min(10).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  sentiment_score: z.number().min(-1).max(1).optional(),
  quality_score: z.number().min(0).max(100),
  quality_breakdown: z.object({
    greeting: z.number().min(0).max(100).optional(),
    discovery: z.number().min(0).max(100).optional(),
    pitch: z.number().min(0).max(100).optional(),
    objection_handling: z.number().min(0).max(100).optional(),
    closing: z.number().min(0).max(100).optional(),
    professionalism: z.number().min(0).max(100).optional(),
  }).passthrough().optional(),
  talk_ratio_agent: z.number().min(0).max(1).optional(),
  talk_ratio_customer: z.number().min(0).max(1).optional(),
  longest_monologue_seconds: z.number().min(0).optional(),
  questions_asked: z.number().min(0).optional(),
  next_steps: z.array(z.object({
    action: z.string(),
    description: z.string().optional(),
    due_date: z.string().optional(),
  })).optional(),
  detected_objections: z.array(z.object({
    type: z.string(),
    text: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })).optional(),
  detected_competitors: z.array(z.string()).optional(),
  budget_mentioned: z.number().min(0).optional(),
  decision_maker_identified: z.boolean().optional(),
  discovery_fields: z.object({
    pain_points: z.array(z.string()).optional(),
    current_solution: z.string().optional(),
    timeline: z.string().optional(),
    authority: z.string().optional(),
    budget: z.string().optional(),
    needs: z.array(z.string()).optional(),
  }).passthrough().optional(),
  suggested_stage_id: z.string().optional(),
  suggested_stage_confidence: z.number().min(0).max(1).optional(),
  suggested_tasks: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    due_date: z.string().optional(),
  })).optional(),
});

type AnalysisLLMResponse = z.infer<typeof analysisSchema>;

// ─── Prompt configurable ─────────────────────────────────────────────────────

/**
 * Construye el prompt para el análisis de la llamada.
 * Incluye contexto del pipeline (transcripción, info de la llamada, oportunidad).
 */
function buildAnalysisPrompt(
  transcriptText: string,
  callContext: {
    direction?: string;
    durationSeconds?: number | null;
    customerName?: string | null;
    opportunityTitle?: string | null;
    opportunityStage?: string | null;
    pipelineStages?: Array<{ id: string; name: string }> | null;
  }
): string {
  const stagesInfo = callContext.pipelineStages && callContext.pipelineStages.length > 0
    ? `\nEtapas del pipeline disponibles (usa el ID en suggested_stage_id):\n${
      callContext.pipelineStages.map((s) => `- ${s.id}: ${s.name}`).join('\n')
    }`
    : '';

  return `Eres un analista experto en ventas B2B. Analiza la siguiente transcripción de una llamada comercial y proporciona un análisis estructurado.

CONTEXTO DE LA LLAMADA:
- Dirección: ${callContext.direction ?? 'N/A'}
- Duración: ${callContext.durationSeconds ?? 'N/A'} segundos
- Cliente: ${callContext.customerName ?? 'N/A'}
- Oportunidad: ${callContext.opportunityTitle ?? 'N/A'}
- Etapa actual: ${callContext.opportunityStage ?? 'N/A'}${stagesInfo}

TRANSCRIPCIÓN:
"""
${transcriptText}
"""

Analiza y responde en formato JSON con:
1. summary: resumen ejecutivo de la llamada (2-4 frases)
2. sentiment: sentimiento general (positive/neutral/negative/mixed)
3. sentiment_score: puntuación de sentimiento (-1 a 1)
4. quality_score: calidad de la llamada (0-100)
5. quality_breakdown: desglose de calidad por dimensión (0-100 cada una)
6. talk_ratio_agent: ratio de habla del agente (0-1)
7. talk_ratio_customer: ratio de habla del cliente (0-1)
8. longest_monologue_seconds: monólogo más largo del agente en segundos
9. questions_asked: número de preguntas hechas por el agente
10. next_steps: próximos pasos sugeridos
11. detected_objections: objeciones detectadas con tipo y texto
12. detected_competitors: competidores mencionados
13. budget_mentioned: presupuesto mencionado (si se detecta, número; si no, omitir)
14. decision_maker_identified: si se identificó al tomador de decisiones
15. discovery_fields: campos de discovery (pain_points, current_solution, timeline, authority, budget, needs)
16. suggested_stage_id: ID de la etapa sugerida del pipeline (si aplica)
17. suggested_stage_confidence: confianza en la etapa sugerida (0-1)
18. suggested_tasks: tareas sugeridas para dar seguimiento

Responde SOLO con el JSON, sin texto adicional.`;
}

// ─── Llamada al proveedor de análisis (Gemini) ───────────────────────────────

/**
 * Llama a Gemini para analizar la transcripción.
 * Usa responseSchema para forzar salida JSON estructurada.
 */
async function analyzeWithGemini(
  transcriptText: string,
  callContext: Parameters<typeof buildAnalysisPrompt>[1],
  apiKey: string,
  model = 'gemini-2.5-flash'
): Promise<AnalysisLLMResponse> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = buildAnalysisPrompt(transcriptText, callContext);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          sentiment: { type: Type.STRING, enum: ['positive', 'neutral', 'negative', 'mixed'] },
          sentiment_score: { type: Type.NUMBER },
          quality_score: { type: Type.NUMBER },
          quality_breakdown: {
            type: Type.OBJECT,
            properties: {
              greeting: { type: Type.NUMBER },
              discovery: { type: Type.NUMBER },
              pitch: { type: Type.NUMBER },
              objection_handling: { type: Type.NUMBER },
              closing: { type: Type.NUMBER },
              professionalism: { type: Type.NUMBER },
            },
          },
          talk_ratio_agent: { type: Type.NUMBER },
          talk_ratio_customer: { type: Type.NUMBER },
          longest_monologue_seconds: { type: Type.NUMBER },
          questions_asked: { type: Type.NUMBER },
          next_steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING },
                description: { type: Type.STRING },
                due_date: { type: Type.STRING },
              },
            },
          },
          detected_objections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                text: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
            },
          },
          detected_competitors: { type: Type.ARRAY, items: { type: Type.STRING } },
          budget_mentioned: { type: Type.NUMBER },
          decision_maker_identified: { type: Type.BOOLEAN },
          discovery_fields: {
            type: Type.OBJECT,
            properties: {
              pain_points: { type: Type.ARRAY, items: { type: Type.STRING } },
              current_solution: { type: Type.STRING },
              timeline: { type: Type.STRING },
              authority: { type: Type.STRING },
              budget: { type: Type.STRING },
              needs: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          suggested_stage_id: { type: Type.STRING },
          suggested_stage_confidence: { type: Type.NUMBER },
          suggested_tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['low', 'medium', 'high', 'urgent'] },
                due_date: { type: Type.STRING },
              },
            },
          },
        },
        required: ['summary', 'sentiment', 'quality_score'],
      },
      temperature: 0.3,
    },
  });

  const textResponse = response.text;
  if (!textResponse) {
    throw new Error('Gemini no devolvió texto en la respuesta');
  }

  const parsed = JSON.parse(textResponse) as unknown;
  return analysisSchema.parse(parsed);
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Analiza una llamada transcrita.
 * 1. Obtiene la transcripción
 * 2. Llama al proveedor de análisis (Gemini 2.5 Flash default)
 * 3. Valida respuesta con zod
 * 4. Guarda resultado en call_analyses
 * 5. Aplica acciones automáticas (tags IA, update opportunity)
 */
export async function analyzeCall(
  callId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CallAnalysis | null> {
  // 1. Obtener transcripción
  const transcript = await getTranscript(callId, orgId, supabase);
  if (!transcript || transcript.status !== 'completed' || !transcript.full_text) {
    return null;
  }

  // 2. Verificar si ya existe un análisis
  const { data: existing } = await supabase
    .from('call_analyses')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as CallAnalysis;
  }

  // 3. Obtener contexto de la llamada
  const { data: call } = await supabase
    .from('calls')
    .select('direction, duration_seconds, customer_id, opportunity_id, user_id')
    .eq('id', callId)
    .eq('organization_id', orgId)
    .maybeSingle();

  const callData = (call ?? {}) as Record<string, unknown>;
  const customerId = callData.customer_id as string | null;
  const opportunityId = callData.opportunity_id as string | null;

  // 4. Obtener info del cliente
  let customerName: string | null = null;
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('name, company_name')
      .eq('id', customerId)
      .eq('organization_id', orgId)
      .maybeSingle();
    const custData = (customer ?? {}) as Record<string, unknown>;
    customerName = (custData.company_name as string) ?? (custData.name as string) ?? null;
  }

  // 5. Obtener info de la oportunidad y etapas del pipeline
  let opportunityTitle: string | null = null;
  let opportunityStage: string | null = null;
  let pipelineStages: Array<{ id: string; name: string }> | null = null;

  if (opportunityId) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('title, stage_id')
      .eq('id', opportunityId)
      .eq('organization_id', orgId)
      .maybeSingle();
    const oppData = (opp ?? {}) as Record<string, unknown>;
    opportunityTitle = (oppData.title as string) ?? null;
    const stageId = oppData.stage_id as string | null;

    if (stageId) {
      const { data: stage } = await supabase
        .from('stages')
        .select('name, pipeline_id')
        .eq('id', stageId)
        .eq('organization_id', orgId)
        .maybeSingle();
      const stageData = (stage ?? {}) as Record<string, unknown>;
      opportunityStage = (stageData.name as string) ?? null;
      const pipelineId = stageData.pipeline_id as string | null;

      if (pipelineId) {
        const { data: stages } = await supabase
          .from('stages')
          .select('id, name')
          .eq('pipeline_id', pipelineId)
          .eq('organization_id', orgId)
          .order('position', { ascending: true });
        pipelineStages = ((stages as Array<{ id: string; name: string }>) ?? []);
      }
    }
  }

  // 6. Obtener proveedor de análisis
  const providerConfig = await getActiveProvider(orgId, 'analysis', supabase);
  const apiKey = providerConfig.credentials.GOOGLE_AI_API_KEY
    || providerConfig.credentials.GEMINI_API_KEY
    || process.env.GOOGLE_AI_API_KEY
    || '';

  if (!apiKey || providerConfig.provider === 'none') {
    // Guardar análisis con error
    const { data: failedAnalysis } = await supabase
      .from('call_analyses')
      .insert({
        organization_id: orgId,
        call_id: callId,
        transcript_id: transcript.id,
        provider: 'none',
        model: null,
        summary: null,
        applied: false,
        raw_response: { error: 'No hay proveedor de análisis configurado' },
      })
      .select()
      .single();
    return failedAnalysis as CallAnalysis | null;
  }

  const model = (providerConfig.settings.model as string) ?? 'gemini-2.5-flash';

  // 7. Llamar a Gemini
  let llmResponse: AnalysisLLMResponse;
  let rawResponse: Record<string, unknown>;
  try {
    llmResponse = await analyzeWithGemini(
      transcript.full_text,
      {
        direction: callData.direction as string,
        durationSeconds: (callData.duration_seconds as number) ?? transcript.duration_seconds,
        customerName,
        opportunityTitle,
        opportunityStage,
        pipelineStages,
      },
      apiKey,
      model
    );
    rawResponse = llmResponse as unknown as Record<string, unknown>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[callAnalysisService] Error en análisis LLM:', errorMessage);
    const { data: failedAnalysis } = await supabase
      .from('call_analyses')
      .insert({
        organization_id: orgId,
        call_id: callId,
        transcript_id: transcript.id,
        provider: providerConfig.provider,
        model,
        summary: null,
        applied: false,
        raw_response: { error: errorMessage },
      })
      .select()
      .single();
    return failedAnalysis as CallAnalysis | null;
  }

  // 8. Guardar análisis en BD
  const { data: analysis, error: analysisError } = await supabase
    .from('call_analyses')
    .insert({
      organization_id: orgId,
      call_id: callId,
      transcript_id: transcript.id,
      provider: providerConfig.provider,
      model,
      summary: llmResponse.summary,
      sentiment: llmResponse.sentiment,
      sentiment_score: llmResponse.sentiment_score ?? null,
      quality_score: llmResponse.quality_score,
      quality_breakdown: llmResponse.quality_breakdown ?? null,
      talk_ratio_agent: llmResponse.talk_ratio_agent ?? null,
      talk_ratio_customer: llmResponse.talk_ratio_customer ?? null,
      longest_monologue_seconds: llmResponse.longest_monologue_seconds ?? null,
      questions_asked: llmResponse.questions_asked ?? null,
      next_steps: llmResponse.next_steps ?? null,
      detected_objections: llmResponse.detected_objections ?? null,
      detected_competitors: llmResponse.detected_competitors ?? null,
      budget_mentioned: llmResponse.budget_mentioned ?? null,
      decision_maker_identified: llmResponse.decision_maker_identified ?? null,
      discovery_fields: llmResponse.discovery_fields ?? null,
      suggested_stage_id: llmResponse.suggested_stage_id ?? null,
      suggested_stage_confidence: llmResponse.suggested_stage_confidence ?? null,
      suggested_tasks: llmResponse.suggested_tasks ?? null,
      applied: false,
      raw_response: rawResponse,
    })
    .select()
    .single();

  if (analysisError || !analysis) {
    console.error('[callAnalysisService] Error guardando análisis:', analysisError?.message);
    return null;
  }

  const analysisData = analysis as CallAnalysis;

  // 9. Aplicar acciones automáticas (tags IA basados en sentimiento y calidad)
  await applyAutoTags(orgId, callId, analysisData, supabase);

  return analysisData;
}

/**
 * Aplica tags automáticos basados en el análisis.
 */
async function applyAutoTags(
  orgId: number,
  callId: string,
  analysis: CallAnalysis,
  supabase: SupabaseClient
): Promise<void> {
  // Buscar o crear tags automáticos basados en sentimiento
  const sentiment = analysis.sentiment;
  if (sentiment) {
    const tagConfigs = [
      { name: `Sentimiento: ${sentiment}`, color: sentiment === 'positive' ? '#22c55e' : sentiment === 'negative' ? '#ef4444' : '#6b7280', category: 'sentiment' },
    ];

    // Si la calidad es baja, agregar tag
    if (analysis.quality_score !== null && analysis.quality_score < 50) {
      tagConfigs.push({ name: 'Calidad baja', color: '#f59e0b', category: 'quality' });
    }

    for (const tagConfig of tagConfigs) {
      // Buscar tag existente
      let { data: tag } = await supabase
        .from('call_tags')
        .select('id')
        .eq('organization_id', orgId)
        .eq('name', tagConfig.name)
        .maybeSingle();

      // Crear si no existe
      if (!tag) {
        const { data: newTag } = await supabase
          .from('call_tags')
          .insert({
            organization_id: orgId,
            name: tagConfig.name,
            color: tagConfig.color,
            category: tagConfig.category,
            is_auto: true,
          })
          .select('id')
          .single();
        tag = newTag;
      }

      if (tag) {
        await tagCall(orgId, callId, tag.id, 'ia', supabase, analysis.quality_score !== null ? analysis.quality_score / 100 : 0.5);
      }
    }
  }
}

/**
 * Obtiene el análisis de una llamada.
 */
export async function getAnalysis(
  callId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CallAnalysis | null> {
  const { data, error } = await supabase
    .from('call_analyses')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data as CallAnalysis;
}

/**
 * Lista análisis de una organización con filtros opcionales.
 */
export async function getAnalyses(
  orgId: number,
  supabase: SupabaseClient,
  filters?: AnalysisFilters
): Promise<CallAnalysis[]> {
  let query = supabase
    .from('call_analyses')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.callId) {
    query = query.eq('call_id', filters.callId);
  }
  if (filters?.sentiment) {
    query = query.eq('sentiment', filters.sentiment);
  }
  if (filters?.minQualityScore !== undefined) {
    query = query.gte('quality_score', filters.minQualityScore);
  }
  if (filters?.applied !== undefined) {
    query = query.eq('applied', filters.applied);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset + (filters.limit ?? 50)) - 1);
  } else if (!filters?.limit) {
    query = query.limit(50);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[callAnalysisService] getAnalyses error:', error.message);
    return [];
  }

  return (data as CallAnalysis[]) || [];
}

/**
 * Aplica las acciones sugeridas por el análisis:
 * - Actualiza la etapa de la oportunidad (suggested_stage_id)
 * - Crea tareas sugeridas (suggested_tasks)
 * - Marca el análisis como applied
 */
export async function applyAnalysis(
  analysisId: string,
  orgId: number,
  userId: string,
  supabase: SupabaseClient
): Promise<CallAnalysis | null> {
  // 1. Obtener el análisis
  const { data: analysis, error } = await supabase
    .from('call_analyses')
    .select('*')
    .eq('id', analysisId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !analysis) return null;

  const analysisData = analysis as CallAnalysis;

  if (analysisData.applied) {
    return analysisData; // Ya aplicado
  }

  // 2. Obtener la llamada para saber la oportunidad
  const { data: call } = await supabase
    .from('calls')
    .select('opportunity_id, customer_id')
    .eq('id', analysisData.call_id)
    .eq('organization_id', orgId)
    .maybeSingle();

  const callData = (call ?? {}) as Record<string, unknown>;
  const opportunityId = callData.opportunity_id as string | null;
  const customerId = callData.customer_id as string | null;

  const appliedActions: string[] = [];

  // 3. Actualizar etapa de la oportunidad
  if (analysisData.suggested_stage_id && opportunityId) {
    const { error: oppError } = await supabase
      .from('opportunities')
      .update({
        stage_id: analysisData.suggested_stage_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('organization_id', orgId);

    if (!oppError) {
      appliedActions.push('stage_updated');
    }
  }

  // 4. Crear tareas sugeridas
  if (analysisData.suggested_tasks && analysisData.suggested_tasks.length > 0) {
    const taskRows = analysisData.suggested_tasks.map((task) => ({
      organization_id: orgId,
      title: task.title,
      description: task.description ?? null,
      priority: task.priority ?? 'medium',
      status: 'pending',
      due_date: task.due_date ?? null,
      assigned_to: userId,
      created_by: userId,
      related_to_id: opportunityId ?? analysisData.call_id,
      related_to_type: opportunityId ? 'opportunity' : 'call',
      customer_id: customerId ?? null,
    }));

    const { error: taskError } = await supabase
      .from('tasks')
      .insert(taskRows);

    if (!taskError) {
      appliedActions.push('tasks_created');
    }
  }

  // 5. Marcar análisis como applied
  const { data: updated, error: updateError } = await supabase
    .from('call_analyses')
    .update({
      applied: true,
      applied_by: userId,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (updateError) {
    console.error('[callAnalysisService] Error marcando applied:', updateError.message);
    return null;
  }

  return updated as CallAnalysis;
}

/**
 * Ejecuta la función RPC fn_call_quality para obtener métricas de calidad.
 */
export async function getCallQualityMetrics(
  orgId: number,
  startDate: string,
  endDate: string,
  supabase: SupabaseClient,
  userId?: string
): Promise<CallQualityMetric[]> {
  const { data, error } = await supabase
    .rpc('fn_call_quality', {
      p_org_id: orgId,
      p_start: startDate,
      p_end: endDate,
      p_user_id: userId ?? null,
    });

  if (error) {
    console.warn('[callAnalysisService] fn_call_quality error:', error.message);
    return [];
  }

  return (data as CallQualityMetric[]) || [];
}
