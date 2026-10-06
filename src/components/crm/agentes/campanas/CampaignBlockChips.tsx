"use client";

/**
 * Línea de estado y chips de motivo de una campaña de voz en marcha (Figma
 * CRM 1809:144563 «llamadas automáticas cada 5 min» y 1809:144962 «pasada sin
 * llamadas, motivos en chips»; móvil 1809:908240).
 *
 * La campaña llama sola: lo dice y dice cuándo es la próxima pasada (múltiplo
 * del intervalo del planificador, en la hora de la organización). Si algo la
 * frena, son chips, no un error: la próxima pasada vuelve a intentar.
 */

import React from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { intervaloMinutosDe, proximaPasada } from "@/lib/jobs/schedule";
import type { DiagnosticoCampana, Motivo } from "@/lib/services/crm/voiceCampaignDiagnostics";
import { campanaBloqueada, chipsDeCampana } from "./chipsBloqueo";

interface Props {
  campana: DiagnosticoCampana | undefined;
  organizacion: readonly Motivo[];
  /** Momento de referencia (pruebas); por defecto, ahora. */
  ahora?: Date;
}

export function CampaignBlockChips({ campana, organizacion, ahora }: Props) {
  const t = useTranslations("vozCampanasDisparo");
  const { formatTime } = useFormatDate();
  if (!campana || campana.estado !== "running") return null;
  const minutos = intervaloMinutosDe("voice_campaigns");
  const chips = chipsDeCampana(campana, organizacion);
  const bloqueada = campanaBloqueada(chips);
  const texto = (clave: string, datos: Record<string, string | number>) => {
    const proxima = typeof datos.proxima === "string" && datos.proxima ? formatTime(datos.proxima) : "";
    return t(`chips.${clave}`, { ...datos, n: Number(datos.n ?? 0), proxima });
  };
  const detalle = (codigo: string | undefined, datos: Record<string, string | number>) => {
    if (!codigo) return undefined;
    try {
      return t(`motivos.${codigo}`, datos);
    } catch {
      return undefined;
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      {minutos !== null && (
        <p className="flex items-start gap-1.5 text-xs text-fg-secondary">
          <RefreshCw aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("lineaEstado", { minutos, hora: formatTime(proximaPasada(minutos, ahora)) })}</span>
        </p>
      )}
      {chips.length > 0 && (
        <div>
          <p className="text-xs font-medium text-fg">{bloqueada ? t("noMarcaPor") : t("avisos")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={bloqueada ? t("noMarcaPor") : t("avisos")}>
            {chips.map((c) => (
              <li key={c.clave}>
                <Badge tono={c.tono} tamano="sm" title={detalle(c.motivo, c.datos)}>
                  {texto(c.clave, c.datos)}
                </Badge>
              </li>
            ))}
          </ul>
          {bloqueada && <p className="mt-1.5 text-[11px] text-fg-muted">{t("noEsError")}</p>}
        </div>
      )}
    </div>
  );
}
