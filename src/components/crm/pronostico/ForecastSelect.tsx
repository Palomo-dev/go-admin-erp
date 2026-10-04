"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { cn } from "@/utils/Utils";

/** Select del sistema visual; el valor vacío conserva el filtro nativo. */
export function ForecastSelect({
  value,
  onChange,
  label,
  options,
  disabled,
  compact,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  compact?: boolean;
}) {
  const empty = "__forecast_all__";
  return (
    <Select
      value={value || empty}
      disabled={disabled}
      onValueChange={(next) => onChange(next === empty ? "" : next)}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          CLASE_CAMPO,
          "focus:ring-brand dark:border-line-strong dark:bg-surface dark:text-fg",
          compact && "h-8 text-[13px] leading-[18px]",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-line bg-surface text-fg dark:border-line dark:bg-surface dark:text-fg">
        {options.map((option) => (
          <SelectItem
            key={option.value || empty}
            value={option.value || empty}
            className="text-sm focus:bg-hover focus:text-fg dark:focus:bg-hover dark:focus:text-fg"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
