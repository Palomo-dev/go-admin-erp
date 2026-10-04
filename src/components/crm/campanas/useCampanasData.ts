"use client";
import { useEffect, useState } from "react";
import { pedirCrm, ErrorApiCrm } from "@/components/crm/acciones/apiCrm";
import type { listarCampanasUnificadas } from "@/lib/services/crm/campaignsUnificadasService";
export type CampanasRespuesta = Awaited<
  ReturnType<typeof listarCampanasUnificadas>
>;
export function useCampanasData(query: string, revision: number) {
  return useCampanasLectura<CampanasRespuesta>(
    `/api/crm/campaigns/unified?${query}`,
    revision,
  );
}
export function useCampanasLectura<T>(url: string, revision: number) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: boolean;
    forbidden: boolean;
  }>({ data: null, loading: true, error: false, forbidden: false });
  useEffect(() => {
    let cancelled = false;
    let current: AbortController | null = null;
    const run = async (initial: boolean) => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      if (initial)
        setState({ data: null, loading: true, error: false, forbidden: false });
      try {
        const { data } = await pedirCrm<T>(url, { signal: controller.signal });
        if (!cancelled && current === controller)
          setState({ data, loading: false, error: false, forbidden: false });
      } catch (e) {
        if (!cancelled && current === controller)
          setState({
            data: null,
            loading: false,
            error: true,
            forbidden:
              e instanceof ErrorApiCrm && [401, 403].includes(e.status),
          });
      } finally {
        clearTimeout(timeout);
      }
    };
    void run(true);
    const interval = setInterval(() => {
      if (!document.hidden) void run(false);
    }, 15000);
    return () => {
      cancelled = true;
      current?.abort();
      clearInterval(interval);
    };
  }, [url, revision]);
  return state;
}
