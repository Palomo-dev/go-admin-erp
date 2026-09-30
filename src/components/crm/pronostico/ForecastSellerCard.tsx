"use client";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { clasesBoton } from "@/components/kit/botonClases";
import { formatMoneda } from "@/lib/utils/moneda";
import type { ForecastResponse } from "./useForecastData";
import type { ForecastRow } from "./ForecastTables";
export function ForecastSellerCard({
  row,
  data,
  onSeller,
  onAdjust,
}: {
  row: ForecastRow;
  data: ForecastResponse;
  onSeller: (id: string) => void;
  onAdjust: (row: ForecastRow) => void;
}) {
  const t = useTranslations("crm.pronostico");
  const name =
    [row.name?.first_name, row.name?.last_name].filter(Boolean).join(" ") ||
    t(row.userId ? "vendedorInactivo" : "sinVendedor");
  return (
    <article className="rounded-xl border border-line bg-surface p-4 text-fg">
      <div className="flex items-center justify-between gap-3">
        {row.userId && row.name ? (
          <button
            className="font-medium text-link hover:underline focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => onSeller(row.userId!)}
          >
            {name}
          </button>
        ) : (
          <span className="font-medium">{name}</span>
        )}
        {data.canAdjust && row.userId && row.name && (
          <button
            className={clasesBoton({ variante: "fantasma", tamano: "sm" })}
            onClick={() => onAdjust(row)}
            aria-label={t("ajustarVendedor", { nombre: name })}
            disabled={row.commit.sinTasa.length > 0}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {t("ajustar")}
          </button>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {(
          [
            ["quota", "cuota"],
            ["won", "ganado"],
            ["commit", "compromiso"],
            ["bestCase", "mejorCaso"],
            ["weighted", "ponderado"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt className="text-xs text-fg-muted">{t(label)}</dt>
            <dd className="break-words font-medium tabular-nums">
              {formatMoneda(row[key].total, data.moneda)}
              {row[key].sinTasa.length > 0 && (
                <span title={t("parcial")} className="ml-1 text-warning-text">
                  *
                </span>
              )}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-fg-muted">{t("cobertura")}</dt>
          <dd className="font-medium tabular-nums">
            {row.coverage === null ? "—" : `${Math.round(row.coverage * 100)}%`}
          </dd>
        </div>
      </dl>
      {row.latestAdjustment && (
        <p className="mt-3 text-xs text-fg-muted">
          {t("ajustado", {
            monto: formatMoneda(row.adjustment.total, data.moneda),
          })}
        </p>
      )}
    </article>
  );
}
