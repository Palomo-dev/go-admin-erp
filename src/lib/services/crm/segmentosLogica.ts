/** Adaptación estricta del formato antiguo; la evaluación pertenece al DSL compartido. */
import {
  CONDITION_FIELDS,
  OPERATORS,
  evaluateConditionTree,
  type ConditionGroup,
  type ConditionNode,
  type ConditionOperator,
} from './automation/conditionsDsl';
import { CrmHttpError } from './crmErrors';

export const CAMPOS_SEGMENTO = CONDITION_FIELDS.filter((f) => f.startsWith('customer.') || f.startsWith('consent.'));
const aliases: Record<string, ConditionOperator> = {
  equals: 'eq',
  not_equals: 'ne',
  greater_than: 'gt',
  less_than: 'lt',
  is_empty: 'is_null',
  is_not_empty: 'is_not_null',
};
const invalid = (): never => {
  throw new CrmHttpError(400, 'filtro_invalido', 'Revisa los campos y operadores del segmento');
};

export function normalizarFiltroSegmento(input: unknown): ConditionGroup {
  let leaves = 0;
  const walk = (value: unknown, depth: number): ConditionNode => {
    if (depth > 6 || !value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const node = value as Record<string, unknown>;
    if ('op' in node) {
      if (
        !['and', 'or'].includes(String(node.op)) ||
        !Array.isArray(node.rules) ||
        node.rules.length > 50 ||
        Object.keys(node).some((k) => !['op', 'rules'].includes(k))
      )
        return invalid();
      return {
        op: node.op as 'and' | 'or',
        rules: node.rules.map((v) => walk(v, depth + 1)),
      };
    }
    if (
      typeof node.field !== 'string' ||
      typeof node.operator !== 'string' ||
      Object.keys(node).some((k) => !['field', 'operator', 'value'].includes(k))
    )
      return invalid();
    let field = node.field.includes('.') ? node.field : `customer.${node.field}`;
    if (!CAMPOS_SEGMENTO.includes(field)) return invalid();
    if (node.operator === 'between') {
      if (!Array.isArray(node.value) || node.value.length !== 2) return invalid();
      return walk(
        {
          op: 'and',
          rules: [
            { field, operator: 'gte', value: node.value[0] },
            { field, operator: 'lte', value: node.value[1] },
          ],
        },
        depth + 1,
      );
    }
    if (++leaves > 50) return invalid();
    let operator = aliases[node.operator] ?? node.operator;
    let expected = node.value;
    if (field === 'customer.tags' && ['is_empty', 'is_not_empty'].includes(node.operator)) {
      field = 'customer.tags_count';
      operator = node.operator === 'is_empty' ? 'eq' : 'gt';
      expected = 0;
    }
    if (!OPERATORS.includes(operator as ConditionOperator)) return invalid();
    if (!['is_null', 'is_not_null'].includes(operator)) {
      const scalar = (v: unknown) =>
        v === null ||
        typeof v === 'boolean' ||
        (typeof v === 'number' && Number.isFinite(v)) ||
        (typeof v === 'string' && v.length <= 500);
      if (Array.isArray(expected)) {
        if (expected.length > 100 || !expected.every(scalar)) return invalid();
      } else if (!scalar(expected)) return invalid();
      if (['in', 'not_in'].includes(operator) && !Array.isArray(expected)) return invalid();
      if (operator === 'within_days' && (typeof expected !== 'number' || expected < 0 || expected > 36500))
        return invalid();
    }
    return { field, operator: operator as ConditionOperator, value: expected };
  };
  const root = Array.isArray(input) ? { op: 'and', rules: input } : input;
  const node = walk(root, 0);
  return 'op' in node ? node : { op: 'and', rules: [node] };
}

export interface ClienteSegmento extends Record<string, unknown> {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  tags: string[] | null;
  consent: Record<string, string>;
  can_email: boolean;
  can_voice: boolean;
  can_whatsapp: boolean;
  email_bounced: boolean;
}

export function coincideSegmento(filter: ConditionGroup, customer: ClienteSegmento, orgId: number, now: Date): boolean {
  return evaluateConditionTree(filter, {
    orgId,
    now,
    customer,
    consent: customer.consent,
    opportunity: null,
    stage: null,
    pipeline: null,
    event: null,
  }).result;
}

/** Optimización: una igualdad obligatoria reduce candidatos, nunca sustituye al DSL. */
export function prefiltroIgualdadSegmento(group: ConditionGroup): { field: string; value: string } | null {
  const columns = new Set(['id', 'full_name', 'city', 'status', 'email', 'phone', 'customer_type', 'lifecycle_stage', 'company_size']);
  if (group.op === 'or' && group.rules.length !== 1) return null;
  for (const node of group.rules) {
    if ('op' in node) {
      const found = prefiltroIgualdadSegmento(node);
      if (found) return found;
    } else if (node.field.startsWith('customer.') && node.operator === 'eq' && typeof node.value === 'string' && columns.has(node.field.slice(9))) {
      return { field: node.field.slice(9), value: node.value };
    }
  }
  return null;
}
