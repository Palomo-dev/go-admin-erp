/**
 * DSL de condiciones de FASE-08 §2.4 (evaluada en TS, no en SQL).
 *
 * Se usa en dos sitios:
 *  - `automation_rules.conditions` (regla: se ejecuta o se marca `skipped`).
 *  - `sequence_steps.condition` para el canal `condition` (rama true/false).
 *
 * Reglas del motor:
 *  - Allow-list de campos (`CONDITION_FIELDS`): cualquier `field` fuera de la
 *    lista hace que la condición sea FALSA y deja traza `field_not_allowed`
 *    (nunca lee una propiedad arbitraria del contexto).
 *  - Sin `Number()` forzado: `gt/gte/lt/lte` solo comparan números o fechas.
 *  - Formato legacy (array plano de reglas) se normaliza a `{op:'and', rules}`.
 */

export type ConditionOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'contains' | 'not_contains'
  | 'is_null' | 'is_not_null' | 'before' | 'after' | 'within_days';

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface ConditionGroup {
  op: 'and' | 'or';
  rules: ConditionNode[];
}

export type ConditionNode = ConditionGroup | ConditionRule;

export interface ConditionTrace {
  field: string;
  operator?: string;
  expected?: unknown;
  actual?: unknown;
  ok: boolean;
  reason?: string;
}

/** Contexto contra el que se evalúan las condiciones. */
export interface RuleContext {
  orgId: number;
  now: Date;
  opportunity: Record<string, unknown> | null;
  customer: Record<string, unknown> | null;
  stage: Record<string, unknown> | null;
  pipeline: Record<string, unknown> | null;
  /** Consentimiento por canal (`opted_in|opted_out|unknown`). */
  consent: Record<string, string>;
  event: { event_type: string; payload: Record<string, unknown> } | null;
}

export const OPERATORS: readonly ConditionOperator[] = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'not_contains',
  'is_null', 'is_not_null', 'before', 'after', 'within_days',
] as const;

/** Campos permitidos (§2.4). `event.payload.*` se admite con prefijo. */
export const CONDITION_FIELDS: readonly string[] = [
  'opportunity.amount', 'opportunity.currency', 'opportunity.status', 'opportunity.temperature',
  'opportunity.icp_band', 'opportunity.icp_fit_score', 'opportunity.score_total', 'opportunity.record_type',
  'opportunity.source', 'opportunity.expected_close_date', 'opportunity.last_contact_at',
  'opportunity.contact_channel', 'opportunity.contact_result', 'opportunity.deal_type',
  'opportunity.name', 'opportunity.stage_id', 'opportunity.pipeline_id',
  'customer.customer_type', 'customer.lifecycle_stage', 'customer.health_score', 'customer.tags',
  'customer.company_size', 'customer.has_email', 'customer.has_phone', 'customer.email', 'customer.phone',
  'stage.id', 'stage.name', 'stage.position', 'stage.probability', 'stage.is_won', 'stage.is_lost', 'stage.sla_days',
  'pipeline.id', 'pipeline.pipeline_type',
  'consent.email', 'consent.whatsapp', 'consent.sms', 'consent.voice',
  'event.event_type',
] as const;

const EVENT_PAYLOAD_PREFIX = 'event.payload.';

export function isConditionFieldAllowed(field: string): boolean {
  if (CONDITION_FIELDS.includes(field)) return true;
  return field.startsWith(EVENT_PAYLOAD_PREFIX) && field.length > EVENT_PAYLOAD_PREFIX.length;
}

/** Lee un campo del contexto sin tocar propiedades no declaradas. */
export function getField(ctx: RuleContext, field: string): unknown {
  if (field.startsWith(EVENT_PAYLOAD_PREFIX)) {
    const key = field.slice(EVENT_PAYLOAD_PREFIX.length);
    return ctx.event?.payload?.[key];
  }
  const [root, prop] = field.split('.');
  switch (root) {
    case 'opportunity':
      return ctx.opportunity?.[prop];
    case 'customer': {
      if (prop === 'has_email') return !!ctx.customer?.email;
      if (prop === 'has_phone') return !!ctx.customer?.phone;
      return ctx.customer?.[prop];
    }
    case 'stage':
      return ctx.stage?.[prop];
    case 'pipeline':
      return ctx.pipeline?.[prop];
    case 'consent':
      return ctx.consent?.[prop] ?? 'unknown';
    case 'event':
      return prop === 'event_type' ? ctx.event?.event_type : undefined;
    default:
      return undefined;
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Evalúa un operador. Devuelve false si los tipos no son comparables. */
export function applyOperator(
  operator: ConditionOperator,
  actual: unknown,
  expected: unknown,
  now: Date,
): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a !== null && b !== null) {
        return operator === 'gt' ? a > b : operator === 'gte' ? a >= b : operator === 'lt' ? a < b : a <= b;
      }
      const da = asDate(actual);
      const db = asDate(expected);
      if (da && db) {
        const x = da.getTime();
        const y = db.getTime();
        return operator === 'gt' ? x > y : operator === 'gte' ? x >= y : operator === 'lt' ? x < y : x <= y;
      }
      return false;
    }
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual as never);
    case 'contains': {
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return typeof actual === 'string' && typeof expected === 'string'
        ? actual.toLowerCase().includes(expected.toLowerCase())
        : false;
    }
    case 'not_contains': {
      if (Array.isArray(actual)) return !actual.includes(expected as never);
      return typeof actual === 'string' && typeof expected === 'string'
        ? !actual.toLowerCase().includes(expected.toLowerCase())
        : false;
    }
    case 'is_null':
      return actual === null || actual === undefined || actual === '';
    case 'is_not_null':
      return !(actual === null || actual === undefined || actual === '');
    case 'before': {
      const a = asDate(actual);
      const b = asDate(expected);
      return !!a && !!b && a.getTime() < b.getTime();
    }
    case 'after': {
      const a = asDate(actual);
      const b = asDate(expected);
      return !!a && !!b && a.getTime() > b.getTime();
    }
    case 'within_days': {
      const a = asDate(actual);
      const days = asNumber(expected);
      if (!a || days === null) return false;
      const diff = Math.abs(now.getTime() - a.getTime()) / 86_400_000;
      return diff <= days;
    }
    default:
      return false;
  }
}

export function isGroup(node: ConditionNode): node is ConditionGroup {
  return !!node && typeof node === 'object' && 'op' in node && Array.isArray((node as ConditionGroup).rules);
}

/**
 * Normaliza el formato guardado: array plano (V3) → `{op:'and', rules:[...]}`.
 * `null`/`undefined`/`{}` → grupo AND vacío (siempre verdadero).
 */
export function normalizeConditions(input: unknown): ConditionGroup {
  if (Array.isArray(input)) return { op: 'and', rules: input as ConditionNode[] };
  if (input && typeof input === 'object' && 'op' in (input as Record<string, unknown>)) {
    const g = input as ConditionGroup;
    return { op: g.op === 'or' ? 'or' : 'and', rules: Array.isArray(g.rules) ? g.rules : [] };
  }
  if (input && typeof input === 'object' && 'field' in (input as Record<string, unknown>)) {
    return { op: 'and', rules: [input as ConditionRule] };
  }
  return { op: 'and', rules: [] };
}

/**
 * Cuenta las reglas HOJA del árbol (los grupos no cuentan). Sirve para
 * distinguir «sin condición» de «condición que evalúa a algo».
 *
 * Ojo: `normalizeConditions` convierte `null`, `{}`, `"lo que sea"` y
 * `{op:'and',rules:[]}` en el MISMO grupo vacío, y un grupo `and` vacío evalúa
 * a VERDADERO. Eso es correcto para `automation_rules` (una regla sin
 * condiciones se ejecuta siempre) y es exactamente lo contrario de lo que
 * espera el usuario en un paso `condition` de secuencia, que la interfaz
 * anuncia como «puede cortar la secuencia» (tester r3 N10). Por eso el paso de
 * condición usa este contador para negarse a evaluar, en vez de dejar pasar.
 */
export function countConditionRules(input: unknown): number {
  const walk = (node: unknown, depth: number): number => {
    if (depth > 6 || !node || typeof node !== 'object') return 0;
    if (isGroup(node as ConditionNode)) {
      return (node as ConditionGroup).rules.reduce((acc, child) => acc + walk(child, depth + 1), 0);
    }
    return 'field' in (node as Record<string, unknown>) ? 1 : 0;
  };
  return normalizeConditions(input).rules.reduce((acc, child) => acc + walk(child, 1), 0);
}

/**
 * `true` cuando el árbol no contiene ninguna regla hoja: `null`, `{}`, `[]`,
 * un valor malformado o grupos vacíos anidados. NO se usa en las reglas de
 * automatización (allí «sin condiciones» significa «siempre»).
 */
export function isEmptyConditionTree(input: unknown): boolean {
  return countConditionRules(input) === 0;
}

/** Errores de forma de la DSL (para el editor y la validación de entrada). */
export function validateConditions(input: unknown, path = 'conditions'): string[] {
  const issues: string[] = [];
  const walk = (node: unknown, p: string, depth: number) => {
    if (depth > 6) {
      issues.push(`${p}: anidamiento máximo 6 niveles`);
      return;
    }
    if (!node || typeof node !== 'object') {
      issues.push(`${p}: se esperaba un objeto`);
      return;
    }
    const n = node as Record<string, unknown>;
    if ('op' in n) {
      if (n.op !== 'and' && n.op !== 'or') issues.push(`${p}.op debe ser 'and' u 'or'`);
      if (!Array.isArray(n.rules)) {
        issues.push(`${p}.rules debe ser un arreglo`);
        return;
      }
      (n.rules as unknown[]).forEach((child, i) => walk(child, `${p}.rules[${i}]`, depth + 1));
      return;
    }
    if (typeof n.field !== 'string' || !isConditionFieldAllowed(n.field)) {
      issues.push(`${p}.field no permitido: ${String(n.field)}`);
    }
    if (typeof n.operator !== 'string' || !OPERATORS.includes(n.operator as ConditionOperator)) {
      issues.push(`${p}.operator no permitido: ${String(n.operator)}`);
    }
  };
  const normalized = normalizeConditions(input);
  normalized.rules.forEach((child, i) => walk(child, `${path}.rules[${i}]`, 1));
  return issues;
}

/**
 * Evalúa el árbol de condiciones. Un grupo vacío es verdadero (regla sin
 * condiciones). Devuelve la traza para el dry-run y el historial.
 */
export function evaluateConditionTree(
  input: unknown,
  ctx: RuleContext,
): { result: boolean; trace: ConditionTrace[] } {
  const trace: ConditionTrace[] = [];

  const ev = (node: ConditionNode, depth: number): boolean => {
    if (depth > 6) {
      trace.push({ field: '(profundidad)', ok: false, reason: 'max_depth' });
      return false;
    }
    if (isGroup(node)) {
      if (node.rules.length === 0) return node.op === 'and';
      const results = node.rules.map((child) => ev(child, depth + 1));
      return node.op === 'and' ? results.every(Boolean) : results.some(Boolean);
    }
    const rule = node as ConditionRule;
    if (!rule || typeof rule.field !== 'string' || !isConditionFieldAllowed(rule.field)) {
      trace.push({ field: String(rule?.field), ok: false, reason: 'field_not_allowed' });
      return false;
    }
    if (!OPERATORS.includes(rule.operator)) {
      trace.push({ field: rule.field, operator: String(rule.operator), ok: false, reason: 'operator_not_allowed' });
      return false;
    }
    const actual = getField(ctx, rule.field);
    const ok = applyOperator(rule.operator, actual, rule.value, ctx.now);
    trace.push({ field: rule.field, operator: rule.operator, expected: rule.value, actual, ok });
    return ok;
  };

  const root = normalizeConditions(input);
  return { result: ev(root, 0), trace };
}
