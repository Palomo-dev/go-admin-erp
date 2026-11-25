"use client";

/**
 * Lee las cifras del listado de agentes (`GET /api/crm/voice-agents/metrics`).
 * Un fallo aquí no tumba la lista: las tarjetas pintan «—» y las KPI su
 * esqueleto se quita con «—»; la lista de agentes tiene su propio error.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/utils/fetchJson";
import { logError } from "@/lib/utils/errorMessage";
import { normalizarMetricas, type MetricasAgentes } from "@/lib/services/crm/voiceAgentMetrics";

export function useMetricasAgentes(dias: number) {
  const [datos, setDatos] = useState<MetricasAgentes | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: unknown }>(
        `/api/crm/voice-agents/metrics?dias=${dias}`,
        { cache: "no-store" },
      );
      if (!json?.success) throw new Error(json?.error || "metrics");
      setDatos(normalizarMetricas(json.data));
    } catch (err) {
      logError("[AgentesIaPage] cargar cifras", err);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { datos, cargando, recargar: cargar };
}
