'use client';

/**
 * Estado de las reglas de automatización (FASE-08 §5.2). Todo pasa por las
 * rutas de servidor: el navegador nunca escribe `automation_rules` directamente.
 */

import { useCallback, useEffect, useState } from 'react';

export interface RuleAction {
  type: string;
  [key: string]: unknown;
}

export interface AutomationRuleView {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  event: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  is_active: boolean;
  priority: number;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  actions: RuleAction[];
  conditions: unknown;
  last_run_at: string | null;
  runs_count: number;
  updated_at: string;
}

export interface AutomationRunView {
  id: string;
  automation_rule_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  skip_reason: string | null;
  error_message: string | null;
  result: { results?: { index: number; type: string; status?: string; error?: string }[] } | null;
  created_at: string;
  completed_at: string | null;
}

async function readJson(res: Response): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, body };
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  const issues = Array.isArray(body.issues) ? (body.issues as string[]).join('; ') : '';
  const error = typeof body.error === 'string' ? body.error : '';
  return [error || fallback, issues].filter(Boolean).join(' — ');
}

export function useAutomationRules() {
  const [rules, setRules] = useState<AutomationRuleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, body } = await readJson(await fetch('/api/crm/automation-rules', { cache: 'no-store' }));
      if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar las reglas'));
      setRules(((body.data as AutomationRuleView[]) ?? []).map((r) => ({ ...r, actions: r.actions ?? [] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (input: Partial<AutomationRuleView> & { id?: string }) => {
    const isEdit = !!input.id;
    const url = isEdit ? `/api/crm/automation-rules/${input.id}` : '/api/crm/automation-rules';
    const { ok, body } = await readJson(
      await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar la regla'));
    await load();
    return body.data as AutomationRuleView;
  }, [load]);

  const toggle = useCallback(async (rule: AutomationRuleView) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/automation-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar el estado'));
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { ok, body } = await readJson(await fetch(`/api/crm/automation-rules/${id}`, { method: 'DELETE' }));
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar la regla'));
    await load();
  }, [load]);

  const dryRun = useCallback(async (id: string, opportunityId: string | null) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/automation-rules/${id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, opportunity_id: opportunityId }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo simular la regla'));
    return body.data as { matched: boolean; skip_reason: string | null; actions_plan: unknown[] };
  }, []);

  return { rules, loading, error, reload: load, save, toggle, remove, dryRun };
}

export async function fetchRuns(ruleId?: string): Promise<AutomationRunView[]> {
  const qs = ruleId ? `?rule_id=${encodeURIComponent(ruleId)}&limit=50` : '?limit=50';
  const res = await fetch(`/api/crm/automation-runs${qs}`, { cache: 'no-store' });
  const { ok, body } = await readJson(res);
  if (!ok) throw new Error(messageOf(body, 'No se pudo cargar el historial'));
  return (body.data as AutomationRunView[]) ?? [];
}
