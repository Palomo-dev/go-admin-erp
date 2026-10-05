'use client';
import { useEffect, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { AutomationRunView } from './useAutomationRules';

/** La ruta existente pagina por fecha descendente; sólo se leen fallos del periodo real del resumen. */
export async function readRulesWithErrors(from: string, until: string, signal?: AbortSignal): Promise<Set<string>> {
  const found = new Set<string>(), start = Date.parse(from), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Periodo no disponible');
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const result = await pedirCrm<AutomationRunView[]>(`/api/crm/automation-runs?status=failed&limit=${limit}&offset=${offset}`, { signal });
    if (!Array.isArray(result.data)) throw new Error('Historial no disponible');
    let beforePeriod = false;
    for (const run of result.data) {
      const time = Date.parse(run.created_at);
      if (time < start) beforePeriod = true;
      if (run.status === 'failed' && time >= start && time <= end) found.add(run.automation_rule_id);
    }
    const count = typeof result.extra.count === 'number' ? result.extra.count : null;
    if (beforePeriod || result.data.length < limit || (count !== null && offset + limit >= count)) return found;
  }
}
export function useRulesWithErrors(enabled: boolean, scope: number | null, from?: string, until?: string, revision = 0) {
  const [ids, setIds] = useState<Set<string>>(new Set()), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setIds(new Set()); setError(null); setLoading(false);
    if (!enabled || scope === null || !from || !until) return;
    const controller = new AbortController(); let active = true;
    setLoading(true);
    readRulesWithErrors(from, until, controller.signal).then(value => { if (active) setIds(value); }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Historial no disponible'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [enabled, scope, from, until, revision]);
  return { ids, loading, error };
}
