import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase/config';

/**
 * API Route - Recomienda la próxima acción para una oportunidad del CRM.
 *
 * POST /api/crm/ia/next-action
 * Body: { opportunityId: string }
 *
 * Analiza actividades, notas, etapa y score de la oportunidad,
 * y retorna { action, reasoning, priority }.
 *
 * Usa OpenAI API (OPENAI_API_KEY) si está disponible.
 * Si no hay API key, usa reglas heurísticas.
 */

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

interface NextActionResponse {
  action: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { opportunityId } = body as { opportunityId?: string };

    if (!opportunityId) {
      return NextResponse.json(
        { error: 'opportunityId es requerido' },
        { status: 400 }
      );
    }

    // 1. Recopilar contexto de la oportunidad
    const context = await gatherOpportunityContext(opportunityId);
    if (!context) {
      return NextResponse.json(
        { error: 'No se pudo obtener información de la oportunidad' },
        { status: 404 }
      );
    }

    // 2. Intentar usar LLM
    const client = getOpenAIClient();
    if (client) {
      try {
        const result = await recommendWithLLM(client, context);
        return NextResponse.json(result);
      } catch (llmError) {
        console.warn('LLM falló, usando heurísticas:', llmError);
      }
    }

    // 3. Fallback: reglas heurísticas
    const result = recommendWithRules(context);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en /api/crm/ia/next-action:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============== Helpers ==============

interface OpportunityContext {
  opportunity_name: string;
  stage_name: string;
  stage_probability: number;
  amount: number;
  currency: string;
  days_in_stage: number;
  days_since_last_activity: number;
  last_activity_type: string | null;
  score_total: number | null;
  temperature: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  activity_count: number;
  recent_activities: Array<{ type: string; title: string; date: string }>;
  notes: string[];
}

async function gatherOpportunityContext(
  opportunityId: string
): Promise<OpportunityContext | null> {
  try {
    // Obtener la oportunidad
    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        id,
        name,
        amount,
        currency,
        stage_id,
        updated_at,
        score_total,
        temperature,
        customer:customers(id, full_name, email, phone),
        stage:stages(id, name, probability)
      `)
      .eq('id', opportunityId)
      .maybeSingle();

    if (oppError || !opp) return null;

    const oppData = opp as Record<string, unknown>;
    const customer = oppData.customer as {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
    } | null;
    const stage = oppData.stage as {
      id: string;
      name: string;
      probability: number;
    } | null;

    const updatedAt = oppData.updated_at as string;
    const daysInStage = Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Obtener actividades recientes
    const { data: activities } = await supabase
      .from('activities')
      .select('activity_type, title, occurred_at, description')
      .eq('related_id', opportunityId)
      .eq('related_type', 'opportunity')
      .order('occurred_at', { ascending: false })
      .limit(10);

    const activityList = (activities || []) as Array<Record<string, unknown>>;
    const lastActivity = activityList[0];
    const lastActivityAt = lastActivity
      ? (lastActivity.occurred_at as string)
      : null;
    const daysSinceLastActivity = lastActivityAt
      ? Math.floor(
          (Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 999;

    // Obtener notas (actividades de tipo note)
    const notes = activityList
      .filter((a) => a.activity_type === 'note' || a.activity_type === 'call')
      .map((a) => (a.description as string) || (a.title as string))
      .filter(Boolean)
      .slice(0, 5);

    return {
      opportunity_name: oppData.name as string,
      stage_name: stage?.name || 'Sin etapa',
      stage_probability: stage?.probability || 0,
      amount: (oppData.amount as number) || 0,
      currency: (oppData.currency as string) || 'COP',
      days_in_stage: daysInStage,
      days_since_last_activity: daysSinceLastActivity,
      last_activity_type: (lastActivity?.activity_type as string) || null,
      score_total: (oppData.score_total as number) || null,
      temperature: (oppData.temperature as string) || null,
      customer_name: customer?.full_name || 'N/A',
      customer_email: customer?.email || null,
      customer_phone: customer?.phone || null,
      activity_count: activityList.length,
      recent_activities: activityList.slice(0, 5).map((a) => ({
        type: (a.activity_type as string) || 'unknown',
        title: (a.title as string) || '',
        date: (a.occurred_at as string) || '',
      })),
      notes,
    };
  } catch (err) {
    console.error('Error recopilando contexto:', err);
    return null;
  }
}

async function recommendWithLLM(
  client: OpenAI,
  context: OpportunityContext
): Promise<NextActionResponse> {
  const prompt = `Eres un asistente comercial experto. Analiza la siguiente oportunidad de venta y recomienda la PRÓXIMA ACCIÓN específica que el vendedor debería tomar.

## Oportunidad
- Nombre: ${context.opportunity_name}
- Cliente: ${context.customer_name}
- Etapa: ${context.stage_name} (${context.stage_probability}% probabilidad)
- Monto: ${context.amount} ${context.currency}
- Días en etapa: ${context.days_in_stage}
- Días sin actividad: ${context.days_since_last_activity}
- Score: ${context.score_total ?? 'N/A'} (${context.temperature ?? 'N/A'})
- Total actividades: ${context.activity_count}
- Última actividad: ${context.last_activity_type || 'Ninguna'}

## Actividades recientes
${context.recent_activities.map((a) => `- [${a.type}] ${a.title} (${a.date})`).join('\n')}

## Notas
${context.notes.join('\n')}

## Contacto
- Email: ${context.customer_email || 'N/A'}
- Teléfono: ${context.customer_phone || 'N/A'}

Responde en JSON con este formato exacto:
{
  "action": "Acción específica y concreta a tomar",
  "reasoning": "Por qué esta acción es la mejor en este momento",
  "priority": "high" | "medium" | "low"
}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un asistente comercial experto que recomienda acciones específicas. Respondes SIEMPRE en JSON válido.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const content = completion.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content) as NextActionResponse;
    return {
      action: parsed.action || 'Contactar al cliente',
      reasoning: parsed.reasoning || 'Análisis no disponible',
      priority: parsed.priority || 'medium',
    };
  } catch {
    // Si el JSON no parsea, extraer texto plano
    return {
      action: content.substring(0, 200),
      reasoning: 'Recomendación generada por IA',
      priority: 'medium',
    };
  }
}

function recommendWithRules(context: OpportunityContext): NextActionResponse {
  // Sin actividades → primer contacto urgente
  if (context.activity_count === 0) {
    return {
      action: `Realizar primer contacto con ${context.customer_name} (${context.customer_phone || context.customer_email || 'sin contacto'})`,
      reasoning: 'La oportunidad no tiene ninguna actividad registrada. El primer contacto es urgente.',
      priority: 'high',
    };
  }

  // Sin actividad por >7 días → recontactar
  if (context.days_since_last_activity > 7) {
    return {
      action: `Recontactar a ${context.customer_name}. Última actividad hace ${context.days_since_last_activity} días.`,
      reasoning: `La oportunidad está estancada hace ${context.days_since_last_activity} días sin actividad. Es necesario retomar el contacto.`,
      priority: 'high',
    };
  }

  // En etapa avanzada con alta probabilidad → cerrar
  if (context.stage_probability >= 75) {
    return {
      action: `Preparar propuesta final y agendar reunión de cierre con ${context.customer_name}`,
      reasoning: `La oportunidad está en etapa "${context.stage_name}" con ${context.stage_probability}% de probabilidad. Es momento de impulsar el cierre.`,
      priority: 'high',
    };
  }

  // Score alto → priorizar
  if (context.score_total && context.score_total >= 67) {
    return {
      action: `Agendar llamada de discovery profunda con ${context.customer_name} para validar necesidades`,
      reasoning: `El score es alto (${context.score_total}, temperatura ${context.temperature}). Hay alta intención comercial y conviene profundizar.`,
      priority: 'medium',
    };
  }

  // Etapa temprana → discovery
  if (context.stage_probability < 30) {
    return {
      action: `Enviar información inicial y agendar llamada de presentación con ${context.customer_name}`,
      reasoning: `La oportunidad está en etapa temprana ("${context.stage_name}"). Es necesario cualificar y presentar valor.`,
      priority: 'medium',
    };
  }

  // Default
  return {
    action: `Dar seguimiento a ${context.customer_name} con próxima actividad programada`,
    reasoning: 'La oportunidad requiere seguimiento continuo para mantener momentum.',
    priority: 'low',
  };
}
