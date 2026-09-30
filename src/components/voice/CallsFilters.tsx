"use client";
import { useTranslations } from "next-intl";
import { SearchInput } from "@/components/kit/SearchInput";
import { FilterPanel } from "@/components/kit/FilterPanel";
import { FormField } from "@/components/kit/FormField";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { CALL_MODES, CALL_DIRECTIONS } from "@/lib/crm/enums";
import { DISPOSITION_OUTCOMES } from "@/lib/services/crm/callDispositionService";
import { EMPTY_FILTERS, type CallsTableFilters } from "./callsListadoLogica";

export function CallsFilters({
  filters,
  onChange,
}: {
  filters: CallsTableFilters;
  onChange: (value: CallsTableFilters) => void;
}) {
  const t = useTranslations("crm.llamadas");
  const set = <K extends keyof CallsTableFilters>(
    key: K,
    value: CallsTableFilters[K],
  ) => onChange({ ...filters, [key]: value });
  const count = [
    filters.direction,
    filters.mode,
    filters.outcome,
    filters.mine,
    filters.hasRecording,
    filters.fromDate,
    filters.toDate,
  ].filter(Boolean).length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput
        value={filters.q}
        onChange={(v) => set("q", v)}
        placeholder={t("buscar")}
        etiqueta={t("buscar")}
        className="min-w-48 flex-1"
      />
      <FilterPanel
        conteo={count}
        onLimpiar={() => onChange(EMPTY_FILTERS)}
        titulo={t("filtros")}
      >
        <div className="grid gap-4 p-4">
          {(
            [
              ["direction", CALL_DIRECTIONS, "direcciones"],
              ["mode", CALL_MODES, "modos"],
              ["outcome", DISPOSITION_OUTCOMES, "resultados"],
            ] as const
          ).map(([key, values, labels]) => (
            <FormField key={key} etiqueta={t(key)}>
              <select
                className={CLASE_CAMPO}
                aria-label={t(key)}
                value={filters[key]}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">{t("todos")}</option>
                {values.map((v) => (
                  <option key={v} value={v}>
                    {t(`${labels}.${v}`)}
                  </option>
                ))}
              </select>
            </FormField>
          ))}
          {(["fromDate", "toDate"] as const).map((key) => (
            <FormField key={key} etiqueta={t(key)}>
              <input
                className={CLASE_CAMPO}
                type="date"
                aria-label={t(key)}
                value={filters[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </FormField>
          ))}
          {(["mine", "hasRecording"] as const).map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-fg"
            >
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {t(key)}
            </label>
          ))}
        </div>
      </FilterPanel>
    </div>
  );
}
