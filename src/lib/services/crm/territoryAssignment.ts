import { evaluateICPCriteria, type ICPCriterion } from './icpService';
import { normalizarFiltroSegmento } from './segmentosLogica';
import { evaluateConditionTree, type ConditionGroup } from './automation/conditionsDsl';

export interface AssignmentTerritory {
  id: string;
  name: string;
  sort_order?: number;
  criteria: Record<string, unknown>;
}

/** New territories use exactly the Segment/Automation DSL. Legacy ICP is explicit. */
export function territoryMatches(
  territory: AssignmentTerritory,
  customer: Record<string, unknown>,
  opportunity: Record<string, unknown>,
  orgId: number,
  now: Date,
): boolean {
  const criteria = territory.criteria;
  if (criteria.filter) {
    const filter = normalizarFiltroSegmento(criteria.filter) as ConditionGroup;
    if (!filter.rules.length) return false;
    return evaluateConditionTree(filter, {
      orgId, now, customer, opportunity, stage: null, pipeline: null, event: null,
      consent: (customer.consent ?? {}) as Record<string, string>,
    }).result;
  }
  const rules = criteria.rules;
  if (!Array.isArray(rules) || !rules.length) return false;
  const legacy = rules.map((rule, index) => ({
    ...rule, id: `${territory.id}-${index}`, organization_id: orgId,
    icp_profile_id: territory.id, weight: rule.weight ?? 1,
    is_required: rule.is_required ?? false, created_at: '', updated_at: '',
  })) as ICPCriterion[];
  return evaluateICPCriteria(legacy, customer, opportunity).matched;
}

/** First match wins; one implementation serves assignment, counts and simulation. */
export function matchingTerritories(
  territories: AssignmentTerritory[], customer: Record<string, unknown>,
  opportunity: Record<string, unknown>, orgId: number, now: Date,
): AssignmentTerritory[] {
  return [...territories]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id))
    .filter((territory) => territoryMatches(territory, customer, opportunity, orgId, now));
}
