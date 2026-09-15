'use client';

/**
 * Estado de las reglas de automatización (FASE-08 §5.2). Aquí no hay red ni
 * lógica: todo vive en `ruleMutations.ts` (puro, probado ejecutado con `fetch`
 * doblado) y este hook solo lo cablea a `useReducer`. El navegador nunca
 * escribe `automation_rules` directamente: siempre las rutas de servidor.
 */

import { useCallback, useEffect, useReducer } from 'react';
import {
  applyMutation,
  browserFetch,
  deleteRule,
  dryRunRule,
  fetchRuns as fetchRunsWith,
  INITIAL_RULES_STATE,
  loadRules,
  runMutation,
  saveRule,
  toggleRule,
  type AutomationRuleView,
} from '@/lib/services/crm/automation/ruleMutations';

export type { AutomationRuleView, AutomationRunView, DryRunResult, RuleAction } from '@/lib/services/crm/automation/ruleMutations';

export function useAutomationRules() {
  const [state, dispatch] = useReducer(applyMutation, INITIAL_RULES_STATE);

  const load = useCallback(() => loadRules(browserFetch, dispatch), []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (input: Partial<AutomationRuleView> & { id?: string }) => (await runMutation(browserFetch, dispatch, () => saveRule(browserFetch, input))).row,
    [],
  );

  const toggle = useCallback(async (rule: AutomationRuleView) => {
    await runMutation(browserFetch, dispatch, () => toggleRule(browserFetch, rule));
  }, []);

  const remove = useCallback(async (id: string) => {
    await runMutation(browserFetch, dispatch, () => deleteRule(browserFetch, id));
  }, []);

  const dryRun = useCallback((id: string, opportunityId: string | null) => dryRunRule(browserFetch, id, opportunityId), []);

  return { ...state, reload: load, save, toggle, remove, dryRun };
}

export const fetchRuns = (ruleId?: string) => fetchRunsWith(browserFetch, ruleId);
