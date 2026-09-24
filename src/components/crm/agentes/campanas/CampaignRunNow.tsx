"use client";

/**
 * «Ejecutar ahora» + «por qué no llama» (F6 · r-voz 2026-09-23).
 *
 * Dos cosas que el panel de campañas no tenía:
 *  1. una acción para drenar la cola de ESTA organización sin esperar al
 *     planificador (útil para la primera prueba con un número real);
 *  2. el motivo por el que una campaña `running` no marca. Todas las barreras
 *     del despachador son fail-closed y hasta ahora no decían nada.
 *
 * El botón solo aparece si el SERVIDOR dice que este usuario puede ejecutarlo
 * (`puede_ejecutar` del diagnóstico, mismo predicado que exige la ruta). El
 * cliente no decide permisos.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, CheckCircle2, Info, Loader2, PhoneOutgoing, RefreshCw } from "lucide-react";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import type { DiagnosticoVoz, Motivo } from "@/lib/services/crm/voiceCampaignDiagnostics";

interface Props {
  /** Se llama tras ejecutar la cola para que la lista de campañas se recargue. */
  onRan?: () => void;
}

interface DiagnosticoRespuesta {
  success?: boolean;
  error?: string;
  data?: DiagnosticoVoz;
  puede_ejecutar?: boolean;
}

interface EjecucionRespuesta {
  success?: boolean;
  error?: string;
  data?: {
    total_calls_initiated: number;
    total_errors: string[];
    campaigns_stopped: string[];
    results: { campaigns_processed: number; calls_skipped: number; calls_enqueued: number }[];
  };
}

/** Texto del motivo con sus datos interpolados; la clave es el código, no el texto. */
function textoMotivo(t: ReturnType<typeof useTranslations>, m: Motivo): string {
  const datos = (m.datos ?? {}) as Record<string, string | number>;
  try {
    return t(`motivos.${m.codigo}`, datos);
  } catch {
    // Un código nuevo sin traducción no debe dejar la tarjeta en blanco.
    return m.codigo;
  }
}

export function CampaignRunNow({ onRan }: Props) {
  const t = useTranslations("vozCampanasDisparo");
  const [diag, setDiag] = useState<DiagnosticoVoz | null>(null);
  const [puedeEjecutar, setPuedeEjecutar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ejecutando, setEjecutando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await fetchJson<DiagnosticoRespuesta>(
        "/api/crm/voice-agents/campaigns/diagnostics",
        { cache: "no-store" },
      );
      if (!json?.success || !json.data) throw new Error(json?.error || t("errorDiagnostico"));
      setDiag(json.data);
      setPuedeEjecutar(json.puede_ejecutar === true);
    } catch (err) {
      logError("[CampaignRunNow] diagnóstico", err);
      setError(describeError(err));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutar = async () => {
    setEjecutando(true);
    try {
      const res = await fetch("/api/crm/voice-agents/campaigns/run-now", { method: "POST" });
      const json = (await res.json()) as EjecucionRespuesta;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      const iniciadas = json.data?.total_calls_initiated ?? 0;
      const motivos = json.data?.total_errors ?? [];
      toast({
        title: iniciadas > 0 ? t("resultadoConLlamadas", { n: iniciadas }) : t("resultadoSinLlamadas"),
        description: motivos.length > 0 ? motivos.slice(0, 3).join(" · ") : undefined,
      });
      onRan?.();
      void cargar();
    } catch (err) {
      toast({ title: t("errorEjecutar"), description: describeError(err), variant: "destructive" });
    } finally {
      setEjecutando(false);
    }
  };

  const bloqueosOrg = (diag?.organizacion ?? []).filter((m) => m.bloquea);
  const avisosOrg = (diag?.organizacion ?? []).filter((m) => !m.bloquea);
  const campanasConMotivo = (diag?.campanas ?? []).filter((c) => c.motivos.length > 0);

  return (
    <section
      aria-labelledby="voz-disparo-titulo"
      className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="voz-disparo-titulo"
            className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            <PhoneOutgoing className="h-4 w-4" aria-hidden="true" />
            {t("titulo")}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("descripcion")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void cargar()}
            disabled={cargando}
            aria-label={t("actualizar")}
          >
            {cargando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          {puedeEjecutar && (
            <Button size="sm" onClick={() => void ejecutar()} disabled={ejecutando}>
              {ejecutando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {ejecutando ? t("ejecutando") : t("ejecutar")}
            </Button>
          )}
        </div>
      </div>

      {!cargando && !puedeEjecutar && !error && (
        <p role="status" className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t("sinPermiso")}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {diag && (
        <div className="mt-3 space-y-3">
          {bloqueosOrg.length === 0 && campanasConMotivo.length === 0 ? (
            <p className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("todoListo")}
            </p>
          ) : null}

          {bloqueosOrg.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-900 dark:text-gray-100">
                {t("bloqueosOrganizacion")}
              </h3>
              <ul className="mt-1 space-y-1">
                {bloqueosOrg.map((m) => (
                  <li
                    key={m.codigo}
                    className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {textoMotivo(t, m)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {campanasConMotivo.map((c) => (
            <div key={c.id}>
              <h3 className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{c.nombre}</h3>
              <ul className="mt-1 space-y-1">
                {c.motivos.map((m, i) => (
                  <li
                    key={`${m.codigo}-${i}`}
                    className={
                      m.bloquea
                        ? "flex items-start gap-2 text-xs text-red-700 dark:text-red-300"
                        : "flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"
                    }
                  >
                    {m.bloquea ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    {textoMotivo(t, m)}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {avisosOrg.length > 0 && (
            <ul className="space-y-1">
              {avisosOrg.map((m) => (
                <li
                  key={m.codigo}
                  className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400"
                >
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {textoMotivo(t, m)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
