"use client";
import { useLocale, useTranslations } from "next-intl";
import { DataTable, type ColumnaTabla } from "@/components/kit/DataTable";
import { Badge } from "@/components/ui/badge";
import { localeIntl } from "@/components/kit/idioma";
import { formatDateInTz, plainDateToInstant } from "@/lib/utils/dateDisplay";
import { formatMoneda } from "@/lib/utils/moneda";
import type { ForecastResponse } from "./useForecastData";

export function ForecastMonths({ data }: { data: ForecastResponse }) {
  const t = useTranslations("crm.pronostico");
  const locale = useLocale();
  type Row = ForecastResponse["monthly"]["months"][number];
  const month = (row: Row) =>
    formatDateInTz(plainDateToInstant(`${row.month}-01`, "UTC"), "UTC", {
      locale: localeIntl(locale),
      month: "long",
      year: "numeric",
    });
  const columns: ColumnaTabla<Row>[] = [
    {
      id: "month",
      encabezado: t("mes"),
      celda: (row) => (
        <span className="font-medium capitalize">{month(row)}</span>
      ),
    },
    ...(["quota", "won", "commit", "bestCase", "weighted"] as const).map(
      (key, i) => ({
        id: key,
        encabezado: t(
          ["cuota", "ganado", "compromiso", "mejorCaso", "ponderado"][i],
        ),
        celda: (row: Row) => (
          <span className="whitespace-nowrap text-[13px] tabular-nums">
            {key === "quota" && !row.summary.quota.cantidad
              ? "—"
              : formatMoneda(row.summary[key].total, data.moneda)}
            {row.summary[key].sinTasa.length > 0 && (
              <span title={t("parcial")} className="ml-1 text-warning-text">
                *
              </span>
            )}
          </span>
        ),
      }),
    ),
    {
      id: "coverage",
      encabezado: t("coberturaCorta"),
      celda: (row) => {
        const { quota, commit } = row.summary;
        if (!quota.total || quota.sinTasa.length || commit.sinTasa.length)
          return "—";
        const coverage = commit.total / quota.total;
        return (
          <Badge
            tono={
              coverage >= 1
                ? "exito"
                : coverage >= 0.7
                  ? "advertencia"
                  : "peligro"
            }
            tamano="sm"
          >
            {Math.round(coverage * 100)} %
          </Badge>
        );
      },
    },
  ];
  return (
    <div className="space-y-3">
      <DataTable
        columnas={columns}
        filas={data.monthly.months}
        obtenerId={(row) => row.month}
        etiqueta={t("porMes")}
        className="[&_thead_th]:py-2 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:leading-4"
      />
      <p className="rounded-lg bg-subtle px-3 py-2 text-xs leading-4 text-fg-secondary">
        {t("cuotasMensualesNota")}
      </p>
      {data.monthly.quarterlyAdjustment.grupos.length > 0 && (
        <p className="rounded-lg bg-info-subtle px-3 py-2 text-xs leading-4 text-info-text">
          {t("ajustesTrimestre", {
            monto: formatMoneda(
              data.monthly.quarterlyAdjustment.total,
              data.moneda,
            ),
          })}
          {data.monthly.quarterlyAdjustment.sinTasa.length > 0 && (
            <> {t("parcial")}</>
          )}
        </p>
      )}
    </div>
  );
}
