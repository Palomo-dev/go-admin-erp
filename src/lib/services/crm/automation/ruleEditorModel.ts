/**
 * Modelo puro del editor de reglas (brief UX 6.2): estado del formulario,
 * transformaciones inmutables (fichas de condiciones y acciones), validación
 * local con el campo al que pertenece cada error, y filtros de la lista.
 *
 * Los componentes de `src/components/crm/automatizaciones/` solo pintan y
 * llaman a estas funciones. La validación definitiva sigue en el servidor
 * (`validateRuleInput`); la de aquí evita un viaje para lo evidente y permite
 * llevar el foco al primer error.
 */

import {
  isGroup,
  normalizeConditions,
  validateConditions,
  type ConditionGroup,
  type ConditionNode,
  type ConditionOperator,
  type ConditionRule,
} from './conditionsDsl';
import { actionEntry, defaultEventFor, isEngineRoutedEvent, triggerOption, type TriggerScope } from './ruleCatalog';

export interface RuleAction {
  type: string;
  [key: string]: unknown;
}

export interface RuleFormState {
  name: string;
  description: string;
  trigger_type: string;
  event: string;
  pipeline_id: string;
  stage_id: string;
  priority: number;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  is_active: boolean;
  actions: RuleAction[];
  conditions: ConditionGroup;
}

/** Lo mínimo que el modelo necesita de una regla guardada. */
export interface RuleSource {
  id?: string;
  name: string;
  description?: string | null;
  trigger_type: string;
  event?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  priority?: number | null;
  run_once_per_opportunity?: boolean | null;
  cooldown_hours?: number | null;
  is_active: boolean;
  actions?: RuleAction[] | null;
  conditions?: unknown;
}

export interface RulePayload {
  id?: string;
  name: string;
  description: string | null;
  trigger_type: string;
  /** Siempre presente: el motor no lo recalcula en PATCH (R2). */
  event: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  priority: number;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  is_active: boolean;
  actions: RuleAction[];
  conditions: ConditionGroup;
}

export interface FormError {
  field: string;
  message: string;
}

export const EMPTY_FORM: RuleFormState = Object.freeze({
  name: '',
  description: '',
  trigger_type: 'stage_change',
  event: '',
  pipeline_id: '',
  stage_id: '',
  priority: 100,
  run_once_per_opportunity: true,
  cooldown_hours: 0,
  is_active: false,
  actions: [],
  conditions: { op: 'and', rules: [] },
}) as RuleFormState;

/** Ejemplo real con el que arranca el estado vacío de la lista. */
export const EXAMPLE_FORM: RuleFormState = {
  ...EMPTY_FORM,
  name: 'Seguimiento de propuesta',
  description: 'Al enviar la propuesta, escribe al cliente y recuerda llamarlo a los 3 días.',
  actions: [
    { type: 'send_email', subject: 'Sobre la propuesta de {{opportunity_name}}' },
    { type: 'create_task', title: 'Llamar a {{customer_name}} por la propuesta', due_in_days: 3 },
  ],
  conditions: { op: 'and', rules: [{ field: 'customer.has_email', operator: 'eq', value: true }] },
};

// ─── Regla ⇄ formulario ─────────────────────────────────────────────────────

export function ruleToForm(rule: RuleSource | null): RuleFormState {
  if (!rule) return { ...EMPTY_FORM, actions: [], conditions: { op: 'and', rules: [] } };
  return {
    name: rule.name,
    description: rule.description ?? '',
    trigger_type: rule.trigger_type,
    event: rule.event ?? '',
    pipeline_id: rule.pipeline_id ?? '',
    stage_id: rule.stage_id ?? '',
    priority: rule.priority ?? 100,
    run_once_per_opportunity: rule.run_once_per_opportunity ?? true,
    cooldown_hours: rule.cooldown_hours ?? 0,
    is_active: rule.is_active,
    actions: (rule.actions ?? []).map((a) => ({ ...a })),
    conditions: normalizeConditions(rule.conditions),
  };
}

export function formToPayload(form: RuleFormState, ruleId?: string): RulePayload {
  const payload: RulePayload = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    trigger_type: form.trigger_type,
    // Con el disparador «event» manda el usuario; en los demás, el evento del
    // motor. Va SIEMPRE: `updateAutomationRule` no lo recalcula y un `event`
    // desfasado deja la regla muda (R2).
    event: form.trigger_type === 'event' ? form.event.trim() || null : defaultEventFor(form.trigger_type),
    pipeline_id: form.pipeline_id.trim() || null,
    stage_id: form.stage_id.trim() || null,
    priority: Number.isFinite(form.priority) ? Math.trunc(form.priority) : 100,
    run_once_per_opportunity: form.run_once_per_opportunity,
    cooldown_hours: Number.isFinite(form.cooldown_hours) ? Math.trunc(form.cooldown_hours) : 0,
    is_active: form.is_active,
    actions: form.actions,
    conditions: form.conditions,
  };
  if (ruleId) payload.id = ruleId;
  return payload;
}

// ─── Validación local ───────────────────────────────────────────────────────

export function validateForm(form: RuleFormState): FormError[] {
  const errors: FormError[] = [];
  if (form.name.trim().length < 2) errors.push({ field: 'name', message: 'Ponle un nombre de al menos 2 caracteres.' });
  if (!Number.isInteger(form.priority) || form.priority < 0 || form.priority > 10_000) {
    errors.push({ field: 'priority', message: 'La prioridad va de 0 a 10000.' });
  }
  if (!Number.isInteger(form.cooldown_hours) || form.cooldown_hours < 0 || form.cooldown_hours > 8760) {
    errors.push({ field: 'cooldown_hours', message: 'El enfriamiento va de 0 a 8760 horas.' });
  }
  form.actions.forEach((a, i) => {
    if ((a.type === 'enroll_sequence' || a.type === 'unenroll_sequence') && !a.sequence_id) {
      errors.push({ field: `actions.${i}.sequence_id`, message: 'Elige la secuencia.' });
    }
    if (a.type === 'update_field' && !String(a.field_name ?? '').trim()) {
      errors.push({ field: `actions.${i}.field_name`, message: 'Elige el campo que cambia.' });
    }
    if (a.type === 'move_stage' && !a.stage_id) {
      errors.push({ field: `actions.${i}.stage_id`, message: 'Elige la etapa destino.' });
    }
  });
  return errors;
}

// ─── Acciones (fichas) ──────────────────────────────────────────────────────

function withActions(form: RuleFormState, actions: RuleAction[]): RuleFormState {
  return { ...form, actions };
}

export function addAction(form: RuleFormState, type: string): RuleFormState {
  const entry = actionEntry(type);
  return withActions(form, [...form.actions, { type, ...(entry?.defaults ?? {}) }]);
}

export function removeAction(form: RuleFormState, index: number): RuleFormState {
  return withActions(form, form.actions.filter((_, i) => i !== index));
}

export function updateAction(form: RuleFormState, index: number, patch: Record<string, unknown>): RuleFormState {
  return withActions(form, form.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
}

export function changeActionType(form: RuleFormState, index: number, type: string): RuleFormState {
  return withActions(form, form.actions.map((a, i) => (i === index ? { type } : a)));
}

export function moveAction(form: RuleFormState, index: number, dir: 'up' | 'down'): RuleFormState {
  const target = dir === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= form.actions.length) return form;
  const next = [...form.actions];
  [next[index], next[target]] = [next[target], next[index]];
  return withActions(form, next);
}

// ─── Condiciones (fichas) ───────────────────────────────────────────────────

const NO_VALUE_OPERATORS: ReadonlySet<string> = new Set(['is_null', 'is_not_null']);
const LIST_OPERATORS: ReadonlySet<string> = new Set(['in', 'not_in']);

/** Lo que el usuario escribe → el valor que evalúa el motor. */
export function textToConditionValue(text: string, operator: string): unknown {
  const trimmed = text.trim();
  if (NO_VALUE_OPERATORS.has(operator)) return undefined;
  if (LIST_OPERATORS.has(operator)) {
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (Number.isFinite(Number(part)) ? Number(part) : part));
  }
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export function conditionValueToText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

function withConditions(form: RuleFormState, patch: Partial<ConditionGroup>): RuleFormState {
  return { ...form, conditions: { ...form.conditions, ...patch } };
}

export const DEFAULT_CONDITION: ConditionRule = { field: 'opportunity.amount', operator: 'gte', value: 0 };

export function addCondition(form: RuleFormState): RuleFormState {
  return withConditions(form, { rules: [...form.conditions.rules, { ...DEFAULT_CONDITION }] });
}

export function removeCondition(form: RuleFormState, index: number): RuleFormState {
  return withConditions(form, { rules: form.conditions.rules.filter((_, i) => i !== index) });
}

export interface ConditionPatch {
  field?: string;
  operator?: ConditionOperator;
  /** Texto tal cual lo escribe el usuario; se convierte según el operador. */
  value?: string;
}

export function updateCondition(form: RuleFormState, index: number, patch: ConditionPatch): RuleFormState {
  const rules = form.conditions.rules.map((node, i): ConditionNode => {
    if (i !== index || isGroup(node)) return node;
    const operator = patch.operator ?? node.operator;
    const text = patch.value !== undefined ? patch.value : conditionValueToText(node.value);
    const value = textToConditionValue(text, operator);
    const next: ConditionRule = { field: patch.field ?? node.field, operator };
    if (value !== undefined) next.value = value;
    return next;
  });
  return withConditions(form, { rules });
}

export function setConditionsOp(form: RuleFormState, op: 'and' | 'or'): RuleFormState {
  return withConditions(form, { op: op === 'or' ? 'or' : 'and' });
}

/** Pestaña «JSON avanzado»: aplica solo si es JSON válido y pasa la DSL. */
export function setConditionsFromJson(form: RuleFormState, text: string): { form: RuleFormState; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { form: { ...form, conditions: { op: 'and', rules: [] } }, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { form, error: 'No es JSON válido.' };
  }
  const issues = validateConditions(parsed);
  if (issues.length) return { form, error: issues.join('; ') };
  return { form: { ...form, conditions: normalizeConditions(parsed) }, error: null };
}

// ─── Disparador ─────────────────────────────────────────────────────────────

/**
 * Cambia el disparador o su ámbito. Nunca vacía `pipeline_id`/`stage_id` por
 * cambiar de disparador (R1): el dato se conserva aunque el motor no lo lea
 * con ese disparador (`TRIGGER_OPTIONS[].scope`), y el editor lo dice en
 * pantalla. Lo único que se limpia es la etapa al cambiar de pipeline, porque
 * pertenece al pipeline anterior y el selector lo muestra vacío al instante.
 * Al pasar a `event`, un `event` que puso el motor (`opportunity.stage_changed`,
 * `opportunity.updated`) no es dato del usuario y dejaría la regla muda: se
 * vacía («cualquier evento»). Uno escrito por el usuario se conserva.
 */
export function setTrigger(
  form: RuleFormState,
  triggerType: string,
  scope: { pipeline_id?: string; stage_id?: string } = {},
): RuleFormState {
  const pipeline = scope.pipeline_id ?? form.pipeline_id;
  const pipelineChanged = pipeline !== form.pipeline_id;
  const stage = scope.stage_id ?? (pipelineChanged ? '' : form.stage_id);
  const event = triggerType === 'event' && isEngineRoutedEvent(form.event.trim()) ? '' : form.event;
  return { ...form, trigger_type: triggerType, event, pipeline_id: pipeline, stage_id: stage };
}

/**
 * R-5: con disparador `event`, un `event` que el motor desvía a otro
 * disparador (`ENGINE_ROUTED_EVENTS`) deja la regla muda. Se evalúa sobre el
 * formulario entero —también el valor CARGADO de una regla heredada, no solo
 * el que se escribe en el selector— y el editor lo dice en pantalla.
 */
export function mutedEvent(form: Pick<RuleFormState, 'trigger_type' | 'event'>): string | null {
  const event = form.event.trim();
  return form.trigger_type === 'event' && isEngineRoutedEvent(event) ? event : null;
}

/** Ámbito que el motor lee con el disparador actual (espejo de `matchesTriggerConfig`). */
export function triggerScope(triggerType: string): TriggerScope {
  return triggerOption(triggerType)?.scope ?? 'none';
}

/**
 * Ámbito guardado en la regla que el motor IGNORA con este disparador. Sirve
 * para decirlo en pantalla en vez de borrarlo (R1).
 */
export function ignoredScope(form: RuleFormState): { pipeline: boolean; stage: boolean } {
  const scope = triggerScope(form.trigger_type);
  return {
    pipeline: scope === 'none' && form.pipeline_id.trim() !== '',
    stage: scope !== 'pipeline_stage' && form.stage_id.trim() !== '',
  };
}

// ─── Lista: búsqueda y filtros ──────────────────────────────────────────────

export interface RuleFilters {
  query: string;
  status: 'all' | 'active' | 'inactive';
  triggers: string[];
}

export const EMPTY_FILTERS: RuleFilters = { query: '', status: 'all', triggers: [] };

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filterRules<T extends { name: string; is_active: boolean; trigger_type: string; description?: string | null }>(
  rules: T[],
  filters: RuleFilters,
): T[] {
  const query = fold(filters.query.trim());
  return rules.filter((r) => {
    if (filters.status === 'active' && !r.is_active) return false;
    if (filters.status === 'inactive' && r.is_active) return false;
    if (filters.triggers.length > 0 && !filters.triggers.includes(r.trigger_type)) return false;
    if (query && !fold(`${r.name} ${r.description ?? ''}`).includes(query)) return false;
    return true;
  });
}

export function countActiveFilters(filters: RuleFilters): number {
  return (filters.query.trim() ? 1 : 0) + (filters.status !== 'all' ? 1 : 0) + filters.triggers.length;
}

// ─── Lista: estado tras una mutación (R-2, ronda 3) ─────────────────────────
//
// El PATCH/POST devuelve la fila tal y como quedó en el servidor y el DELETE
// confirma el borrado. Si la recarga posterior falla, la lista NO puede seguir
// enseñando el estado anterior (interruptor en ON con el servidor en OFF, o la
// tarjeta borrada aún en pantalla): se aplica la respuesta de la mutación y la
// recarga solo afina. Mismo orden que el GET: prioridad ascendente.

export function upsertRule<T extends { id: string; priority: number }>(list: T[], row: T): T[] {
  const next = list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [...list, row];
  return next.sort((a, b) => a.priority - b.priority);
}

export function withoutRule<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((r) => r.id !== id);
}

// ─── Textos de la hoja del editor (ronda 4: fuera del .tsx para probarse) ───

/** El botón principal dice lo que hace: crear/guardar y en qué estado queda. */
export function primaryLabel(editing: boolean, active: boolean): string {
  if (editing) return active ? 'Guardar y activar' : 'Guardar desactivada';
  return active ? 'Crear y activar' : 'Crear desactivada';
}

/**
 * Notas bajo la frase de la vista previa. No repite el estado activo/inactivo
 * (ya lo dicen el interruptor y el botón); con evento mudo (R-5) lo primero
 * que dice es que la regla no se disparará.
 */
export function previewNotes(form: RuleFormState): string[] {
  const notes: string[] = [];
  const muted = mutedEvent(form);
  if (muted) notes.push(`no se disparará nunca: «${muted}» va por otro disparador`);
  if (form.run_once_per_opportunity) notes.push('una sola vez por oportunidad');
  if (form.cooldown_hours > 0) notes.push(`con al menos ${form.cooldown_hours} h entre ejecuciones`);
  return notes;
}
