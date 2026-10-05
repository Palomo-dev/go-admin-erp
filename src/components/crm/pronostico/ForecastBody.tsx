"use client";
import { useTranslations } from "next-intl";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/kit/EmptyState";
import { DataTable } from "@/components/kit/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import type { ForecastCategory } from "@/lib/services/crm/forecastLogica";
import { ForecastSummary } from "./ForecastSummary";
import { ForecastMonths } from "./ForecastMonths";
import {
  ForecastSellers,
  ForecastOpportunities,
  type ForecastRow,
} from "./ForecastTables";
import type { ForecastResponse } from "./useForecastData";
export function ForecastBody({
  data,
  loading,
  error,
  forbidden,
  refresh,
  busy,
  seller,
  view,
  page,
  setPage,
  setSeller,
  category,
  setAdjust,
  periodLabel,
  waitingForPersonal,
}: {
  data: ForecastResponse | null;
  loading: boolean;
  error: boolean;
  forbidden: boolean;
  refresh: () => void;
  busy: boolean;
  seller: string;
  view: "sellers" | "months";
  page: number;
  setPage: (value: number) => void;
  setSeller: (value: string) => void;
  category: (
    id: string,
    category: ForecastCategory,
    updatedAt: string | null,
  ) => void;
  setAdjust: (row: ForecastRow) => void;
  periodLabel: string;
  waitingForPersonal: boolean;
}) {
  const t = useTranslations("crm.pronostico");
  const noQuota = Boolean(data && !data.summary.quota.cantidad);
  return (
    <>
      {" "}
      {error ? (
        <EmptyState
          variante={forbidden ? "forbidden" : "error"}
          titulo={t(forbidden ? "sinPermiso" : "error")}
          onReintentar={refresh}
        />
      ) : (
        <>
          {!noQuota && (
            <ForecastSummary
              data={waitingForPersonal ? null : data}
              loading={loading || Boolean(waitingForPersonal)}
              periodLabel={periodLabel}
              showCoverage={!seller && data?.canViewAll !== false}
            />
          )}
          {loading || waitingForPersonal ? (
            <DataTable
              columnas={[
                { id: "seller", encabezado: t("vendedor"), celda: () => null },
                ...[
                  "cuota",
                  "ganado",
                  "compromiso",
                  "mejorCaso",
                  "ponderado",
                  "cobertura",
                ].map((key) => ({
                  id: key,
                  encabezado: t(key),
                  celda: () => null,
                })),
              ]}
              filas={[]}
              obtenerId={() => "loading"}
              etiqueta={t("titulo")}
              estado="cargando"
              filasEsqueleto={5}
              mostrarCabeceraCargando={false}
              altoFilaEsqueleto={48}
              varianteEsqueleto="figma"
              tarjetaMovil={() => <Skeleton className="h-24" />}
            />
          ) : (
            data &&
            (noQuota ? (
              <div className="rounded-xl border border-line bg-surface">
                <EmptyState
                  icono={TrendingUp}
                  titulo={t("sinCuotasTitulo")}
                  descripcion={t("sinCuotasDetalle")}
                  accion={{
                    etiqueta: t("definirCuotas"),
                    href: "/app/crm/equipo",
                  }}
                  accionPrimaria
                  className="min-h-[410px]"
                />
              </div>
            ) : view === "months" && data.canViewAll ? (
              <ForecastMonths data={data} />
            ) : seller || !data.canViewAll ? (
              <ForecastOpportunities
                data={data}
                page={page}
                onPage={setPage}
                onCategory={category}
                busy={busy}
              />
            ) : (
              <ForecastSellers
                data={data}
                onSeller={(id) => {
                  if (busy) return;
                  setSeller(id);
                  setPage(1);
                }}
                onAdjust={setAdjust}
                busy={busy}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
