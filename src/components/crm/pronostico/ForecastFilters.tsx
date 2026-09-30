"use client";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/kit/FormField";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { opcionesTrimestre } from "./forecastVistaLogica";
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
}: Props) {
  const t = useTranslations("crm.pronostico");
  const { getToday } = useFormatDate(null);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <FormField etiqueta={t("trimestre")}>
        <select
          className={CLASE_CAMPO}
          value={period}
          disabled={busy}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(1);
          }}
        >
          {opcionesTrimestre(getToday()).map((o) => (
            <option key={o.period} value={o.period}>
              {t("trimestreEtiqueta", { n: o.n, year: o.year })}
            </option>
          ))}
        </select>
      </FormField>
      <FormField etiqueta={t("equipo")}>
        <select
          className={CLASE_CAMPO}
          value={team}
          disabled={busy}
          onChange={(e) => {
            setTeam(e.target.value);
            setSeller("");
            setPage(1);
          }}
        >
          <option value="">{t("todosEquipos")}</option>
          {data?.teams?.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </FormField>
      {data?.canViewAll && (
        <FormField etiqueta={t("vendedor")}>
          <select
            className={CLASE_CAMPO}
            value={seller}
            disabled={busy}
            onChange={(e) => {
              setSeller(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("todosVendedores")}</option>
            {data.sellers.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.first_name, r.last_name].filter(Boolean).join(" ") ||
                  t("vendedorInactivo")}
              </option>
            ))}
          </select>
        </FormField>
      )}
    </div>
  );
}
