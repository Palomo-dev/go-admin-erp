"use client";
import { useTranslations } from "next-intl";
import { SearchInput } from "@/components/kit/SearchInput";
import { FilterPanel } from "@/components/kit/FilterPanel";
import { FormField } from "@/components/kit/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeButton } from "@/components/kit/DateRangeButton";
import { FilterChips, type ChipFiltro } from "@/components/kit/FilterChips";
import { SelectCrm } from "@/components/crm/kit/SelectCrm";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
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
  const { getToday, formatPlain } = useFormatDate(null);
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
  ].filter(Boolean).length;
  const chips: ChipFiltro[] = [];
  for (const [key, labels] of [["direction", "direcciones"], ["mode", "modos"], ["outcome", "resultados"]] as const) {
    if (filters[key]) chips.push({ clave: key, etiqueta: `${t(key)}: ${t(`${labels}.${filters[key]}`)}` });
  }
  for (const key of ["mine", "hasRecording"] as const) {
    if (filters[key]) chips.push({ clave: key, etiqueta: t(key) });
  }
  const rango = { desde: filters.fromDate, hasta: filters.toDate };
  if (!!rango.desde !== !!rango.hasta) {
    const key = rango.desde ? 'fromDate' : 'toDate';
    chips.push({ clave: key, etiqueta: `${t(key)}: ${formatPlain(filters[key])}` });
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={filters.q}
        onChange={(v) => set("q", v)}
        placeholder={t("buscar")}
        etiqueta={t("buscar")}
        className="min-w-0 basis-full lg:basis-0 lg:flex-1"
      />
      <DateRangeButton
        valor={rango.desde && rango.hasta ? rango : null}
        hoy={getToday()}
        etiqueta={t("periodo")}
        onValorChange={({ desde, hasta }) => onChange({ ...filters, fromDate: desde, toDate: hasta })}
        onLimpiar={() => onChange({ ...filters, fromDate: "", toDate: "" })}
        className="min-w-0 flex-1 lg:w-80 lg:flex-none lg:justify-between [&>span]:truncate"
      />
      <FilterPanel
        conteo={count}
        onLimpiar={() => onChange(EMPTY_FILTERS)}
        titulo={t("filtros")}
      >
        <div className="grid gap-4">
          {(
            [
              ["direction", CALL_DIRECTIONS, "direcciones"],
              ["mode", CALL_MODES, "modos"],
              ["outcome", DISPOSITION_OUTCOMES, "resultados"],
            ] as const
          ).map(([key, values, labels]) => (
            <FormField key={key} etiqueta={t(key)} tamanoEtiqueta="sm">
              <SelectCrm
                aria-label={t(key)}
                valor={filters[key]}
                onValorChange={(value) => set(key, value)}
                opcionVacia={t("todos")}
                opciones={values.map((value) => ({ valor: value, etiqueta: t(`${labels}.${value}`) }))}
              />
            </FormField>
          ))}
          {(["mine", "hasRecording"] as const).map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-fg"
            >
              <Checkbox
                className="size-[18px] rounded border-line-strong dark:border-line-strong data-[state=checked]:border-brand-action data-[state=checked]:bg-brand-action data-[state=checked]:text-fg-on-brand [&_svg]:stroke-[1.5]"
                checked={filters[key]}
                onCheckedChange={(value) => set(key, value === true)}
              />
              {t(key)}
            </label>
          ))}
        </div>
      </FilterPanel>
    </div>
    <FilterChips
      chips={chips}
      onQuitar={(key) => {
        if (key === "mine" || key === "hasRecording") set(key, false);
        else if (key === "direction" || key === "mode" || key === "outcome") set(key, "");
        else if (key === "fromDate" || key === "toDate") set(key, "");
      }}
      onLimpiarTodo={() => onChange(EMPTY_FILTERS)}
    />
    </div>
  );
}
