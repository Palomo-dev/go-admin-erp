"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { DataTable, type ColumnaTabla } from "@/components/kit/DataTable";
import { AvatarIniciales } from "@/components/kit/AvatarIniciales";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/kit/Pagination";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatMoneda } from "@/lib/utils/moneda";
import { formatearEn } from "@/components/crm/kit/monedaCrm";
import {
  FORECAST_CATEGORIES,
  type ForecastCategory,
} from "@/lib/services/crm/forecastLogica";
import type { ForecastResponse } from "./useForecastData";
import { ForecastSellerCard } from "./ForecastSellerCard";
import { ForecastSelect } from "./ForecastSelect";
export type ForecastRow = ForecastResponse["rows"][number];
export function ForecastSellers({
  data,
  onSeller,
  onAdjust,
  busy = false,
}: {
  data: ForecastResponse;
  onSeller: (id: string) => void;
  onAdjust: (row: ForecastRow) => void;
  busy?: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  const name = (row: ForecastRow) =>
    [row.name?.first_name, row.name?.last_name].filter(Boolean).join(" ") ||
    t(row.userId ? "vendedorInactivo" : "sinVendedor");
  const columns: ColumnaTabla<ForecastRow>[] = [
    {
      id: "seller",
      encabezado: t("vendedor"),
      celda: (row) => (
        <div className="flex items-center gap-2">
          <AvatarIniciales
            nombre={name(row)}
            className="bg-brand font-medium"
          />
          {row.userId && row.name ? (
            <button
              disabled={busy}
              className="text-left text-sm font-medium leading-5 text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              onClick={() => onSeller(row.userId!)}
            >
              {name(row)}
            </button>
          ) : (
            name(row)
          )}
        </div>
      ),
    },
    ...(["quota", "won", "commit", "bestCase", "weighted"] as const).map(
      (key, i) => ({
        id: key,
        encabezado: t(
          ["cuota", "ganado", "compromiso", "mejorCaso", "ponderado"][i],
        ),
        ancho: key === "commit" || key === "bestCase" ? 150 : 140,
        celda: (row: ForecastRow) => (
          <div
            className={
              key === "commit"
                ? "whitespace-nowrap text-sm font-medium leading-5 tabular-nums text-fg"
                : "whitespace-nowrap text-[13px] leading-[18px] tabular-nums text-fg-secondary"
            }
          >
            {formatMoneda(row[key].total, data.moneda)}
            {row[key].sinTasa.length > 0 && (
              <span className="ml-1 text-warning-text" title={t("parcial")}>
                *
              </span>
            )}
            {key === "commit" && row.latestAdjustment && (
              <span className="block text-xs leading-4 text-fg-muted">
                {t("ajustado", {
                  monto: formatMoneda(row.adjustment.total, data.moneda),
                })}
              </span>
            )}
          </div>
        ),
      }),
    ),
    {
      id: "coverage",
      encabezado: t("coberturaCorta"),
      ancho: 110,
      celda: (row) =>
        row.coverage === null ? (
          "—"
        ) : (
          <Badge
            tono={
              row.coverage >= 1
                ? "exito"
                : row.coverage >= 0.7
                  ? "advertencia"
                  : "peligro"
            }
            tamano="sm"
          >
            {Math.round(row.coverage * 100)} %
          </Badge>
        ),
    },
  ];
  return (
    <DataTable
      columnas={columns}
      filas={data.rows}
      obtenerId={(row) => row.userId ?? "unassigned"}
      etiqueta={t("porVendedor")}
      onFilaClick={(row) => {
        if (!busy && row.userId && row.name) onSeller(row.userId);
      }}
      etiquetaFila={name}
      accionesRapidas={
        data.canAdjust
          ? (row) =>
              row.userId && row.name ? (
                <button
                  className={clasesBoton({
                    variante: "fantasma",
                    tamano: "sm",
                  })}
                  onClick={() => onAdjust(row)}
                  aria-label={t("ajustarVendedor", { nombre: name(row) })}
                  disabled={busy || row.commit.sinTasa.length > 0}
                >
                  <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
                </button>
              ) : null
          : undefined
      }
      tarjetaMovil={(row) => (
        <ForecastSellerCard
          row={row}
          data={data}
          onSeller={onSeller}
          onAdjust={onAdjust}
        />
      )}
      vacio={{
        titulo: t("vacio"),
        descripcion: t("vacioDetalle"),
        accion: { etiqueta: t("crear"), href: "/app/crm/oportunidades" },
      }}
      className="[&_thead_th]:py-2 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:leading-4 [&_tbody_td]:py-2.5"
    />
  );
}
export function ForecastOpportunities({
  data,
  page,
  onPage,
  onCategory,
  busy,
}: {
  data: ForecastResponse;
  page: number;
  onPage: (n: number) => void;
  onCategory: (
    id: string,
    category: ForecastCategory,
    updatedAt: string | null,
  ) => void;
  busy: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  const { formatPlain } = useFormatDate(null);
  const select = (o: ForecastResponse["opportunities"][number]) => (
    <ForecastSelect
      compact
      label={t("categoriaDe", { nombre: o.name })}
      value={o.category}
      disabled={busy || !o.canEdit}
      onChange={(value) =>
        onCategory(o.id, value as ForecastCategory, o.updated_at)
      }
      options={FORECAST_CATEGORIES.map((value) => ({
        value,
        label: t(`categorias.${value}`),
      }))}
    />
  );
  const amount = (o: ForecastResponse["opportunities"][number]) =>
    formatearEn(o.amount, o.currency ?? data.moneda.code, data.moneda);
  if (!data.opportunityCount)
    return (
      <EmptyState
        titulo={t("sinOportunidades")}
        accion={{ etiqueta: t("crear"), href: "/app/crm/oportunidades" }}
      />
    );
  const columns: ColumnaTabla<ForecastResponse["opportunities"][number]>[] = [
    {
      id: "name",
      encabezado: t("oportunidad"),
      celda: (o) => (
        <Link
          href={`/app/crm/oportunidades/${o.id}`}
          className="text-sm font-medium leading-5 text-fg hover:underline"
        >
          {o.name}
        </Link>
      ),
    },
    {
      id: "stage",
      encabezado: t("etapa"),
      ancho: 170,
      celda: (o) => (
        <span className="text-[13px] leading-[18px] text-fg-secondary">
          {o.stage_name}
        </span>
      ),
    },
    {
      id: "close",
      encabezado: t("cierre"),
      ancho: 140,
      celda: (o) => (
        <span className="whitespace-nowrap text-[13px] leading-[18px] text-fg-secondary">
          {o.expected_close_date ? formatPlain(o.expected_close_date) : "—"}
        </span>
      ),
    },
    {
      id: "amount",
      encabezado: t("monto"),
      ancho: 150,
      celda: (o) => (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {amount(o)}
        </span>
      ),
    },
    {
      id: "probability",
      encabezado: t("probabilidad"),
      ancho: 110,
      celda: (o) => (
        <span className="text-[13px] text-fg-secondary">
          {o.probability === null ? "—" : `${o.probability} %`}
        </span>
      ),
    },
    { id: "category", encabezado: t("categoria"), ancho: 275, celda: select },
  ];
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium leading-5 text-fg lg:hidden">
        {t("clasificaOportunidades")}
      </h2>
      <DataTable
        columnas={columns}
        filas={data.opportunities}
        obtenerId={(o) => o.id}
        etiqueta={t("clasificaOportunidades")}
        tarjetaMovil={(o) => (
          <article className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-fg">
            <Link
              href={`/app/crm/oportunidades/${o.id}`}
              className="block text-sm font-medium leading-5 hover:underline"
            >
              {o.name}
            </Link>
            <p className="text-xs leading-4 text-fg-secondary">
              {amount(o)}
              {o.expected_close_date
                ? ` · ${formatPlain(o.expected_close_date).slice(0, 5)}`
                : ""}
            </p>
            {select(o)}
          </article>
        )}
        pie={
          data.opportunityCount > 25 ? (
            <Pagination
              pagina={page}
              tamano={25}
              total={data.opportunityCount}
              onPaginaChange={onPage}
              densidad="compacta"
            />
          ) : undefined
        }
        className="[&_thead_th]:py-2 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:leading-4 [&_tbody_td]:py-2.5"
      />
      {data.opportunities.some(
        (opportunity) => opportunity.category === "omitted",
      ) && (
        <p className="rounded-lg bg-warning-subtle px-3 py-2 text-xs leading-4 text-warning-text">
          {t("omitidasNota", {
            n: data.opportunities.filter(
              (opportunity) => opportunity.category === "omitted",
            ).length,
          })}
        </p>
      )}
    </div>
  );
}
