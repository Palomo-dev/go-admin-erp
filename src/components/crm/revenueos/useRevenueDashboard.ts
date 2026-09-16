'use client';

/**
 * F14 — carga del panel Revenue OS desde `/api/crm/revenue/dashboard`.
 * El rango se manda como `start`/`end` (YYYY-MM-DD); sin rango el servidor
 * aplica los últimos 12 meses en la zona horaria de la organización. Un error
 * del servidor (400 rango, 502 RPC) se muestra tal cual: nunca «sin datos».
 *
 * Ronda 2: al fallar una carga `data` se VACÍA (el panel anterior ya no
 * corresponde a lo pedido); solo sobrevive `lastPeriod` para que el control de
 * rango conserve las fechas y el usuario pueda corregirlas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RevenueDashboard } from '@/lib/services/crm/revenueOsService';
import { describeError, logError } from '@/lib/utils/errorMessage';

export interface DashboardRange {
  start: string | null;
  end: string | null;
}

interface State {
  data: RevenueDashboard | null;
  /** Periodo de la última carga correcta (para el control de rango tras un error). */
  lastPeriod: RevenueDashboard['period'] | null;
  canEditInputs: boolean;
  loading: boolean;
  error: string | null;
}

export function useRevenueDashboard(range: DashboardRange) {
  const [state, setState] = useState<State>({ data: null, lastPeriod: null, canEditInputs: false, loading: true, error: null });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (range.start) params.set('start', range.start);
      if (range.end) params.set('end', range.end);
      const qs = params.toString();
      const res = await fetch(`/api/crm/revenue/dashboard${qs ? `?${qs}` : ''}`, { credentials: 'include' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; data?: RevenueDashboard; error?: string; can_edit_inputs?: boolean } | null;
      if (!res.ok || !body?.success || !body.data) {
        throw new Error(body?.error || `Error ${res.status}`);
      }
      if (id !== requestId.current) return;
      setState({ data: body.data, lastPeriod: body.data.period, canEditInputs: body.can_edit_inputs === true, loading: false, error: null });
    } catch (err) {
      if (id !== requestId.current) return;
      logError('[RevenueOs] cargar panel', err);
      setState((s) => ({ ...s, data: null, loading: false, error: describeError(err) }));
    }
  }, [range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
