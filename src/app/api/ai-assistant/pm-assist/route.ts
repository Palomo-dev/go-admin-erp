import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY environment variable');
  return new OpenAI({ apiKey });
}

// Suma días hábiles (lun-vie) a una fecha base
function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  // Al menos 1 día si hay trabajo
  const total = Math.max(days, 0);
  while (added < total) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const TASK_PROMPT = `Eres un experto en planificación de trabajo. Dado el título y descripción de una TAREA, desglósala en subtareas accionables y realistas.
REGLAS:
1. Genera entre 3 y 7 subtareas concretas y ordenadas.
2. Estima horas de trabajo EFECTIVAS por subtarea (sin tiempos de espera), valores entre 0.5 y 8.
3. Asigna una prioridad a cada subtarea: low, med, high o critical (según impacto/urgencia).
4. Sugiere la prioridad global de la tarea padre (low, med, high o critical).
5. No incluyas fechas (se calculan aparte).
Responde SOLO JSON:
{"priority":"med","subtasks":[{"title":"...","estimated_hours":2,"priority":"med"}]}`;

const GOAL_PROMPT = `Eres un experto en OKRs. Dado el título y descripción de una META, propón Resultados Clave (KRs) medibles.
REGLAS:
1. Genera entre 2 y 5 KRs medibles y específicos.
2. Cuando aplique, incluye un valor objetivo numérico y su unidad (ej: %, ventas, clientes). Si no aplica, deja target_value en null.
Responde SOLO JSON:
{"key_results":[{"title":"...","target_value":20,"unit":"%"}]}`;

const DESCRIBE_PROMPT = `Eres un asistente que redacta descripciones claras y accionables para elementos de gestión de proyectos (tareas, metas o proyectos).
REGLAS:
1. Redacta en español, tono profesional, conciso y orientado a la acción.
2. Devuelve HTML simple usando solo <p>, <strong>, <em>, <ul>, <ol> y <li>. No uses encabezados <h*> ni estilos inline ni <script>.
3. Aprovecha el contexto disponible (prioridad, horas estimadas, fecha de entrega, responsable, dependencias, adjuntos, tarea padre).
4. Si es una subtarea (tiene tarea padre), alinea la descripción con el objetivo de la tarea padre.
5. Sé breve: 1 párrafo introductorio y, si aporta valor, una lista corta de pasos o criterios.
Responde SOLO JSON: {"description":"<p>...</p>"}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, title, description, complexity, startDate, hoursPerDay = 8, organizationId } = body;

    if (!mode || !title) {
      return NextResponse.json({ error: 'mode y title son requeridos' }, { status: 400 });
    }

    if (organizationId) {
      const ok = await consumeAICredits(organizationId, 1);
      if (!ok) {
        return NextResponse.json({ error: 'No tienes créditos de IA disponibles' }, { status: 403 });
      }
    }

    const openai = getOpenAIClient();

    // Modo descripción: redacta una descripción HTML a partir del título y el contexto
    if (mode === 'describe') {
      const ctx = body.context || {};
      const lines: string[] = [`Tipo de elemento: ${body.entity || 'tarea'}`, `Título: ${title}`];
      if (ctx.priority) lines.push(`Prioridad: ${ctx.priority}`);
      if (ctx.estimated_hours) lines.push(`Horas estimadas: ${ctx.estimated_hours}`);
      if (ctx.due_date) lines.push(`Fecha de entrega: ${ctx.due_date}`);
      if (ctx.assignee) lines.push(`Responsable: ${ctx.assignee}`);
      if (Array.isArray(ctx.dependencies) && ctx.dependencies.length) lines.push(`Dependencias: ${ctx.dependencies.join(', ')}`);
      if (Array.isArray(ctx.attachments) && ctx.attachments.length) lines.push(`Archivos adjuntos: ${ctx.attachments.join(', ')}`);
      if (ctx.goal) lines.push(`Meta vinculada: ${ctx.goal}`);
      if (ctx.parentTitle) lines.push(`Tarea padre: ${ctx.parentTitle}`);
      if (ctx.parentDescription) lines.push(`Contexto de la tarea padre: ${String(ctx.parentDescription).replace(/<[^>]*>/g, ' ').slice(0, 500)}`);
      if (description) lines.push(`Descripción actual (mejórala): ${String(description).replace(/<[^>]*>/g, ' ').slice(0, 500)}`);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: DESCRIBE_PROMPT },
          { role: 'user', content: lines.join('\n') },
        ],
        temperature: 0.6,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      const parsed = content ? JSON.parse(content) : {};
      return NextResponse.json({ description: String(parsed.description || ''), tokens: completion.usage?.total_tokens || 0 });
    }

    const isTask = mode === 'task';
    const perDay = Math.max(Number(hoursPerDay) || 8, 1);
    const base = startDate ? new Date(startDate) : new Date();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: isTask ? TASK_PROMPT : GOAL_PROMPT },
        { role: 'user', content: `Título: ${title}\nDescripción: ${description || '(sin descripción)'}` },
      ],
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'La IA no generó respuesta' }, { status: 500 });
    const parsed = JSON.parse(content);

    if (isTask) {
      const validPriorities = ['low', 'med', 'high', 'critical'];
      const normPriority = (p: any): string => validPriorities.includes(p) ? p : 'med';
      const subtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];
      // Programación aterrizada: acumular horas y repartir en jornadas hábiles
      let cumulativeHours = 0;
      const scheduled = subtasks.map((st: any) => {
        const hours = Math.max(Number(st.estimated_hours) || 1, 0.5);
        cumulativeHours += hours;
        const daysFromStart = Math.ceil(cumulativeHours / perDay);
        return {
          title: String(st.title || '').trim(),
          estimated_hours: hours,
          due_date: toISODate(addBusinessDays(base, daysFromStart)),
          priority: normPriority(st.priority),
          status: 'open',
        };
      });
      const totalHours = scheduled.reduce((s: number, x: any) => s + x.estimated_hours, 0);
      const totalDays = Math.ceil(totalHours / perDay);
      // Prioridad global: la sugerida por la IA o la más alta entre subtareas
      const rank: Record<string, number> = { low: 0, med: 1, high: 2, critical: 3 };
      const derived = scheduled.reduce((max: string, x: any) => rank[x.priority] > rank[max] ? x.priority : max, 'low');
      const priority = validPriorities.includes(parsed.priority) ? parsed.priority : derived;
      return NextResponse.json({
        subtasks: scheduled,
        estimated_hours: totalHours,
        start_date: toISODate(base),
        due_date: toISODate(addBusinessDays(base, totalDays)),
        priority,
        status: 'open',
        tokens: completion.usage?.total_tokens || 0,
      });
    }

    // Modo meta: KRs + fecha objetivo aterrizada por complejidad
    const key_results = Array.isArray(parsed.key_results) ? parsed.key_results.map((k: any) => ({
      title: String(k.title || '').trim(),
      target_value: k.target_value != null && k.target_value !== '' ? Number(k.target_value) : null,
      unit: k.unit || null,
    })) : [];
    // Complejidad → días hábiles hasta la fecha objetivo
    const complexityDays: Record<string, number> = { low: 20, med: 45, high: 90 };
    const days = complexityDays[complexity as string] ?? 45;
    return NextResponse.json({
      key_results,
      target_date: toISODate(addBusinessDays(base, days)),
      tokens: completion.usage?.total_tokens || 0,
    });
  } catch (error: any) {
    console.error('Error PM Assist:', error);
    return NextResponse.json({ error: error.message || 'Error al generar sugerencias con IA' }, { status: 500 });
  }
}
