"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { KpiMoneda } from "@/components/crm/kit/KpiMoneda";
import { Skeleton } from "@/components/ui/skeleton";
import { segmentosCobertura } from "./forecastVistaLogica";
import type { ForecastResponse } from "./useForecastData";
export function ForecastSummary({
  data,
  loading,
}: {
  data: ForecastResponse | null;
  loading: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  if (!data)
    return (
      <KpiStrip columnas={5}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </KpiStrip>
    );
  const coverage = segmentosCobertura(data.summary);
  return (
    <div className="space-y-4">
      <KpiStrip columnas={5}>
        {(["quota", "commit", "bestCase", "weighted", "won"] as const).map(
          (key, i) => (
            <KpiMoneda
              key={key}
              etiqueta={t(
                ["cuota", "compromiso", "mejorCaso", "ponderado", "ganado"][i],
              )}
              resumen={data.summary[key]}
              monedaBase={data.moneda}
              fechaContable={data.date}
              cargando={loading}
            />
          ),
        )}
      </KpiStrip>
      {!data.summary.quota.cantidad && (
        <p className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
          {t("sinCuotas")}{" "}
          <Link href="/app/crm/equipo" className="font-medium underline">
            {t("definirCuotas")}
          </Link>
        </p>
      )}
      {coverage && (
        <section
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          aria-label={t("cobertura")}
        >
          <div className="flex flex-wrap justify-between gap-2 text-sm text-fg">
            <strong>{t("cobertura")}</strong>
            <span>
              {["ganado", "compromiso", "mejorCaso"]
                .map((k) => t(k))
                .join(" · ")}
            </span>
          </div>
          <div
            className="flex h-3 overflow-hidden rounded bg-subtle"
            role="img"
            aria-label={t("porcentajeCobertura", {
              n: Math.round(
                (data.summary.commit.total / data.summary.quota.total) * 100,
              ),
            })}
          >
            <span
              className="bg-success-text"
              style={{ width: `${coverage.won}%` }}
            />
            <span
              className="bg-brand-action"
              style={{ width: `${coverage.commit}%` }}
            />
            <span
              className="bg-brand-tint"
              style={{ width: `${coverage.bestCase}%` }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
