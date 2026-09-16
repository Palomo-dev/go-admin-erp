/**
 * Traduce una regla de automatización a lenguaje humano (brief UX 6.2).
 *
 * «Cuando una oportunidad entra en «Propuesta enviada», si el monto es al
 * menos 5.000.000, entonces enviar un email y crear la tarea «Llamar».»
 *
 * Es puro y sin dependencias de React ni de Supabase: lo usan la lista, el
 * editor (vista previa) y el diálogo de prueba en seco. Los nombres de
 * etapas, pipelines, secuencias y plantillas llegan por `HumanizerLookups`
 * porque aquí solo hay IDs.
 */

import { isGroup, type ConditionGroup, type ConditionNode, type ConditionRule } from './conditionsDsl';
import { actionEntry, knownEvent, UPDATE_FIELD_ENTITY_LABELS } from './ruleCatalog';

export interface HumanizerLookups {
  stageName?: (id: string) => string | null;
  pipelineName?: (id: string) => string | null;
  sequenceName?: (id: string) => string | null;
  templateName?: (id: string) => string | null;
}

export interface RuleLike {
  trigger_type: string;
  event?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  conditions?: unknown;
  actions?: { type: string; [key: string]: unknown }[] | null;
}

export const NO_LOOKUPS: HumanizerLookups = {};

const q = (text: unknown): string => `«${String(text)}»`;

function named(lookup: ((id: string) => string | null) | undefined, id: unknown): string | null {
  if (typeof id !== 'string' || !id) return null;
  return lookup?.(id) ?? null;
}

// ─── Disparador ─────────────────────────────────────────────────────────────

export function describeTrigger(rule: RuleLike, lookups: HumanizerLookups = NO_LOOKUPS): string {
  switch (rule.trigger_type) {
    case 'stage_change': {
      if (rule.stage_id) {
        const stage = named(lookups.stageName, rule.stage_id);
        return stage
          ? `Cuando una oportunidad entra en ${q(stage)}`
          : 'Cuando una oportunidad entra en una etapa (sin nombre)';
      }
      if (rule.pipeline_id) {
        const pipeline = named(lookups.pipelineName, rule.pipeline_id);
        return pipeline
          ? `Cuando una oportunidad cambia de etapa en ${q(pipeline)}`
          : 'Cuando una oportunidad cambia de etapa en un pipeline (sin nombre)';
      }
      return 'Cuando una oportunidad cambia de etapa';
    }
    case 'event': {
      // El motor acota `event` solo por pipeline (matchesTriggerConfig); la etapa no se menciona.
      const known = rule.event ? knownEvent(rule.event) : undefined;
      const head = known
        ? `Cuando ${known.label.charAt(0).toLowerCase()}${known.label.slice(1)} (${known.value})`
        : rule.event ? `Cuando ocurre el evento ${q(rule.event)}` : 'Cuando ocurre un evento del CRM';
      const pipeline = rule.pipeline_id ? named(lookups.pipelineName, rule.pipeline_id) : null;
      return pipeline ? `${head} en ${q(pipeline)}` : head;
    }
    case 'field_change':
      return 'Cuando cambia un dato de una oportunidad';
    case 'schedule':
      return 'Según la programación del servidor';
    case 'manual':
      return 'Cuando alguien la ejecuta a mano';
    default:
      return 'Cuando ocurre un disparador desconocido';
  }
}

// ─── Condiciones ────────────────────────────────────────────────────────────

/** Sujeto de cada campo en la frase («el monto de la oportunidad»). */
const CONDITION_SUBJECTS: Record<string, string> = {
  'opportunity.amount': 'el monto de la oportunidad',
  'opportunity.currency': 'la moneda',
  'opportunity.status': 'el estado',
  'opportunity.temperature': 'la temperatura',
  'opportunity.icp_band': 'la banda ICP',
  'opportunity.icp_fit_score': 'el puntaje ICP',
  'opportunity.score_total': 'el puntaje total',
  'opportunity.record_type': 'el tipo de registro',
  'opportunity.source': 'el origen',
  'opportunity.expected_close_date': 'el cierre esperado',
  'opportunity.last_contact_at': 'el último contacto',
  'opportunity.contact_channel': 'el canal de contacto',
  'opportunity.contact_result': 'el resultado de contacto',
  'opportunity.deal_type': 'el tipo de trato',
  'opportunity.name': 'el nombre',
  'opportunity.stage_id': 'la etapa',
  'opportunity.pipeline_id': 'el pipeline',
  'customer.customer_type': 'el tipo de cliente',
  'customer.lifecycle_stage': 'la etapa del ciclo de vida',
  'customer.health_score': 'el puntaje de salud',
  'customer.tags': 'las etiquetas',
  'customer.company_size': 'el tamaño de empresa',
  'customer.has_email': 'tiene email',
  'customer.has_phone': 'tiene teléfono',
  'customer.email': 'el email',
  'customer.phone': 'el teléfono',
  'stage.id': 'la etapa',
  'stage.name': 'el nombre de la etapa',
  'stage.position': 'la posición de la etapa',
  'stage.probability': 'la probabilidad',
  'stage.is_won': 'la etapa es ganada',
  'stage.is_lost': 'la etapa es perdida',
  'stage.sla_days': 'los días de SLA',
  'pipeline.id': 'el pipeline',
  'pipeline.pipeline_type': 'el tipo de pipeline',
  'consent.email': 'el consentimiento de email',
  'consent.whatsapp': 'el consentimiento de WhatsApp',
  'consent.sms': 'el consentimiento de SMS',
  'consent.voice': 'el consentimiento de voz',
  'event.event_type': 'el tipo de evento',
};

const OPERATOR_PHRASES: Record<string, string> = {
  eq: 'es',
  ne: 'no es',
  gt: 'es mayor que',
  gte: 'es al menos',
  lt: 'es menor que',
  lte: 'es como máximo',
  in: 'es uno de',
  not_in: 'no es ninguno de',
  contains: 'contiene',
  not_contains: 'no contiene',
  is_null: 'está vacío',
  is_not_null: 'no está vacío',
  before: 'es antes de',
  after: 'es después de',
  within_days: 'es de los últimos',
};

const STAGE_ID_FIELDS = new Set(['opportunity.stage_id', 'stage.id']);
const PIPELINE_ID_FIELDS = new Set(['opportunity.pipeline_id', 'pipeline.id']);

export function conditionSubject(field: string): string {
  return CONDITION_SUBJECTS[field] ?? field;
}

/** 5000000 → «5.000.000»; 12.5 → «12,5». Determinista, sin depender del ICU. */
export function formatNumberEs(value: number): string {
  const [int, dec] = Math.abs(value).toString().split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

function joinHuman(parts: string[], last: 'y' | 'o'): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${last} ${parts[parts.length - 1]}`;
}

function formatValue(field: string, value: unknown, lookups: HumanizerLookups): string {
  if (Array.isArray(value)) return joinHuman(value.map((v) => formatValue(field, v, lookups)), 'o');
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'number') return formatNumberEs(value);
  if (value === null || value === undefined) return '(vacío)';
  if (STAGE_ID_FIELDS.has(field)) return q(named(lookups.stageName, value) ?? value);
  if (PIPELINE_ID_FIELDS.has(field)) return q(named(lookups.pipelineName, value) ?? value);
  return q(value);
}

export function describeCondition(rule: ConditionRule, lookups: HumanizerLookups = NO_LOOKUPS): string {
  const subject = conditionSubject(rule.field);
  const op = String(rule.operator);
  const phrase = OPERATOR_PHRASES[op] ?? op;
  if (op === 'is_null' || op === 'is_not_null') return `${subject} ${phrase}`;
  if (op === 'within_days') {
    const n = typeof rule.value === 'number' ? rule.value : Number(rule.value);
    const days = Number.isFinite(n) ? n : 0;
    return `${subject} ${phrase} ${formatNumberEs(days)} ${days === 1 ? 'día' : 'días'}`;
  }
  return `${subject} ${phrase} ${formatValue(rule.field, rule.value, lookups)}`;
}

function describeNode(node: ConditionNode, lookups: HumanizerLookups, nested: boolean): string | null {
  if (isGroup(node)) {
    const parts = node.rules
      .map((r) => describeNode(r, lookups, true))
      .filter((p): p is string => !!p);
    if (parts.length === 0) return null;
    const text = joinHuman(parts, node.op === 'or' ? 'o' : 'y');
    return nested && parts.length > 1 ? `(${text})` : text;
  }
  return describeCondition(node, lookups);
}

/** Frase de las condiciones o `null` si la regla no filtra. */
export function describeConditions(conditions: unknown, lookups: HumanizerLookups = NO_LOOKUPS): string | null {
  if (!conditions) return null;
  const group: ConditionGroup = Array.isArray(conditions)
    ? { op: 'and', rules: conditions as ConditionNode[] }
    : isGroup(conditions as ConditionNode)
      ? (conditions as ConditionGroup)
      : { op: 'and', rules: [conditions as ConditionNode] };
  return describeNode(group, lookups, false);
}

// ─── Acciones ───────────────────────────────────────────────────────────────

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Frase de las acciones que existen en el catálogo pero aún no se ejecutan. */
const NOT_IMPLEMENTED_PHRASES: Record<string, string> = {
  send_sms: 'enviar un SMS',
  start_ai_agent: 'lanzar un agente de IA',
  ai_draft_email: 'redactar un email con IA',
  book_meeting_request: 'solicitar una reunión',
  webhook_out: 'llamar a un webhook saliente',
};

export function describeAction(action: { type: string; [key: string]: unknown }, lookups: HumanizerLookups = NO_LOOKUPS): string {
  const entry = actionEntry(action.type);
  if (!entry) return `acción desconocida ${q(action.type)}`;
  if (!entry.implemented) {
    return `${NOT_IMPLEMENTED_PHRASES[entry.type] ?? entry.label.toLowerCase()} (sin implementación todavía)`;
  }

  switch (entry.type) {
    case 'send_email': {
      const subject = str(action.subject);
      const template = named(lookups.templateName, action.template_id);
      if (subject) return `enviar un email con asunto ${q(truncate(subject, 60))}`;
      if (template) return `enviar un email con la plantilla ${q(template)}`;
      return 'enviar un email';
    }
    case 'send_whatsapp': {
      const template = named(lookups.templateName, action.template_id);
      const text = str(action.text);
      if (template) return `enviar un WhatsApp con la plantilla ${q(template)}`;
      if (text) return `enviar un WhatsApp: ${q(truncate(text, 40))}`;
      return 'enviar un WhatsApp';
    }
    case 'create_task': {
      const title = str(action.title);
      const due = typeof action.due_in_days === 'number' ? action.due_in_days : null;
      const base = title ? `crear la tarea ${q(truncate(title, 60))}` : 'crear una tarea';
      return due === null ? base : `${base} que vence en ${formatNumberEs(due)} ${due === 1 ? 'día' : 'días'}`;
    }
    case 'create_activity': {
      const type = str(action.activity_type);
      return type ? `registrar una actividad de tipo ${q(type)}` : 'registrar una actividad';
    }
    case 'update_field': {
      const entity = str(action.entity) || 'opportunities';
      const field = str(action.field_name);
      const where = UPDATE_FIELD_ENTITY_LABELS[entity] ?? entity;
      const value = action.field_value === undefined || action.field_value === null
        ? '(vacío)' : q(String(action.field_value));
      return field ? `cambiar ${q(field)} a ${value} en ${where}` : `cambiar un dato en ${where}`;
    }
    case 'enroll_sequence': {
      const name = named(lookups.sequenceName, action.sequence_id);
      return name ? `inscribir en la secuencia ${q(name)}` : 'inscribir en una secuencia (sin elegir)';
    }
    case 'unenroll_sequence': {
      const name = named(lookups.sequenceName, action.sequence_id);
      return name ? `sacar de la secuencia ${q(name)}` : 'sacar de una secuencia (sin elegir)';
    }
    case 'notify_user': {
      const title = str(action.title);
      return title ? `avisar al responsable: ${q(truncate(title, 60))}` : 'avisar al responsable';
    }
    case 'move_stage': {
      const name = named(lookups.stageName, action.stage_id);
      return name ? `mover la oportunidad a ${q(name)}` : 'mover la oportunidad a otra etapa (sin elegir)';
    }
    default:
      return entry.label.toLowerCase();
  }
}

export function describeActions(
  actions: { type: string; [key: string]: unknown }[] | null | undefined,
  lookups: HumanizerLookups = NO_LOOKUPS,
): string {
  return joinHuman((actions ?? []).map((a) => describeAction(a, lookups)), 'y');
}

/** La frase completa: «Cuando …, si …, entonces ….» */
export function describeRule(rule: RuleLike, lookups: HumanizerLookups = NO_LOOKUPS): string {
  const trigger = describeTrigger(rule, lookups);
  const conditions = describeConditions(rule.conditions, lookups);
  const actions = describeActions(rule.actions, lookups);
  const head = conditions ? `${trigger}, si ${conditions}` : trigger;
  if (!actions) return `${head}, no hará nada: la regla no tiene acciones.`;
  return `${head}, entonces ${actions}.`;
}

// ─── Ejecuciones ────────────────────────────────────────────────────────────

const SKIP_REASONS: Record<string, string> = {
  rule_inactive: 'La regla está desactivada: actívala con el interruptor para que se ejecute.',
  conditions_not_met: 'No se cumplen las condiciones para esta oportunidad.',
};

export function describeSkipReason(reason: string | null | undefined): string {
  if (!reason) return '';
  return SKIP_REASONS[reason] ?? reason;
}

export type RunTone = 'success' | 'danger' | 'neutral' | 'info' | 'warning';

const RUN_STATUS: Record<string, { label: string; tone: RunTone }> = {
  completed: { label: 'Completada', tone: 'success' },
  failed: { label: 'Falló', tone: 'danger' },
  skipped: { label: 'Omitida', tone: 'neutral' },
  running: { label: 'En curso', tone: 'info' },
  pending: { label: 'Pendiente', tone: 'warning' },
};

export function describeRunStatus(status: string): { label: string; tone: RunTone } {
  return RUN_STATUS[status] ?? { label: status, tone: 'neutral' };
}

/** «hace 3 h», «hace 2 días», «nunca». Es un delta: no depende de la zona horaria. */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'nunca';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'nunca';
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return 'hace un momento';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
