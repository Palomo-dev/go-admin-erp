import { isGroup, type ConditionGroup, type ConditionNode, type ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
const NO_VALUE = new Set(['is_null', 'is_not_null']);
const NUMERIC_FIELDS = new Set(['customer.health_score', 'customer.tags_count', 'customer.purchased_category_ids', 'opportunity.amount', 'opportunity.score_total', 'opportunity.icp_fit_score', 'stage.position', 'stage.probability', 'stage.sla_days']);
export function textToValue(text: string, operator: string, field?: string): unknown {
  const parse = (raw: string) => {
    const v = raw.trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if ((!field || NUMERIC_FIELDS.has(field) || operator === 'within_days') && v && Number.isFinite(Number(v))) return Number(v);
    return v;
  };
  if (NO_VALUE.has(operator)) return undefined;
  if (operator === 'in' || operator === 'not_in') return text.split(',').map(parse).filter(v => v !== '');
  return parse(text);
}
export function toEditableGroup(value: unknown): ConditionGroup {
  if (Array.isArray(value)) return { op: 'and', rules: value as ConditionNode[] };
  if (value && typeof value === 'object' && isGroup(value as ConditionNode)) {
    const group = value as ConditionGroup;
    return { op: group.op === 'or' ? 'or' : 'and', rules: group.rules };
  }
  if (value && typeof value === 'object' && 'field' in value) return { op: 'and', rules: [value as ConditionRule] };
  return { op: 'and', rules: [] };
}
