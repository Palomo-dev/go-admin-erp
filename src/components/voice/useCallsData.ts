"use client";
import { useEffect, useState } from "react";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import { RequestDeadlineError, withRequestDeadline } from "@/lib/utils/requestDeadline";
import { tiempoLecturaCrm } from "@/lib/utils/crmReadTimeout";
import type {
  CallListRow,
  CallStats,
} from "@/lib/services/crm/callManagementService";

export interface CallsResponse {
  data: CallListRow[];
  count: number;
  stats: CallStats;
  canViewAll: boolean;
}

/** Next dev compila la ruta en su primer uso; producción ya está compilada. */
export function tiempoCargaLlamadas(): number {
  return tiempoLecturaCrm();
}

export async function leerLlamadas(
  params: string,
  signal?: AbortSignal,
): Promise<CallsResponse> {
  try {
    return await withRequestDeadline(async (requestSignal) => {
      const { data, extra } = await pedirCrm<CallListRow[]>(
        `/api/crm/calls?${params}`,
        { signal: requestSignal },
      );
      return {
        data,
        count: Number(extra.count),
        stats: extra.stats as CallStats,
        canViewAll: extra.canViewAll === true,
      };
    }, { timeoutMs: tiempoCargaLlamadas(), signal });
  } catch (error) {
    if (error instanceof RequestDeadlineError && error.code === "REQUEST_TIMEOUT") {
      throw new ErrorApiCrm(504, "REQUEST_TIMEOUT", "La carga de llamadas tardó demasiado. Vuelve a intentarlo.");
    }
    throw error;
  }
}

export function useCallsData(
  params: string,
  revision: number,
  options: { enabled?: boolean; scope?: number } = {},
) {
  const enabled = options.enabled !== false;
  const requestKey = JSON.stringify([options.scope ?? null, enabled, params, revision]);
  const empty = { result: null, loading: true, error: false, forbidden: false, errorCode: null };
  const [state, setState] = useState<{
    key: string;
    result: CallsResponse | null;
    loading: boolean;
    error: boolean;
    forbidden: boolean;
    errorCode: string | null;
  }>({ key: requestKey, ...empty });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: requestKey, result: null, loading: true, error: false, forbidden: false, errorCode: null });
    if (!enabled) return () => controller.abort();
    leerLlamadas(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, result, loading: false, error: false, forbidden: false, errorCode: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key: requestKey,
            result: null,
            loading: false,
            error: true,
            forbidden:
              error instanceof ErrorApiCrm && [401, 403].includes(error.status),
            errorCode: error instanceof ErrorApiCrm ? error.codigo : null,
          });
      });
    return () => controller.abort();
  }, [params, requestKey, enabled]);
  // Ocultar el resultado anterior durante el render que cambia ámbito/filtros,
  // antes de que React ejecute la limpieza de la petición previa.
  return state.key === requestKey ? state : empty;
}
