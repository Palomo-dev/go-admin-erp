"use client";
import { useTranslations } from "next-intl";
import { Phone, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { DataTable, type ColumnaTabla } from "@/components/kit/DataTable";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { clasesBoton } from "@/components/kit/botonClases";
import { useMonedaOrganizacion } from "@/lib/hooks/useOrgCurrency";
import type { HealthListRow } from "@/lib/services/crm/healthReadService";
import { HealthGauge } from "./HealthGauge";
import { HealthAlerts } from "./HealthAlerts";

export function HealthRiskTable({
  rows,
  loading,
  onSelect,
  onCall,
  onClearFilter,
}: {
  rows: HealthListRow[];
  loading: boolean;
  onSelect: (id: string) => void;
  onCall: (row: HealthListRow) => void;
  onClearFilter: () => void;
}) {
  const t = useTranslations("crm.salud");
  const { formatear } = useMonedaOrganizacion();
  const badge = (row: HealthListRow, mobile = false) => (
    <StatusBadge
      estado={row.band}
      tipografia="figma"
      tono={
        row.band === "green"
          ? "exito"
          : row.band === "yellow"
            ? "advertencia"
            : "peligro"
      }
      etiqueta={
        mobile
          ? `${row.score} · ${t(`bands.${row.band}`)}`
          : t(`bands.${row.band}`)
      }
    />
  );
  const call = (row: HealthListRow) => (
    <button
      type="button"
      className={clasesBoton({
        patron: "button",
        variante: "secundario",
        tamano: "sm",
      })}
      onClick={(e) => {
        e.stopPropagation();
        onCall(row);
      }}
    >
      <Phone aria-hidden className="size-4" />
      {t("call")}
    </button>
  );
  const columns: ColumnaTabla<HealthListRow>[] = [
    {
      id: "customer",
      encabezado: t("customer"),
      celda: (row) => (
        <div>
          <p className="font-medium">{row.customer_name || t("unnamed")}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {row.email ?? row.phone ?? "—"}
          </p>
        </div>
      ),
    },
    {
      id: "score",
      encabezado: t("score"),
      celda: (row) => (
        <span className="inline-flex items-center gap-2">
          <HealthGauge
            score={row.score}
            band={row.band}
            size="inline"
            showLabel={false}
          />
          <strong className="tabular-nums">{row.score}</strong>
          {badge(row)}
        </span>
      ),
      ancho: 180,
    },
    {
      id: "delta",
      encabezado: t("change"),
      celda: (row) =>
        row.previous_score === null ? (
          t("noData")
        ) : (
          <span
            className={`inline-flex items-center gap-1 tabular-nums ${row.score < row.previous_score ? "text-danger-text" : row.score > row.previous_score ? "text-success-text" : "text-fg-muted"}`}
          >
            {row.score < row.previous_score ? (
              <ArrowDownRight aria-hidden className="size-3.5" />
            ) : row.score > row.previous_score ? (
              <ArrowUpRight aria-hidden className="size-3.5" />
            ) : (
              <Minus aria-hidden className="size-3.5" />
            )}
            {row.score - row.previous_score > 0 ? "+" : ""}
            {row.score - row.previous_score}
          </span>
        ),
      ancho: 100,
    },
    {
      id: "why",
      encabezado: t("why"),
      celda: (row) => (
        <HealthAlerts alerts={row.alerts ?? []} raw={row.raw} compact />
      ),
      ancho: 280,
    },
    {
      id: "revenue",
      encabezado: t("revenue"),
      variante: "importe",
      celda: (row) => formatear(row.raw?.revenue_12m ?? 0),
      ancho: 145,
    },
    { id: "action", encabezado: t("suggestedAction"), celda: call, ancho: 150 },
  ];
  return (
    <DataTable
      columnas={columns}
      filas={rows}
      obtenerId={(row) => row.customer_id}
      etiqueta={t("monitored")}
      filasEsqueleto={6}
      mostrarCabeceraCargando={false}
      altoFilaEsqueleto={48}
      varianteEsqueleto="figma"
      estado={loading ? "cargando" : rows.length ? "listo" : "sinResultados"}
      onFilaClick={(row) => onSelect(row.customer_id)}
      onLimpiarFiltros={onClearFilter}
      sinResultados={{
        titulo: t("filterEmpty"),
        descripcion: t("filterEmptyDescription"),
      }}
      tarjetaMovil={(row) => (
        <article className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onSelect(row.customer_id)}
          >
            <span className="font-medium text-fg">{row.customer_name}</span>
            {badge(row, true)}
          </button>
          <HealthAlerts alerts={row.alerts ?? []} raw={row.raw} compact />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-secondary">
              {t("revenueValue", {
                revenue: formatear(row.raw?.revenue_12m ?? 0),
              })}
            </span>
            {call(row)}
          </div>
        </article>
      )}
    />
  );
}
