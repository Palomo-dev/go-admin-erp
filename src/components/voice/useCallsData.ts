'use client';

/**
 * Lectura del listado de Llamadas: filas, total, cifras y `canViewAll` en una
 * sola petición (`GET /api/crm/calls` → RPC `crm_calls_list`). Cancela la
 * petición anterior al cambiar filtros y distingue «sin permiso» de «error».
 */
import { useEffect, useState } from 'react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { CallListRow, CallsListStats } from '@/lib/services/crm/callManagementService';

export interface CallsResponse {
  data: CallListRow[];
  count: number;
  stats: CallsListStats;
  canViewAll: boolean;
}

/** Tiempo máximo de una lectura: después se muestra el estado de error con «Reintentar». */
const TIEMPO_MAXIMO_MS = 20_000;

export async function leerLlamadas(params: string, signal?: AbortSignal): Promise<CallsResponse> {
  const controller = new AbortController();
  const abortar = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortar, { once: true });
  const timer = setTimeout(abortar, TIEMPO_MAXIMO_MS);
  try {
    const { data, extra } = await pedirCrm<CallListRow[]>(`/api/crm/calls?${params}`, { signal: controller.signal });
    return {
      data: data ?? [],
      count: Number(extra.count) || 0,
      stats: extra.stats as CallsListStats,
      canViewAll: extra.canViewAll === true,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortar);
  }
}

export interface EstadoLlamadas {
  result: CallsResponse | null;
  loading: boolean;
  error: boolean;
  forbidden: boolean;
}

export function useCallsData(params: string, revision: number, enabled = true): EstadoLlamadas {
  const [state, setState] = useState<EstadoLlamadas>({ result: null, loading: true, error: false, forbidden: false });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((s) => ({ result: s.result, loading: true, error: false, forbidden: false }));
    leerLlamadas(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ result, loading: false, error: false, forbidden: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          result: null,
          loading: false,
          error: true,
          forbidden: error instanceof ErrorApiCrm && (error.status === 401 || error.status === 403),
        });
      });
    return () => controller.abort();
  }, [params, revision, enabled]);
  return state;
}
