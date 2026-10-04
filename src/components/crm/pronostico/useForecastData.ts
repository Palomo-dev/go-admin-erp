"use client";
import { useEffect, useState } from "react";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import type { listarPronostico } from "@/lib/services/crm/forecastService";
export type ForecastResponse = Awaited<ReturnType<typeof listarPronostico>>;
export function useForecastData(params: string, revision: number) {
  const [state, setState] = useState<{
    data: ForecastResponse | null;
    loading: boolean;
    error: boolean;
    forbidden: boolean;
  }>({ data: null, loading: true, error: false, forbidden: false });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let cancelled = false;
    setState({ data: null, loading: true, error: false, forbidden: false });
    pedirCrm<ForecastResponse>(`/api/crm/forecast?${params}`, {
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (!cancelled)
          setState({ data, loading: false, error: false, forbidden: false });
      })
      .catch((e) => {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: true,
            forbidden:
              e instanceof ErrorApiCrm && [401, 403].includes(e.status),
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [params, revision]);
  return state;
}
