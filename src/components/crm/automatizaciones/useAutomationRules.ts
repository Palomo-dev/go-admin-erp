'use client';

/**
 * Estado de las reglas de automatización (FASE-08 §5.2). Aquí no hay red ni
 * lógica: todo vive en `ruleMutations.ts` (puro, probado ejecutado con `fetch`
 * doblado) y este hook solo lo cablea a `useReducer`. El navegador nunca
 * escribe `automation_rules` directamente: siempre las rutas de servidor.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  applyMutation,
  browserFetch,
  deleteRule,
  dryRunRule,
  bulkDryRunRule,
  fetchRuns as fetchRunsWith,
  INITIAL_RULES_STATE,
  loadRules,
  runMutation,
  saveRule,
  toggleRule,
  type AutomationRuleView,
  type RulesEvent,
} from '@/lib/services/crm/automation/ruleMutations';

export type { AutomationRuleView, AutomationRunView, DryRunResult, RuleAction } from '@/lib/services/crm/automation/ruleMutations';

export function useAutomationRules() {
  const { organization } = useOrganization(); const orgId = organization?.id ?? null;
  const activeScope = useRef(orgId); activeScope.current = orgId;
  const [state, dispatch] = useReducer(applyMutation, INITIAL_RULES_STATE);
  const scopedDispatch = useCallback((event: RulesEvent) => { if (activeScope.current === orgId) dispatch(event); }, [orgId]);

  const load = useCallback(() => loadRules(browserFetch, scopedDispatch), [scopedDispatch]);

  useEffect(() => {
    dispatch({ type:'scope_changed', scope:orgId });
    if (orgId) void load();
  }, [load,orgId]);

  const save = useCallback(
    async (input: Partial<AutomationRuleView> & { id?: string }) => (await runMutation(browserFetch, scopedDispatch, () => saveRule(browserFetch, input))).row,
    [scopedDispatch],
  );

  const toggle = useCallback(async (rule: AutomationRuleView) => {
    await runMutation(browserFetch, scopedDispatch, () => toggleRule(browserFetch, rule));
  }, [scopedDispatch]);

  const remove = useCallback(async (id: string) => {
    await runMutation(browserFetch, scopedDispatch, () => deleteRule(browserFetch, id));
  }, [scopedDispatch]);

  const dryRun = useCallback((id: string, opportunityId: string | null) => dryRunRule(browserFetch, id, opportunityId), []);
  const bulkDryRun = useCallback((id: string) => bulkDryRunRule(browserFetch, id), []);

  return { ...(state.scope === orgId ? state : INITIAL_RULES_STATE), organizationId:orgId, reload: load, save, toggle, remove, dryRun, bulkDryRun };
}

export const fetchRuns = (ruleId?: string) => fetchRunsWith(browserFetch, ruleId);
