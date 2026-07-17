import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY environment variable');
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `Eres un experto en gestión de proyectos y planificación. Tu trabajo es crear un plan de tareas detallado basado en la descripción del usuario.

REGLAS:
1. Genera entre 3 y 8 tareas principales según la complejidad.
2. Cada tarea principal debe tener entre 2 y 5 subtareas.
3. Las fechas deben ser realistas a partir de hoy.
4. Estima horas de trabajo reales (no incluyas tiempos de espera).
5. Asigna prioridades según impacto y urgencia.
6. Los tipos de tarea son: tarea, seguimiento, revision, entrega, investigacion, documento.

FORMATO JSON OBLIGATORIO (responde SOLO con JSON, sin texto adicional):
{
  "tasks": [
    {
      "title": "Título de la tarea",
      "description": "Descripción detallada",
      "priority": "low|med|high|critical",
      "type": "tarea",
      "estimated_hours": 8,
      "due_date": "YYYY-MM-DD",
      "subtasks": [
        {
          "title": "Subtarea 1",
          "description": "Detalle",
          "estimated_hours": 2,
          "due_date": "YYYY-MM-DD",
          "priority": "med"
        }
      ]
    }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, projectId, organizationId } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'El prompt es requerido' }, { status: 400 });
    }

    // Consumir créditos de IA
    if (organizationId) {
      const creditResult = await consumeAICredits(organizationId, 1);
      if (!creditResult.success) {
        return NextResponse.json({ error: 'No tienes créditos de IA disponibles' }, { status: 403 });
      }
    }

    const openai = getOpenAIClient();
    const today = new Date().toISOString().split('T')[0];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Fecha de hoy: ${today}\n\nDescripción del proyecto/objetivo:\n${prompt}` },
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'La IA no generó respuesta' }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      tasks: parsed.tasks || [],
      model: 'gpt-4o-mini',
      tokens: completion.usage?.total_tokens || 0,
    });
  } catch (error: any) {
    console.error('Error PM Planner:', error);

    if (error?.status === 429 || error?.code === 'insufficient_quota') {
      return NextResponse.json(
        { error: 'Cuota de OpenAI agotada. Revisa el plan y facturación en platform.openai.com.' },
        { status: 429 }
      );
    }

    if (error?.status === 401 || error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { error: 'Clave de API de OpenAI inválida o no configurada.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Error al generar plan con IA' },
      { status: 500 }
    );
  }
}
