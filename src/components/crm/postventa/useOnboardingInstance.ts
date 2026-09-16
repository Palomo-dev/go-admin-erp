'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OnboardingInstanceStatus } from '@/lib/services/crm/onboardingService';
import type { OnboardingProgress } from '@/lib/services/crm/onboardingProgress';

/**
 * Datos del checklist de onboarding de una oportunidad (F11), por las rutas
 * server-side (la organización sale de la sesión; `completed_by` también).
 */
export interface OnboardingChecklistStep {
  id: string;
  step_number: number;
  name: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  owner: string | null;
}

export interface OnboardingChecklistData {
  id: string;
  status: OnboardingInstanceStatus;
  started_at: string;
  completed_at: string | null;
  template_name: string | null;
  steps: OnboardingChecklistStep[];
  progress: OnboardingProgress;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...init });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
  return json.data as T;
}

export function useOnboardingInstance(opportunityId: string, enabled: boolean) {
  const [data, setData] = useState<OnboardingChecklistData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'start' | 'complete' | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setData(await call<OnboardingChecklistData | null>(`/api/crm/onboarding/by-opportunity/${opportunityId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el onboarding');
      setData(null);
    }
  }, [opportunityId]);

  useEffect(() => {
    if (enabled && data === undefined) void reload();
  }, [enabled, data, reload]);

  const start = useCallback(async () => {
    setBusyAction('start');
    setError(null);
    try {
      await call('/api/crm/onboarding/instances', { method: 'POST', body: JSON.stringify({ opportunity_id: opportunityId }) });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el onboarding');
    } finally {
      setBusyAction(null);
    }
  }, [opportunityId, reload]);

  const toggleStep = useCallback(async (step: OnboardingChecklistStep) => {
    if (!data) return;
    setBusyStepId(step.id);
    setError(null);
    try {
      await call(`/api/crm/onboarding/instances/${data.id}/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify({ is_completed: !step.is_completed }) });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el paso');
    } finally {
      setBusyStepId(null);
    }
  }, [data, reload]);

  const complete = useCallback(async (): Promise<boolean> => {
    if (!data) return false;
    setBusyAction('complete');
    setError(null);
    try {
      await call(`/api/crm/onboarding/instances/${data.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el onboarding');
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [data, reload]);

  return { data, loading: data === undefined, error, busyStepId, busyAction, reload, start, toggleStep, complete };
}
