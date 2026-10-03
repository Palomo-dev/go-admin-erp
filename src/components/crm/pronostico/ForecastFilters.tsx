"use client";
import { useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { opcionesTrimestre } from "./forecastVistaLogica";
import { ForecastSelect } from "./ForecastSelect";
import type { ForecastResponse } from "./useForecastData";
interface Props {
  data: ForecastResponse | null;
  period: string;
  team: string;
  seller: string;
  busy: boolean;
  setPeriod: (value: string) => void;
  setTeam: (value: string) => void;
  setSeller: (value: string) => void;
  setPage: (value: number) => void;
  view: "sellers" | "months";
  onView: (value: "sellers" | "months") => void;
}
export function ForecastFilters({
  data,
  period,
  team,
  seller,
  busy,
  setPeriod,
  setTeam,
  setSeller,
  setPage,
  view,
  onView,
}: Props) {
  const t = useTranslations("crm.pronostico");
  const { getToday } = useFormatDate(null);
  return (
    <div className="hidden flex-wrap items-center gap-2 lg:flex">
      <div className="w-80 max-w-full">
        <ForecastSelect
          label={t("trimestre")}
          value={period}
          disabled={busy}
          onChange={(next) => {
            setPeriod(next);
            setPage(1);
          }}
          options={opcionesTrimestre(getToday()).map((o) => ({
            value: o.period,
            label: t("trimestreEtiqueta", { n: o.n, year: o.year }),
          }))}
        />
      </div>
      <div className="w-80 max-w-full">
        <ForecastSelect
          label={t("equipo")}
          value={team}
          disabled={busy}
          onChange={(next) => {
            setTeam(next);
            setSeller("");
            setPage(1);
          }}
          options={[
            { value: "", label: t("todosEquipos") },
            ...(data?.teams ?? []).map((row) => ({
              value: row.id,
              label: row.name,
            })),
          ]}
        />
      </div>
      {data?.canViewAll && (
        <SegmentedControl
          etiqueta={t("agrupacion")}
          valor={view}
          onValorChange={onView}
          opciones={[
            { valor: "sellers", etiqueta: t("porVendedor") },
            { valor: "months", etiqueta: t("porMes") },
          ]}
        />
      )}
      {data?.canViewAll && seller && (
        <div className="w-64 max-w-full">
          <ForecastSelect
            label={t("vendedor")}
            value={seller}
            disabled={busy}
            onChange={(next) => {
              setSeller(next);
              setPage(1);
            }}
            options={[
              { value: "", label: t("todosVendedores") },
              ...data.sellers.map((row) => ({
                value: row.id,
                label:
                  [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                  t("vendedorInactivo"),
              })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
