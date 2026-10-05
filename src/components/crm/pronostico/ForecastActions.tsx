"use client";
import { useTranslations } from "next-intl";
import { Download, History, MoreHorizontal, RefreshCw } from "lucide-react";
import { clasesBoton } from "@/components/kit/botonClases";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { filasACsv } from "@/lib/utils/csv";
import { opcionesTrimestre } from "./forecastVistaLogica";
import type { ForecastResponse } from "./useForecastData";
export interface ForecastActionsProps {
  data: ForecastResponse | null;
  loading: boolean;
  busy: boolean;
  period: string;
  refresh: () => void;
  setPeriod: (period: string) => void;
  setPage: (page: number) => void;
  onHistory: () => void;
  onAnalytics?: () => void;
}
export function useForecastExport(
  data: ForecastResponse | null,
  period: string,
) {
  const t = useTranslations("crm.pronostico");
  return () => {
    if (!data) return;
    const csv = filasACsv(
      [
        t("vendedor"),
        t("cuota"),
        t("ganado"),
        t("compromiso"),
        t("mejorCaso"),
        t("ponderado"),
        t("moneda"),
      ],
      data.rows.map((r) => [
        [r.name?.first_name, r.name?.last_name].filter(Boolean).join(" ") ||
          t("sinVendedor"),
        r.quota.total,
        r.won.total,
        r.commit.total,
        r.bestCase.total,
        r.weighted.total,
        data.moneda.code,
      ]),
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `forecast-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
}
export function ForecastHeaderActions(props: ForecastActionsProps) {
  const { data, loading, busy, period, onHistory } = props;
  const t = useTranslations("crm.pronostico");
  const exportData = useForecastExport(data, period);
  return (
    <>
      <button
        className={clasesBoton({ variante: "secundario" })}
        onClick={() => onHistory()}
        disabled={!data || busy}
      >
        <History className="size-4" aria-hidden="true" />
        {t("historial")}
      </button>
      <button
        className={clasesBoton({ variante: "secundario" })}
        onClick={exportData}
        disabled={!data || loading}
      >
        <Download className="size-4" aria-hidden="true" />
        {t("exportar")}
      </button>
      <ForecastMenu {...props} />
    </>
  );
}
export function ForecastMenu(props: ForecastActionsProps) {
  const {
    data,
    loading,
    busy,
    period,
    refresh,
    setPeriod,
    setPage,
    onHistory,
    onAnalytics,
  } = props;
  const t = useTranslations("crm.pronostico");
  const { getToday } = useFormatDate(null);
  const exportData = useForecastExport(data, period);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={clasesBoton({
            variante: "secundario",
            className: "size-10 p-0",
          })}
          aria-label={t("vistas")}
        >
          <MoreHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-line bg-surface text-fg"
      >
        <DropdownMenuItem onSelect={refresh} disabled={busy || loading}>
          <RefreshCw className="mr-2 size-4" aria-hidden />
          {t("actualizar")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="lg:hidden"
          onSelect={() => onHistory()}
          disabled={!data || busy}
        >
          {t("historial")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="lg:hidden"
          onSelect={exportData}
          disabled={!data || loading}
        >
          {t("exportar")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="lg:hidden" disabled={busy}>
            {t("trimestre")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="border-line bg-surface text-fg">
            {opcionesTrimestre(getToday()).map((option) => (
              <DropdownMenuItem
                key={option.period}
                onSelect={() => {
                  setPeriod(option.period);
                  setPage(1);
                }}
              >
                {t("trimestreEtiqueta", { n: option.n, year: option.year })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onAnalytics && (
          <DropdownMenuItem onSelect={onAnalytics} disabled={busy}>
            {t("analitica")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
