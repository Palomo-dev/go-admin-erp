'use client';

/**
 * Estado y I/O de `/app/finanzas/comisiones` (F13; rediseño Tesorería v2,
 * Figma 1012:87993). Lee y muta SOLO por las rutas de API (la organización sale
 * de la sesión; cada transición valida su estado de partida en el servidor).
 * Sin lógica de negocio aquí: la que hay es `comisionesModel.ts` (puro, probado).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { describeError } from '@/lib/utils/errorMessage';
import type { AsientoComision, CommissionRow, MoneyAccountOption } from '@/lib/services/crm/commissionAdminService';
import type { CurrencySummary } from '@/lib/services/crm/commissionTransitions';
import {
  appendCommissionPage,
  buildCommissionsQuery,
  commissionActionMessage,
  cuentaPagoABody,
  emptyFilters,
  enLotes,
  type ComisionesFiltersState,
  type CuentaPagoValor,
} from './comisionesModel';

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
  /** Asiento vigente de cada comisión de la página (pago o devengo). */
  asientos?: Record<string, AsientoComision>;
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

export function useComisiones(inicial: Partial<ComisionesFiltersState> = {}) {
  const [filters, setFilters] = useState<ComisionesFiltersState>(() => ({ ...emptyFilters(), ...inicial }));
  const [rows, setRows] = useState<CommissionRow[]>([]);
  // Total del filtro según la API: la lista se pagina (200 por página) y ya no se trunca en silencio.
  const [count, setCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<CurrencySummary>(EMPTY_SUMMARY);
  const [summaryOthers, setSummaryOthers] = useState<CurrencySummary[]>([]);
  // Resumen de TODOS los estados con los demás filtros: alimenta las cifras y los
  // contadores de las pestañas aunque la pestaña filtre por estado.
  const [summaryGeneral, setSummaryGeneral] = useState<CurrencySummary | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asientos, setAsientos] = useState<Record<string, AsientoComision>>({});
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
      const qsGeneral = filters.status === 'all' ? null : buildCommissionsQuery({ ...filters, status: 'all' });
      const [res, general] = await Promise.all([
        fetchJson<ListResponse>(`/api/crm/commissions${qs ? `?${qs}` : ''}`, { signal: controller.signal }),
        qsGeneral === null
          ? Promise.resolve(null)
          : fetchJson<ListResponse>(`/api/crm/commissions?${qsGeneral ? `${qsGeneral}&` : ''}limit=1`, { signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      setRows(res.data);
      setCount(res.count ?? res.data.length);
      setSummary(res.summary);
      setSummaryOthers(res.summary_others ?? []);
      setSummaryGeneral(general ? general.summary : res.summary);
      setCurrency(res.currency ?? null);
      setCanManage(res.can_manage);
      setAsientos(res.asientos ?? {});
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
      setAsientos((prev) => ({ ...prev, ...(res.asientos ?? {}) }));
      setCount(res.count ?? count);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoadingMore(false);
    }
  }, [count, filters, loadingMore, rows.length]);

  /** Devuelve el mensaje de resultado; lanza si falla. */
  const run = useCallback(
    async (fn: () => Promise<string>): Promise<string> => {
      setBusy(true);
      try {
        const msg = await fn();
        await reload();
        return msg;
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );

  /** Paga en lotes de 200 (tope de la ruta); cada comisión valida su estado en el servidor. */
  const payMany = useCallback(
    (ids: string[], cuenta: CuentaPagoValor = 'rule', referencia = '') =>
      run(async () => {
        const paid: string[] = [];
        const failed: Array<{ id: string; reason: string }> = [];
        const extra = referencia.trim() ? { reference: referencia.trim() } : {};
        for (const lote of enLotes(ids)) {
          const res = await post<BulkResponse>('/api/crm/commissions/bulk-pay', { commission_ids: lote, ...cuentaPagoABody(cuenta), ...extra });
          paid.push(...res.data.paid);
          failed.push(...res.data.failed);
        }
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
    summaryGeneral,
    currency,
    canManage,
    loading,
    error,
    reload,
    asientos,
    busy,
    moneyAccounts,
    payMany,
    rejectMany,
    clawbackOne,
  };
}

export type UseComisiones = ReturnType<typeof useComisiones>;
