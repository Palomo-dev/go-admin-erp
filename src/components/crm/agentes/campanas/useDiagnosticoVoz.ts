"use client";

/**
 * Diagnóstico de las campañas de voz (`GET /api/crm/voice-agents/campaigns/diagnostics`)
 * compartido por «Probar la cola ahora» y las tarjetas de campaña (chips de
 * motivo, Figma 1809:144962). Una sola lectura para todo el panel.
 */
import { useCallback, useEffect, useState } from "react";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import type { DiagnosticoVoz } from "@/lib/services/crm/voiceCampaignDiagnostics";

interface DiagnosticoRespuesta {
  success?: boolean;
  error?: string;
  data?: DiagnosticoVoz;
  puede_ejecutar?: boolean;
}

export interface EstadoDiagnosticoVoz {
  diag: DiagnosticoVoz | null;
  /** Resuelto en el servidor con el mismo predicado que exige `run-now`. */
  puedeEjecutar: boolean;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useDiagnosticoVoz(mensajeError: string): EstadoDiagnosticoVoz {
  const [diag, setDiag] = useState<DiagnosticoVoz | null>(null);
  const [puedeEjecutar, setPuedeEjecutar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await fetchJson<DiagnosticoRespuesta>("/api/crm/voice-agents/campaigns/diagnostics", { cache: "no-store" });
      if (!json?.success || !json.data) throw new Error(json?.error || mensajeError);
      setDiag(json.data);
      setPuedeEjecutar(json.puede_ejecutar === true);
    } catch (err) {
      logError("[useDiagnosticoVoz] diagnóstico", err);
      setError(describeError(err));
    } finally {
      setCargando(false);
    }
  }, [mensajeError]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { diag, puedeEjecutar, cargando, error, recargar };
}
