"use client";

/**
 * Sección «Agentes» de /app/crm/agentes-ia (Figma CRM 1298:84133 listo,
 * 1318:776412 cargando, 1318:776789 vacío y 1318:777124 error): cuatro KPI de
 * los últimos 7 días y la cuadrícula de tarjetas. Las cifras salen de
 * `crm_voice_agents_metricas` (SQL); si fallan, la lista sigue y pinta «—».
 */

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Bot, Mic, Plus } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { StatCard } from "@/components/kit/StatCard";
import { porcentaje, variacion, type MetricasAgentes } from "@/lib/services/crm/voiceAgentMetrics";
import { AgentCard } from "./AgentCard";
import { cifrasDeAgente, describirVoz, guionDeAgente, type VozMinima } from "./agenteVista";

export interface AgenteListado {
  id: string;
  name: string;
  purpose_type: string;
  engine: string;
  language: string;
  voice_id: string | null;
  voice_ref_id: string | null;
  is_active: boolean;
}

interface Props {
  agentes: AgenteListado[];
  cargando: boolean;
  error: string | null;
  metricas: MetricasAgentes | null;
  cargandoMetricas: boolean;
  voces: readonly VozMinima[];
  dias: number;
  cambiando: string | null;
  etiquetaProposito: (p: string) => string;
  onReintentar: () => void;
  onCrear: () => void;
  onVerVoces: () => void;
  onEditar: (id: string) => void;
  onCambiarActivo: (agente: AgenteListado) => void;
}

export function AgentesListado({
  agentes,
  cargando,
  error,
  metricas,
  cargandoMetricas,
  voces,
  dias,
  cambiando,
  etiquetaProposito,
  onReintentar,
  onCrear,
  onVerVoces,
  onEditar,
  onCambiarActivo,
}: Props) {
  const t = useTranslations("crm.agentesIa.listado");
  const tx = useTranslations("crm.agentesIa");
  const formato = useFormatter();
  const formatoEntero = { format: (n: number) => formato.number(n) };

  if (cargando) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={tx("cargando")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-[88px] items-center gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="size-10 shrink-0 animate-pulse rounded-lg bg-subtle" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3 w-3/4 animate-pulse rounded bg-subtle" />
                <span className="h-3 w-1/2 animate-pulse rounded bg-subtle" />
              </span>
            </div>
          ))}
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <span className="block h-3 w-full animate-pulse rounded bg-subtle" />
              <span className="block h-3 w-2/3 animate-pulse rounded bg-subtle" />
              <span className="block h-20 w-full animate-pulse rounded-lg bg-subtle" />
              <span className="block h-3 w-full animate-pulse rounded bg-subtle" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        variante="error"
        titulo={tx("error.titulo")}
        descripcion={t("error.descripcion", { detalle: error })}
        onReintentar={onReintentar}
      />
    );
  }

  if (agentes.length === 0) {
    return (
      <EmptyState
        variante="empty"
        icono={Bot}
        titulo={t("vacio.titulo")}
        descripcion={t("vacio.descripcion")}
        accion={{ etiqueta: tx("vacio.crear"), onClick: onCrear, icono: Plus }}
        accionSecundaria={{ etiqueta: t("verVoces"), onClick: onVerVoces, icono: Mic }}
      />
    );
  }

  const tot = metricas?.totales;
  const cambio = tot ? variacion(tot.llamadas, tot.llamadas_previas) : null;
  const contactoPct = tot ? porcentaje(tot.contestadas, tot.llamadas) : null;
  const sinCifras = !cargandoMetricas && !tot;

  return (
    <div className="space-y-4">
      <KpiStrip etiqueta={t("kpi.aria")}>
        <StatCard
          etiqueta={t("kpi.llamadas", { dias })}
          valor={sinCifras ? "—" : formatoEntero.format(tot?.llamadas ?? 0)}
          detalle={
            sinCifras ? undefined : cambio === null ? t("kpi.llamadasSinBase") : t("kpi.llamadasDetalle", { n: `${cambio > 0 ? "+" : ""}${cambio}` })
          }
          cargando={cargandoMetricas}
        />
        <StatCard
          etiqueta={t("kpi.contacto")}
          valor={contactoPct === null ? "—" : `${contactoPct} %`}
          detalle={tot && tot.llamadas > 0 ? t("kpi.contactoDetalle", { contestadas: tot.contestadas, total: tot.llamadas }) : undefined}
          tono={tot && tot.llamadas > 0 ? "exito" : "neutro"}
          tendencia={tot && tot.llamadas > 0 ? "sube" : undefined}
          cargando={cargandoMetricas}
        />
        <StatCard
          etiqueta={t("kpi.reuniones")}
          valor={sinCifras ? "—" : formatoEntero.format(tot?.agendadas ?? 0)}
          detalle={t("kpi.reunionesDetalle")}
          cargando={cargandoMetricas}
        />
        <StatCard
          etiqueta={t("kpi.creditos")}
          valor={sinCifras ? "—" : formatoEntero.format(tot?.creditos_mes ?? 0)}
          detalle={
            tot?.creditos_restantes != null
              ? t("kpi.creditosDetalle", { n: formatoEntero.format(tot.creditos_restantes) })
              : t("kpi.creditosSinSaldo")
          }
          tono={tot?.creditos_restantes != null ? "advertencia" : "neutro"}
          iconoDetalle={tot?.creditos_restantes != null ? AlertTriangle : undefined}
          cargando={cargandoMetricas}
        />
      </KpiStrip>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label={tx("pestanas.agentes")}>
        {agentes.map((a) => {
          const guion = guionDeAgente(a.id, metricas?.etapas ?? []);
          return (
            <li key={a.id} className="flex min-w-0">
              <AgentCard
                id={a.id}
                nombre={a.name}
                proposito={etiquetaProposito(a.purpose_type)}
                idioma={a.language}
                motor={a.engine}
                activo={a.is_active}
                voz={describirVoz(a, voces)}
                etapas={guion.etapas}
                politica={guion.politica}
                cifras={metricas ? cifrasDeAgente(a.id, metricas.por_agente) : null}
                dias={dias}
                cambiando={cambiando === a.id}
                onEditar={() => onEditar(a.id)}
                onCambiarActivo={() => onCambiarActivo(a)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
