'use client';

/**
 * Estado y I/O de `/app/finanzas/comisiones` (F13). Lee y muta SOLO por las
 * rutas de API (la organización sale de la sesión; cada transición valida su
 * estado de partida en el servidor). Sin lógica de negocio aquí: la que hay es
 * `comisionesModel.ts` (puro, probado).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { describeError } from '@/lib/utils/errorMessage';
import type { CommissionRow, MoneyAccountOption } from '@/lib/services/crm/commissionAdminService';
import type { CurrencySummary } from '@/lib/services/crm/commissionTransitions';
import { actionsForSelection, appendCommissionPage, buildCommissionsQuery, commissionActionMessage, cuentaPagoABody, emptyFilters, type ComisionesFiltersState, type CuentaPagoValor } from './comisionesModel';

interface ListResponse {
  success: boolean;
  data: CommissionRow[];
  count: number;
  /** Solo la moneda base; `summary_others` trae las demás monedas aparte (nunca sumadas). */
  summary: CurrencySummary;
  summary_others: CurrencySummary[];
  currency: string | null;
  can_manage: boolean;
  timezone: string;
}

interface BulkResponse {
  success: boolean;
  data: { paid: string[]; failed: Array<{ id: string; reason: string }> };
}

const EMPTY_SUMMARY: CurrencySummary = {
  currency: '',
  accrued_total: 0,
  pending_total: 0,
  paid_total: 0,
  cancelled_total: 0,
  rejected_total: 0,
  clawback_total: 0,
  count: 0,
  count_pending: 0,
  count_paid: 0,
  count_cancelled: 0,
};

async function post<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function useComisiones() {
  const [filters, setFilters] = useState<ComisionesFiltersState>(emptyFilters);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  // Total del filtro según la API: la lista se pagina (200 por página) y ya no se trunca en silencio.
  const [count, setCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<CurrencySummary>(EMPTY_SUMMARY);
  const [summaryOthers, setSummaryOthers] = useState<CurrencySummary[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Cuentas bancarias para elegir de dónde sale el pago (solo quien puede pagar).
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccountOption[]>([]);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const qs = buildCommissionsQuery(filters);
      const res = await fetchJson<ListResponse>(`/api/crm/commissions${qs ? `?${qs}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRows(res.data);
      setCount(res.count ?? res.data.length);
      setSummary(res.summary);
      setSummaryOthers(res.summary_others ?? []);
      setCurrency(res.currency ?? null);
      setCanManage(res.can_manage);
      setSelected((prev) => new Set(Array.from(prev).filter((id) => res.data.some((r) => r.id === id))));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    fetchJson<{ success: boolean; data: MoneyAccountOption[] }>('/api/crm/commissions/money-accounts')
      .then((res) => {
        if (alive) setMoneyAccounts(res.data ?? []);
      })
      // Sin la lista se puede pagar igual con la regla contable o en efectivo.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canManage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || rows.length >= count) return;
    setLoadingMore(true);
    try {
      const qs = buildCommissionsQuery(filters, { offset: rows.length });
      const res = await fetchJson<ListResponse>(`/api/crm/commissions?${qs}`);
      setRows((prev) => appendCommissionPage(prev, res.data));
      setCount(res.count ?? count);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoadingMore(false);
    }
  }, [count, filters, loadingMore, rows.length]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const actions = useMemo(() => actionsForSelection(selectedRows), [selectedRows]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === rows.length && rows.length > 0 ? new Set() : new Set(rows.map((r) => r.id))));
  }, [rows]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  /** Devuelve el mensaje de resultado; lanza si falla. */
  const run = useCallback(
    async (fn: () => Promise<string>): Promise<string> => {
      setBusy(true);
      try {
        const msg = await fn();
        clearSelection();
        await reload();
        return msg;
      } finally {
        setBusy(false);
      }
    },
    [clearSelection, reload]
  );

  const payMany = useCallback(
    (ids: string[], cuenta: CuentaPagoValor = 'rule') =>
      run(async () => {
        const res = await post<BulkResponse>('/api/crm/commissions/bulk-pay', { commission_ids: ids, ...cuentaPagoABody(cuenta) });
        const { paid, failed } = res.data;
        return commissionActionMessage('pagar', paid.length, failed.length, failed[0]?.reason);
      }),
    [run]
  );

  const rejectMany = useCallback(
    (ids: string[], reason: string) =>
      run(async () => {
        let ok = 0;
        let firstError: string | null = null;
        for (const id of ids) {
          try {
            await post(`/api/crm/commissions/${encodeURIComponent(id)}/reject`, { reason });
            ok += 1;
          } catch (err) {
            firstError = firstError ?? describeError(err);
          }
        }
        if (firstError && ok === 0) throw new Error(firstError);
        return commissionActionMessage('rechazar', ok, ids.length - ok, firstError ?? undefined);
      }),
    [run]
  );

  const clawbackOne = useCallback(
    (id: string, reason: string) =>
      run(async () => {
        await post(`/api/crm/commissions/${encodeURIComponent(id)}/clawback`, { reason });
        return 'Comisión revertida (clawback)';
      }),
    [run]
  );

  return {
    filters,
    setFilters,
    rows,
    count,
    loadMore,
    loadingMore,
    summary,
    summaryOthers,
    currency,
    canManage,
    loading,
    error,
    reload,
    selected,
    selectedRows,
    actions,
    toggle,
    toggleAll,
    clearSelection,
    busy,
    moneyAccounts,
    payMany,
    rejectMany,
    clawbackOne,
  };
}

export type UseComisiones = ReturnType<typeof useComisiones>;
