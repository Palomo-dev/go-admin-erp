import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase/config';

/**
 * API Route - Resume discovery/llamadas de una oportunidad del CRM.
 *
 * POST /api/crm/ia/discovery-summary
 * Body: { opportunityId: string }
 *
 * Analiza actividades y notas de la oportunidad,
 * y retorna un resumen estructurado.
 *
 * Usa OpenAI API (OPENAI_API_KEY) si está disponible.
 * Si no hay API key, usa resumen heurístico.
 */

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

interface DiscoverySummaryResponse {
  summary: string;
  key_points: string[];
  next_steps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
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

    // 1. Recopilar actividades y notas
    const context = await gatherDiscoveryContext(opportunityId);
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
        const result = await summarizeWithLLM(client, context);
        return NextResponse.json(result);
      } catch (llmError) {
        console.warn('LLM falló, usando heurísticas:', llmError);
      }
    }

    // 3. Fallback: resumen heurístico
    const result = summarizeWithRules(context);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en /api/crm/ia/discovery-summary:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============== Helpers ==============

interface DiscoveryContext {
  opportunity_name: string;
  customer_name: string;
  stage_name: string;
  amount: number;
  currency: string;
  activities: Array<{
    type: string;
    title: string;
    description: string;
    occurred_at: string;
  }>;
  notes: string[];
  activity_count: number;
}

async function gatherDiscoveryContext(
  opportunityId: string
): Promise<DiscoveryContext | null> {
  try {
    // Obtener la oportunidad
    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        id,
        name,
        amount,
        currency,
        customer:customers(id, full_name),
        stage:stages(id, name)
      `)
      .eq('id', opportunityId)
      .maybeSingle();

    if (oppError || !opp) return null;

    const oppData = opp as Record<string, unknown>;
    const customer = oppData.customer as { id: string; full_name: string } | null;
    const stage = oppData.stage as { id: string; name: string } | null;

    // Obtener todas las actividades
    const { data: activities } = await supabase
      .from('activities')
      .select('activity_type, title, description, occurred_at')
      .eq('related_id', opportunityId)
      .eq('related_type', 'opportunity')
      .order('occurred_at', { ascending: false })
      .limit(20);

    const activityList = (activities || []) as Array<Record<string, unknown>>;

    // Extraer notas (descripciones de actividades tipo note/call/meeting)
    const notes = activityList
      .filter(
        (a) =>
          a.activity_type === 'note' ||
          a.activity_type === 'call' ||
          a.activity_type === 'meeting'
      )
      .map((a) => (a.description as string) || (a.title as string))
      .filter(Boolean);

    return {
      opportunity_name: oppData.name as string,
      customer_name: customer?.full_name || 'N/A',
      stage_name: stage?.name || 'Sin etapa',
      amount: (oppData.amount as number) || 0,
      currency: (oppData.currency as string) || 'COP',
      activities: activityList.map((a) => ({
        type: (a.activity_type as string) || 'unknown',
        title: (a.title as string) || '',
        description: (a.description as string) || '',
        occurred_at: (a.occurred_at as string) || '',
      })),
      notes,
      activity_count: activityList.length,
    };
  } catch (err) {
    console.error('Error recopilando contexto discovery:', err);
    return null;
  }
}

async function summarizeWithLLM(
  client: OpenAI,
  context: DiscoveryContext
): Promise<DiscoverySummaryResponse> {
  const activitiesText = context.activities
    .map(
      (a) =>
        `[${a.occurred_at?.split('T')[0] || 'N/A'}] ${a.type}: ${a.title}${a.description ? ` — ${a.description}` : ''}`
    )
    .join('\n');

  const prompt = `Eres un asistente comercial experto. Resume el proceso de discovery y llamadas de la siguiente oportunidad.

## Oportunidad
- Nombre: ${context.opportunity_name}
- Cliente: ${context.customer_name}
- Etapa: ${context.stage_name}
- Monto: ${context.amount} ${context.currency}

## Actividades registradas (${context.activity_count} total)
${activitiesText}

## Notas
${context.notes.join('\n')}

Genera un resumen estructurado en JSON con este formato:
{
  "summary": "Resumen ejecutivo de 2-3 frases del estado del discovery",
  "key_points": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
  "next_steps": ["Próximo paso 1", "Próximo paso 2"],
  "sentiment": "positive" | "neutral" | "negative"
}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Eres un asistente comercial experto que resume discovery calls. Respondes SIEMPRE en JSON válido y en español.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });

  const content = completion.choices[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content) as DiscoverySummaryResponse;
    return {
      summary: parsed.summary || 'Resumen no disponible',
      key_points: parsed.key_points || [],
      next_steps: parsed.next_steps || [],
      sentiment: parsed.sentiment || 'neutral',
    };
  } catch {
    return {
      summary: content.substring(0, 300),
      key_points: [],
      next_steps: [],
      sentiment: 'neutral',
    };
  }
}

function summarizeWithRules(context: DiscoveryContext): DiscoverySummaryResponse {
  const calls = context.activities.filter((a) => a.type === 'call').length;
  const meetings = context.activities.filter((a) => a.type === 'meeting').length;
  const emails = context.activities.filter((a) => a.type === 'email').length;
  const notes = context.activities.filter((a) => a.type === 'note').length;

  const keyPoints: string[] = [];
  const nextSteps: string[] = [];

  if (calls > 0) keyPoints.push(`${calls} llamadas realizadas`);
  if (meetings > 0) keyPoints.push(`${meetings} reuniones agendadas`);
  if (emails > 0) keyPoints.push(`${emails} correos enviados`);
  if (notes > 0) keyPoints.push(`${notes} notas registradas`);

  // Extraer puntos de las notas
  if (context.notes.length > 0) {
    const firstNotes = context.notes.slice(0, 3);
    keyPoints.push(...firstNotes.map((n) => n.substring(0, 100)));
  }

  if (context.activity_count === 0) {
    nextSteps.push('Realizar primer contacto con el cliente');
  } else {
    nextSteps.push('Programar próxima actividad de seguimiento');
  }

  if (context.stage_name.toLowerCase().includes('propuesta') || context.stage_name.toLowerCase().includes('negociación')) {
    nextSteps.push('Preparar/enviar propuesta formal');
  }

  const sentiment: DiscoverySummaryResponse['sentiment'] =
    context.activity_count > 5 ? 'positive' : context.activity_count > 0 ? 'neutral' : 'negative';

  return {
    summary: `El cliente ${context.customer_name} tiene ${context.activity_count} actividades registradas en la etapa "${context.stage_name}". ${calls} llamadas, ${meetings} reuniones y ${emails} correos. El proceso de discovery está ${context.activity_count > 5 ? 'avanzado' : 'en etapa inicial'}.`,
    key_points: keyPoints.slice(0, 5),
    next_steps: nextSteps.slice(0, 3),
    sentiment,
  };
}
