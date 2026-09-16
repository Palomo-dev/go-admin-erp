'use client';

/**
 * Cuotas de un miembro (F13): lectura con cumplimiento en vivo y mutaciones,
 * SOLO por `/api/crm/sales-targets` (la organización sale de la sesión; el
 * servidor valida rol, pertenencia del miembro y el input).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { describeError } from '@/lib/utils/errorMessage';
import type { QuotaInput, QuotaProgress } from '@/lib/services/crm/quotaProgress';
import type { SalesTargetWithProgress } from '@/lib/services/crm/salesTargetService';

export type QuotaRow = SalesTargetWithProgress & { progress_detail: QuotaProgress };

interface ListResponse {
  success: boolean;
  data: QuotaRow[];
  today: string;
  timezone: string;
  can_manage: boolean;
}

interface ApiError extends Error {
  field?: string;
}

async function send<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  return fetchJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function useMemberQuotas(userId: string | null) {
  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [today, setToday] = useState<string>('');
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<ListResponse>(`/api/crm/sales-targets?user_id=${encodeURIComponent(userId)}&with_progress=1`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRows(res.data);
      setToday(res.today);
      setCanManage(res.can_manage);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const out = await fn();
        await reload();
        return out;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  const create = useCallback(
    (payload: QuotaInput) => run(() => send('/api/crm/sales-targets', 'POST', { user_id: userId, ...payload })),
    [run, userId]
  );

  const update = useCallback(
    (id: string, patch: Partial<QuotaInput>) => run(() => send(`/api/crm/sales-targets/${encodeURIComponent(id)}`, 'PATCH', patch)),
    [run]
  );

  const remove = useCallback((id: string) => run(() => send(`/api/crm/sales-targets/${encodeURIComponent(id)}`, 'DELETE')), [run]);

  return { rows, today, canManage, loading, error, busy, reload, create, update, remove };
}

export type UseMemberQuotas = ReturnType<typeof useMemberQuotas>;
export type { ApiError };
