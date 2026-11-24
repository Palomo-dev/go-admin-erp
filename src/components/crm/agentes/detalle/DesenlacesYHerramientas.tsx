"use client";

/**
 * Detalle del agente (Figma CRM 1311:86823): «Cómo terminaron las llamadas»
 * (seis desenlaces con barra; omitida en ámbar, fallida en rojo) y
 * «Herramientas usadas» (voice_agent_tool_runs con su estado más frecuente;
 * las obligatorias del runtime llevan «Obligatoria»).
 */

import React from "react";
import { useTranslations } from "next-intl";
import {
  Ban,
  Bot,
  CalendarPlus,
  ClipboardList,
  FileText,
  GitBranch,
  Phone,
  PhoneForwarded,
  PhoneOff,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarraProgreso } from "@/components/kit/BarraProgreso";
import type { TonoBadge } from "@/components/kit/estadoTono";
import {
  agruparDesenlaces,
  HERRAMIENTAS_OBLIGATORIAS,
  porcentaje,
  type MetricasAgentes,
} from "@/lib/services/crm/voiceAgentMetrics";

const ICONO_HERRAMIENTA: Record<string, LucideIcon> = {
  book_meeting: CalendarPlus,
  create_task: ClipboardList,
  log_objection: FileText,
  move_opportunity_stage: GitBranch,
  log_consent_opt_out: Ban,
  get_customer_context: Search,
  transfer_to_human: PhoneForwarded,
  end_call: PhoneOff,
  schedule_callback: Phone,
};

const TONO_ESTADO_HERRAMIENTA: Record<string, TonoBadge> = {
  applied: "exito",
  suggested: "informacion",
  denied: "neutro",
  failed: "peligro",
};

const TONO_BARRA: Record<string, "marca" | "advertencia" | "peligro"> = {
  skipped: "advertencia",
  failed: "peligro",
};

export function DesenlacesYHerramientas({
  datos,
  cargando,
}: {
  datos: MetricasAgentes | null;
  cargando: boolean;
}) {
  const t = useTranslations("crm.agentesIa.detalle");
  const tt = useTranslations("crm.agentesIa.agentToolsTab.herramientas");
  const desenlaces = datos ? agruparDesenlaces(datos.estados) : [];
  const totalDesenlaces = desenlaces.reduce((acc, d) => acc + d.n, 0);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="agente-desenlaces"
        className="rounded-xl border border-line bg-surface p-4"
      >
        <h2 id="agente-desenlaces" className="text-base font-semibold text-fg">
          {t("desenlaces.titulo")}
        </h2>
        <p className="text-sm text-fg-secondary">
          {t("desenlaces.subtitulo", { n: totalDesenlaces })}
        </p>
        <ul className="mt-4 space-y-4">
          {desenlaces.map((d) => {
            const pct = porcentaje(d.n, totalDesenlaces) ?? 0;
            return (
              <li key={d.grupo} className="space-y-1.5">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-secondary">
                    {t(`desenlaces.grupos.${d.grupo}`)}
                  </span>
                  <span className="tabular-nums text-fg">
                    {t("desenlaces.fila", { n: d.n, pct })}
                  </span>
                </span>
                <BarraProgreso
                  etiqueta={t(`desenlaces.grupos.${d.grupo}`)}
                  valor={cargando ? 0 : pct}
                  max={100}
                  textoValor={t("desenlaces.fila", { n: d.n, pct })}
                  tono={TONO_BARRA[d.grupo] ?? "marca"}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="agente-herramientas"
        className="rounded-xl border border-line bg-surface p-4"
      >
        <h2
          id="agente-herramientas"
          className="text-base font-semibold text-fg"
        >
          {t("herramientas.titulo")}
        </h2>
        <p className="text-sm text-fg-secondary">
          {t("herramientas.subtitulo")}
        </p>
        {datos && datos.herramientas.length === 0 ? (
          <p className="mt-4 text-sm text-fg-secondary">
            {t("herramientas.vacio")}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {(datos?.herramientas ?? []).map((h) => {
              const Icono = ICONO_HERRAMIENTA[h.tool] ?? Bot;
              const obligatoria = HERRAMIENTAS_OBLIGATORIAS.includes(h.tool);
              return (
                <li
                  key={h.tool}
                  className="flex min-h-10 items-center gap-3 py-1.5"
                >
                  <Icono
                    aria-hidden="true"
                    className="size-4 shrink-0 text-fg-secondary"
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {tt.has(h.tool) ? tt(h.tool) : h.tool}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    {h.n}
                  </span>
                  <Badge
                    tono={
                      obligatoria
                        ? "advertencia"
                        : (TONO_ESTADO_HERRAMIENTA[h.status] ?? "neutro")
                    }
                    tamano="sm"
                    apariencia="contorno"
                  >
                    {obligatoria
                      ? t("herramientas.estados.obligatoria")
                      : t.has(`herramientas.estados.${h.status}`)
                        ? t(`herramientas.estados.${h.status}`)
                        : h.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
