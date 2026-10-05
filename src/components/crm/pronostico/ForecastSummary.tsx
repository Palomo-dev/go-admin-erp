"use client";
import { useTranslations } from "next-intl";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/kit/StatCard";
import { KpiMoneda } from "@/components/crm/kit/KpiMoneda";
import { formatMoneda } from "@/lib/utils/moneda";
import { segmentosCobertura } from "./forecastVistaLogica";
import type { ForecastResponse } from "./useForecastData";
export function ForecastSummary({
  data,
  loading,
  periodLabel,
  showCoverage = true,
}: {
  data: ForecastResponse | null;
  loading: boolean;
  periodLabel: string;
  showCoverage?: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  if (!data)
    return (
      <div className="hidden space-y-4 lg:block">
        <KpiStrip columnas={5}>
          {["cuota", "compromiso", "mejorCaso", "ponderado", "ganado"].map(
            (key) => (
              <StatCard
                key={key}
                etiqueta={t(key)}
                valor="—"
                cargando
                varianteCarga="compacta"
              />
            ),
          )}
        </KpiStrip>
        <section
          aria-busy="true"
          aria-label={t("cobertura")}
          className="space-y-2 rounded-xl border border-line bg-surface p-4"
        >
          <h2 className="text-base font-semibold leading-[22px] text-fg">
            {t("cobertura")}
          </h2>
          <Skeleton className="h-4 w-full bg-pressed" />
          <Skeleton className="h-4 w-2/3 bg-pressed" />
        </section>
      </div>
    );
  const coverage = segmentosCobertura(data.summary);
  const quota = data.summary.quota.total;
  const pct = (value: number) =>
    quota > 0 ? Math.round((value / quota) * 100) : null;
  const labels = ["cuota", "compromiso", "mejorCaso", "ponderado", "ganado"];
  const keys = ["quota", "commit", "bestCase", "weighted", "won"] as const;
  const color = [
    "[&>p:first-of-type]:text-fg",
    "[&>p:first-of-type]:text-brand-deep",
    "[&>p:first-of-type]:text-brand",
    "[&>p:first-of-type]:text-fg-secondary",
    "[&>p:first-of-type]:text-success-text",
  ];
  return (
    <>
      <div className="hidden space-y-4 lg:block">
        <KpiStrip columnas={5}>
          {keys.map((key, i) => (
            <KpiMoneda
              key={key}
              etiqueta={t(labels[i])}
              resumen={data.summary[key]}
              monedaBase={data.moneda}
              fechaContable={
                data.summary[key].convertidas.length ? data.date : undefined
              }
              detalle={
                i === 0
                  ? t("detalleCuota")
                  : coverage
                    ? t(
                        [
                          "",
                          "detalleCompromiso",
                          "detalleMejorCaso",
                          "detallePonderado",
                          "detalleGanado",
                        ][i],
                        { n: pct(data.summary[key].total)! },
                      )
                    : undefined
              }
              cargando={loading}
              className={`gap-1 [&>div>h3]:text-xs [&>div>h3]:leading-4 [&>div:first-child>div]:hidden [&>p:first-of-type]:text-xl [&>p:first-of-type]:leading-7 ${color[i]} [&>p:last-of-type]:text-fg-secondary`}
            />
          ))}
        </KpiStrip>
        {coverage && showCoverage && (
          <section
            className="space-y-2 rounded-xl border border-line bg-surface p-4"
            aria-label={t("cobertura")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold leading-[22px] text-fg">
                {t("cobertura")}
              </h2>
              <div className="flex items-center gap-4 text-xs leading-4 text-fg-secondary">
                {["ganado", "compromiso", "mejorCaso"].map((key, i) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={`size-2.5 rounded-sm ${["bg-success", "bg-brand-deep", "bg-line-brand"][i]}`}
                    />
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>
            <div
              className="flex h-4 overflow-hidden rounded-md bg-subtle"
              role="img"
              aria-label={t("porcentajeCobertura", {
                n: pct(data.summary.commit.total)!,
              })}
            >
              <span
                className="bg-success"
                style={{ width: `${coverage.won}%` }}
              />
              <span
                className="bg-brand-deep"
                style={{ width: `${coverage.commit}%` }}
              />
              <span
                className="bg-line-brand"
                style={{ width: `${coverage.bestCase}%` }}
              />
            </div>
            <p className="text-xs leading-4 text-fg-secondary">
              {t(
                data.summary.commit.total < quota
                  ? "faltaCuota"
                  : "cuotaCubierta",
                {
                  monto: formatMoneda(
                    Math.max(0, quota - data.summary.commit.total),
                    data.moneda,
                  ),
                  n: pct(data.summary.bestCase.total)!,
                },
              )}
            </p>
          </section>
        )}
      </div>
      <section
        className="space-y-2 rounded-xl border border-line bg-surface p-4 lg:hidden"
        aria-label={t("miPronostico")}
      >
        <p className="text-xs leading-4 text-fg-secondary">
          {t("resumenMovil", {
            periodo: periodLabel,
            monto: formatMoneda(quota, data.moneda),
          })}
        </p>
        <dl className="space-y-1.5">
          {(["won", "commit", "bestCase"] as const).map((key, i) => (
            <div
              className="flex items-baseline justify-between gap-2"
              key={key}
            >
              <dt className="text-[13px] leading-[18px] text-fg-secondary">
                {t(["ganado", "compromiso", "mejorCaso"][i])}
              </dt>
              <dd
                className={`text-lg font-semibold leading-6 tabular-nums ${["text-success-text", "text-brand-deep", "text-brand"][i]}`}
              >
                {formatMoneda(data.summary[key].total, data.moneda)}
                {data.summary[key].sinTasa.length > 0 && (
                  <span title={t("parcial")}> *</span>
                )}
              </dd>
            </div>
          ))}
          {coverage && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[13px] leading-[18px] text-fg-secondary">
                {t("cobertura")}
              </dt>
              <dd className="text-xs font-medium tabular-nums text-fg">
                {pct(data.summary.commit.total)} %
              </dd>
            </div>
          )}
        </dl>
        {coverage && (
          <div
            className="h-2 overflow-hidden rounded-full bg-subtle"
            role="img"
            aria-label={t("porcentajeCobertura", {
              n: pct(data.summary.commit.total)!,
            })}
          >
            <div
              className={
                pct(data.summary.commit.total)! >= 100
                  ? "h-full bg-success"
                  : "h-full bg-warning"
              }
              style={{
                width: `${Math.max(0, Math.min(100, pct(data.summary.commit.total)!))}%`,
              }}
            />
          </div>
        )}
      </section>
    </>
  );
}
