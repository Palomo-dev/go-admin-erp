"use client";

/**
 * «Verificar contra RNE» de una campaña del agente de voz (2026-09-30).
 *
 * El Registro de Números Excluidos (CRC) hay que consultarlo antes de cada lote
 * de llamadas comerciales. La cola se niega a marcar una campaña sin una
 * verificación vigente; aquí se carga la lista descargada del RNE (CSV/TXT) y
 * se ve el resultado: cuántos números traía, cuántos objetivos de la campaña se
 * excluyen y hasta cuándo vale.
 *
 * El archivo se lee en el navegador y viaja como texto a
 * `/api/crm/voice-agents/campaigns/[id]/rne`; el servidor normaliza, cruza y
 * registra. El botón solo aparece si el SERVIDOR dice que este usuario puede
 * verificar (`puede_verificar`, mismo predicado que exige el POST).
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { FilaDato, ListaDatos } from "@/components/kit/FilaDato";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";

interface Verificacion {
  checked_at: string;
  valid_until: string;
  file_name: string | null;
  numbers_in_file: number;
  checked_targets: number;
  excluded_targets: number;
  skipped_calls: number;
  vigente?: boolean;
  descartados?: number;
}

interface RespuestaGet {
  success?: boolean;
  error?: string;
  data?: Verificacion | null;
  vigencia_dias?: number;
  puede_verificar?: boolean;
}

interface RespuestaPost {
  success?: boolean;
  error?: string;
  data?: Verificacion;
}

/** Igual que el servidor (`MAX_BYTES_ARCHIVO_RNE`): se avisa antes de subir. */
const MAX_BYTES = 8 * 1024 * 1024;

export function CampaignRnePanel({ campaignId }: { campaignId: string }) {
  const t = useTranslations("vozRne");
  const { formatDateTime } = useFormatDate();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [puedeVerificar, setPuedeVerificar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recien, setRecien] = useState(false);
  const [vigenciaDias, setVigenciaDias] = useState(30);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await fetchJson<RespuestaGet>(`/api/crm/voice-agents/campaigns/${campaignId}/rne`, {
        cache: "no-store",
      });
      if (!json?.success) throw new Error(json?.error || t("errorCargar"));
      setVerificacion(json.data ?? null);
      setPuedeVerificar(json.puede_verificar === true);
      if (typeof json.vigencia_dias === "number") setVigenciaDias(json.vigencia_dias);
    } catch (err) {
      logError("[CampaignRnePanel] cargar", err);
      setError(describeError(err));
    } finally {
      setCargando(false);
    }
  }, [campaignId, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const subir = async (archivo: File) => {
    setError(null);
    setRecien(false);
    if (archivo.size > MAX_BYTES) {
      setError(t("demasiadoGrande"));
      return;
    }
    setSubiendo(true);
    try {
      const contenido = await archivo.text();
      const json = await fetchJson<RespuestaPost>(`/api/crm/voice-agents/campaigns/${campaignId}/rne`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_archivo: archivo.name, contenido }),
      });
      if (!json?.success || !json.data) throw new Error(json?.error || t("errorVerificar"));
      setVerificacion({ ...json.data, vigente: true });
      setRecien(true);
    } catch (err) {
      logError("[CampaignRnePanel] verificar", err);
      setError(describeError(err));
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const vigente = verificacion?.vigente === true;

  return (
    <section
      aria-labelledby={`${inputId}-titulo`}
      className="mt-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${inputId}-titulo`} className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("titulo")}
        </h4>
        {!cargando && (
          <StatusBadge
            estado={vigente ? "vigente" : verificacion ? "vencida" : "pendiente"}
            etiqueta={vigente ? t("estadoVigente") : verificacion ? t("estadoVencida") : t("estadoSin")}
            tono={vigente ? "exito" : "advertencia"}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{t("ayuda", { dias: vigenciaDias })}</p>

      {cargando ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t("cargando")}
        </p>
      ) : verificacion ? (
        <div className="mt-2" aria-live="polite">
          {recien && (
            <p className="mb-1 text-xs font-medium text-green-800 dark:text-green-300" role="status">
              {t("resultado", { n: verificacion.excluded_targets })}
            </p>
          )}
          <ListaDatos>
            <FilaDato etiqueta={t("verificada")} valor={formatDateTime(verificacion.checked_at)} />
            <FilaDato etiqueta={t("validaHasta")} valor={formatDateTime(verificacion.valid_until)} />
            <FilaDato etiqueta={t("numerosArchivo")} valor={String(verificacion.numbers_in_file)} />
            <FilaDato etiqueta={t("objetivosRevisados")} valor={String(verificacion.checked_targets)} />
            <FilaDato etiqueta={t("excluidos")} valor={String(verificacion.excluded_targets)} />
            <FilaDato etiqueta={t("omitidas")} valor={String(verificacion.skipped_calls)} />
          </ListaDatos>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200" role="status">
          {t("sinVerificacion")}
        </p>
      )}

      {error && (
        <p className="mt-2 break-words text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {puedeVerificar ? (
        <div className="mt-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subir(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
            aria-describedby={`${inputId}-titulo`}
          >
            {subiendo ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            {subiendo ? t("verificando") : t("verificar")}
          </Button>
        </div>
      ) : (
        !cargando && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("sinPermiso")}</p>
      )}
    </section>
  );
}
