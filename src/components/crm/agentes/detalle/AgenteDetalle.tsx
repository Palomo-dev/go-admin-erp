"use client";

/**
 * /app/crm/agentes-ia/[id] — Detalle del agente con sus métricas (Figma CRM
 * 1311:86823): periodo (7 · 30 · 90 días), cuatro KPI, «Cómo terminaron las
 * llamadas», «Herramientas usadas» y las últimas llamadas. Cada fila abre la
 * llamada en Llamadas (`?call=`, hoja con transcripción).
 *
 * Todo sale de `GET /api/crm/voice-agents/[id]/metrics` (agregado en SQL con la
 * sesión). «Probar conversación» y «Editar agente» abren el editor de siempre.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bot, Pencil, Play, Power } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { ChipsOpcion } from "@/components/kit/ChipsOpcion";
import { EmptyState } from "@/components/kit/EmptyState";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { PageHeader } from "@/components/kit/PageHeader";
import { RowActionsMenu } from "@/components/kit/RowActionsMenu";
import { StatCard } from "@/components/kit/StatCard";
import { clasesBoton } from "@/components/kit/botonClases";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { describeError, logError } from "@/lib/utils/errorMessage";
import { fetchJson } from "@/lib/utils/fetchJson";
import {
  normalizarMetricas,
  PERIODOS_METRICAS,
  porcentaje,
  type MetricasAgentes,
  type PeriodoMetricas,
} from "@/lib/services/crm/voiceAgentMetrics";
import { AgentEditorDialog } from "../AgentEditorDialog";
import type { PasoEditor } from "../editor/pasosEditorLogica";
import { partirDuracion } from "../listado/agenteVista";
import { TablaLlamadas } from "./TablaLlamadasAgente";
import { DesenlacesYHerramientas } from "./DesenlacesYHerramientas";

interface AgenteDetalleDatos {
  id: string;
  name: string;
  purpose_type: string;
  engine: string;
  language: string;
  is_active: boolean;
  max_duration_seconds: number | null;
}

export function AgenteDetalle({ agentId }: { agentId: string }) {
  const t = useTranslations("crm.agentesIa.detalle");
  const tx = useTranslations("crm.agentesIa");
  const tl = useTranslations("crm.agentesIa.listado.tarjeta");
  const formato = useFormatter();
  const { formatDateTime } = useFormatDate();
  const [periodo, setPeriodo] = useState<PeriodoMetricas>(30);
  const [datos, setDatos] = useState<(MetricasAgentes & { agente: AgenteDetalleDatos }) | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; noEncontrado: boolean } | null>(null);
  const [editor, setEditor] = useState<PasoEditor | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string; data?: { agente?: AgenteDetalleDatos } }>(
        `/api/crm/voice-agents/${encodeURIComponent(agentId)}/metrics?periodo=${periodo}d`,
        { cache: "no-store" },
      );
      if (!json?.success || !json.data?.agente) throw new Error(json?.error || tx("agentCampaignsPanel.respuestaNoIndicoExito"));
      setDatos({ ...normalizarMetricas(json.data), agente: json.data.agente });
    } catch (err) {
      logError("[AgenteDetalle] cargar", err);
      const mensaje = describeError(err);
      setError({ mensaje, noEncontrado: /404|no encontrado/i.test(mensaje) });
    } finally {
      setCargando(false);
    }
  }, [agentId, periodo, tx]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agente = datos?.agente;
  const cambiarActivo = async () => {
    if (!agente) return;
    setCambiando(true);
    try {
      const json = await fetchJson<{ success?: boolean; error?: string }>(`/api/crm/voice-agents/${agente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !agente.is_active }),
      });
      if (!json?.success) throw new Error(json?.error || tx("agentCampaignsPanel.respuestaNoIndicoExito"));
      toast({ title: agente.is_active ? tx("desactivado") : tx("activado") });
      void cargar();
    } catch (err) {
      logError("[AgenteDetalle] cambiar estado", err);
      toast({ title: tx("errorEstado"), description: describeError(err), variant: "destructive" });
    } finally {
      setCambiando(false);
    }
  };

  const proposito = agente ? (tx.has(`propositos.${agente.purpose_type}`) ? tx(`propositos.${agente.purpose_type}`) : agente.purpose_type) : "";
  const motor = agente ? (tl.has(`motores.${agente.engine}`) ? tl(`motores.${agente.engine}`) : agente.engine) : "";
  const titulo = agente?.name ?? tx("titulo");
  const duracion = (seg: number | null | undefined) => {
    if (seg == null) return "—";
    const { m, s } = partirDuracion(seg);
    return t("duracion", { m, s });
  };

  const acciones = agente ? (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={clasesBoton({ variante: "secundario" })} onClick={() => setEditor("probar")}>
        <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t("probar")}
      </button>
      <button type="button" className={clasesBoton()} onClick={() => setEditor("proposito")}>
        <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t("editar")}
      </button>
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={agente.name}
        acciones={[
          {
            id: "estado",
            etiqueta: agente.is_active ? t("desactivar") : t("activar"),
            icono: Power,
            deshabilitada: cambiando,
            onSelect: () => void cambiarActivo(),
          },
        ]}
      />
    </div>
  ) : undefined;

  const tot = datos?.totales;

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        variante="form"
        volverA="/app/crm/agentes-ia"
        titulo={titulo}
        subtitulo={
          agente
            ? t("subtitulo", { proposito, idioma: agente.language, motor, estado: agente.is_active ? t("estado.activo") : t("estado.inactivo") })
            : cargando
              ? t("cargando")
              : undefined
        }
        cargando={cargando && !agente}
        migas={[
          { etiqueta: tx("migas.crm"), href: "/app/crm" },
          { etiqueta: t("volver"), href: "/app/crm/agentes-ia" },
          { etiqueta: titulo },
        ]}
        acciones={acciones}
        movil={{
          titulo,
          menu: agente
            ? [
                { id: "probar", etiqueta: t("probar"), icono: Play, onSelect: () => setEditor("probar") },
                { id: "editar", etiqueta: t("editar"), icono: Pencil, onSelect: () => setEditor("proposito") },
                { id: "estado", etiqueta: agente.is_active ? t("desactivar") : t("activar"), icono: Power, onSelect: () => void cambiarActivo() },
              ]
            : undefined,
        }}
      />

      {error && !datos ? (
        <EmptyState
          variante={error.noEncontrado ? "empty" : "error"}
          icono={error.noEncontrado ? Bot : undefined}
          titulo={error.noEncontrado ? t("noEncontrado.titulo") : t("error.titulo")}
          descripcion={error.noEncontrado ? t("noEncontrado.descripcion") : error.mensaje}
          onReintentar={error.noEncontrado ? undefined : () => void cargar()}
          accion={error.noEncontrado ? { etiqueta: t("volver"), href: "/app/crm/agentes-ia" } : undefined}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span id="agente-periodo" className="text-sm text-fg-secondary">
              {t("periodo")}
            </span>
            <ChipsOpcion
              aria-labelledby="agente-periodo"
              opciones={PERIODOS_METRICAS.map((n) => ({ valor: String(n) as `${PeriodoMetricas}`, etiqueta: t("periodoDias", { n }) }))}
              valor={String(periodo) as `${PeriodoMetricas}`}
              onValorChange={(v) => setPeriodo(Number(v) as PeriodoMetricas)}
            />
          </div>

          <KpiStrip etiqueta={t("kpi.aria")}>
            <StatCard
              etiqueta={t("kpi.llamadas", { dias: periodo })}
              valor={formato.number(tot?.llamadas ?? 0)}
              detalle={t("kpi.llamadasDetalle")}
              cargando={cargando}
            />
            <StatCard
              etiqueta={t("kpi.contacto")}
              valor={tot && tot.llamadas > 0 ? `${porcentaje(tot.contestadas, tot.llamadas)} %` : "—"}
              detalle={t("kpi.contactoDetalle", { n: tot?.contestadas ?? 0 })}
              tono={tot && tot.contestadas > 0 ? "exito" : "neutro"}
              tendencia={tot && tot.contestadas > 0 ? "sube" : undefined}
              cargando={cargando}
            />
            <StatCard
              etiqueta={t("kpi.duracion")}
              valor={duracion(tot?.duracion_media_segundos)}
              detalle={agente?.max_duration_seconds ? t("kpi.duracionDetalle", { min: Math.round(agente.max_duration_seconds / 60) }) : undefined}
              cargando={cargando}
            />
            <StatCard
              etiqueta={t("kpi.creditos")}
              valor={formato.number(tot?.creditos_ventana ?? 0)}
              detalle={t("kpi.creditosDetalle")}
              cargando={cargando}
            />
          </KpiStrip>

          <DesenlacesYHerramientas datos={datos} cargando={cargando} />

          <TablaLlamadas
            llamadas={datos?.llamadas ?? []}
            cargando={cargando}
            duracion={duracion}
            fecha={(v) => formatDateTime(v)}
          />
        </>
      )}

      {editor && agente && (
        <AgentEditorDialog
          draft={{ mode: "edit", id: agente.id }}
          pasoInicial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
