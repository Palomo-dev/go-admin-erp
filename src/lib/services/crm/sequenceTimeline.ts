import { interpolateAutomationText, type AutomationText } from '@/lib/services/crm/automation/automationText';
const defaultSequenceText:AutomationText=(source,values)=>interpolateAutomationText(source ?? '',values);
/**
 * Lógica pura de la línea de tiempo de una secuencia (brief UX 6.3).
 *
 * Sin React ni Supabase: se usa desde la lista (mini-línea de tiempo), el
 * editor (línea vertical, reordenación por teclado/arrastre, inserción entre
 * dos pasos) y el diálogo de inscripción (qué se va a enviar y cuándo).
 * La validación de fondo sigue en `validateSequenceSteps` (F8, no se toca).
 */

import { countConditionRules } from './automation/conditionsDsl';

export interface TimelineStepInput {
  step_number: number;
  channel: string;
  delay_days: number;
  delay_hours?: number | null;
  template_id?: string | null;
  action_config?: Record<string, unknown>;
  condition?: unknown;
  name?: string | null;
}

export interface TimelineEntry {
  index: number;
  step_number: number;
  channel: string;
  /** Días desde la inscripción (acumulado; las horas cuentan como fracción). */
  dayOffset: number;
  /** «Día 3» (parte entera del acumulado). */
  dayLabel: string;
  /** «2 días después», «Inmediato»… relativo al paso anterior. */
  delayLabel: string;
  /** Un paso `condition` bifurca: continúa si se cumple, corta si no. */
  isBranch: boolean;
}

/** Etiquetas humanas de los canales (mismo catálogo que el CHECK de BD). */
export const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  call: 'Llamada',
  task: 'Tarea',
  wait: 'Espera',
  condition: 'Condición',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

/** Canales que llegan a una persona real (para la advertencia de inscripción). */
export const CUSTOMER_FACING_CHANNELS: ReadonlySet<string> = new Set(['email', 'whatsapp', 'sms']);

function plural(n: number, one: string, many: string, text: AutomationText = defaultSequenceText): string {
  return text("{p0} {p1}",{p0:n,p1:text(n === 1 ? one : many)});
}

/** Espera relativa al paso anterior, en lenguaje humano. */
export function describeDelay(step: Pick<TimelineStepInput, 'delay_days' | 'delay_hours'>, text: AutomationText = defaultSequenceText): string {
  const days = Math.max(0, Number(step.delay_days) || 0);
  const hours = Math.max(0, Number(step.delay_hours) || 0);
  if (days === 0 && hours === 0) return text('Inmediato');
  if (hours === 0) return text("{p0} después",{p0:plural(days, 'día', 'días', text)});
  if (days === 0) return text("{p0} después",{p0:plural(hours, 'hora', 'horas', text)});
  return text("{p0} y {p1} h después",{p0:plural(days, 'día', 'días', text),p1:hours});
}

function configText(step: TimelineStepInput, key: string): string {
  const value = step.action_config?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Contenido resumido de un paso, para la tarjeta de la línea de tiempo. */
export function summarizeStep(step: TimelineStepInput, templateName?: string | null, text: AutomationText = defaultSequenceText): string {
  switch (step.channel) {
    case 'email': {
      const subject = configText(step, 'subject');
      if (subject) return subject;
      if (step.template_id) return text("Plantilla: {p0}",{p0:templateName ?? text('seleccionada')});
      return text("Sin contenido todavía");
    }
    case 'whatsapp':
    case 'task':
    case 'call': {
      const title = configText(step, 'title') || configText(step, 'subject');
      if (title) return title;
      if (step.template_id) return text("Plantilla: {p0}",{p0:templateName ?? text('seleccionada')});
      return text("Sin contenido todavía");
    }
    case 'wait': {
      const days = Number(step.delay_days) || 0;
      const hours = Number(step.delay_hours) || 0;
      if (days === 0 && hours === 0) return text("Espera sin duración");
      return text("Espera {p0}",{p0:describeDelay(step, text).replace(text('{p0} después',{p0:''}), '')});
    }
    case 'condition': {
      const rules = countConditionRules(step.condition);
      if (rules === 0) return text("Sin reglas: no se puede guardar");
      const op = (step.condition as { op?: string } | null)?.op === 'or' ? text(" (alguna)") : '';
      return `${plural(rules, text("regla"), text("reglas"), text)}${op}`;
    }
    case 'sms':
      return text("Sin proveedor de SMS: fallará");
    default:
      return step.name?.trim() || channelLabel(step.channel);
  }
}

/** Línea de tiempo acumulada desde la inscripción. */
export function buildTimeline(steps: TimelineStepInput[], text: AutomationText = defaultSequenceText): TimelineEntry[] {
  let offset = 0;
  return steps.map((step, index) => {
    const days = Math.max(0, Number(step.delay_days) || 0);
    const hours = Math.max(0, Number(step.delay_hours) || 0);
    offset += days + hours / 24;
    return {
      index,
      step_number: step.step_number,
      channel: step.channel,
      dayOffset: offset,
      dayLabel: text("Día {p0}",{p0:Math.floor(offset)}),
      delayLabel: describeDelay(step, text),
      isBranch: step.channel === 'condition',
    };
  });
}

/** «Dura 5 días» / «Todo el mismo día» / «Sin pasos». */
export function totalDurationLabel(steps: TimelineStepInput[], text: AutomationText = defaultSequenceText): string {
  if (steps.length === 0) return text("Sin pasos");
  const timeline = buildTimeline(steps, text);
  const days = Math.floor(timeline[timeline.length - 1].dayOffset);
  if (days === 0) return text("Todo el mismo día");
  return text("Dura {p0}",{p0:plural(days, 'día', 'días', text)});
}

// ─── Reordenación e inserción (inmutables, renumeran 1..n) ───────────────────

export function renumberSteps<T extends { step_number: number }>(steps: T[]): T[] {
  return steps.map((s, i) => (s.step_number === i + 1 ? s : { ...s, step_number: i + 1 }));
}

/**
 * Mueve el paso `from` a la posición `to`. Alternativa de teclado al arrastre:
 * «mover arriba» es `moveStep(steps, i, i - 1)` y «mover abajo» `i + 1`.
 * Fuera de rango o sin cambio devuelve la MISMA referencia (no re-renderiza).
 */
export function moveStep<T extends { step_number: number }>(steps: T[], from: number, to: number): T[] {
  if (from === to) return steps;
  if (from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const next = steps.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumberSteps(next);
}

/** Inserta `step` en `index` (0 = al principio, `length` = al final). */
export function insertStepAt<T extends { step_number: number }>(steps: T[], index: number, step: T): T[] {
  const at = Math.min(Math.max(0, index), steps.length);
  return renumberSteps([...steps.slice(0, at), step, ...steps.slice(at)]);
}

export function removeStepAt<T extends { step_number: number }>(steps: T[], index: number): T[] {
  if (index < 0 || index >= steps.length) return steps;
  return renumberSteps(steps.filter((_, i) => i !== index));
}
