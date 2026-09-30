"use client";
import { useEffect, useState } from "react";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
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

export async function leerLlamadas(
  params: string,
  signal?: AbortSignal,
): Promise<CallsResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  try {
    const { data, extra } = await pedirCrm<CallListRow[]>(
      `/api/crm/calls?${params}`,
      { signal: controller.signal },
    );
    return {
      data,
      count: Number(extra.count),
      stats: extra.stats as CallStats,
      canViewAll: extra.canViewAll === true,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function useCallsData(params: string, revision: number) {
  const [state, setState] = useState<{
    result: CallsResponse | null;
    loading: boolean;
    error: boolean;
    forbidden: boolean;
  }>({ result: null, loading: true, error: false, forbidden: false });
  useEffect(() => {
    const controller = new AbortController();
    setState({ result: null, loading: true, error: false, forbidden: false });
    leerLlamadas(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ result, loading: false, error: false, forbidden: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            result: null,
            loading: false,
            error: true,
            forbidden:
              error instanceof ErrorApiCrm && [401, 403].includes(error.status),
          });
      });
    return () => controller.abort();
  }, [params, revision]);
  return state;
}
