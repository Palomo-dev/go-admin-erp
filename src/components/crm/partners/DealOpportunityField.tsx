"use client";
import { useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { OpportunityHit } from "@/components/crm/automatizaciones/useOpportunitySearch";
import { useRedText } from "../red/useRedText";
export function DealOpportunityField({
  selected,
  query,
  onQuery,
  hits,
  loading,
  error,
  fieldError,
  onSelect,
  disabled,
}: {
  selected: OpportunityHit | null;
  query: string;
  onQuery: (v: string) => void;
  hits: OpportunityHit[];
  loading: boolean;
  error: string | null;
  fieldError?: string;
  onSelect: (hit: OpportunityHit) => void;
  disabled: boolean;
}) {
  const { tr } = useRedText();
  const t = useTranslations("crm.partnersVisual");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="deal-opportunity" className="text-sm font-medium">
        {tr("Oportunidad")} <span className="text-danger-text">*</span>
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="deal-opportunity"
            type="button"
            role="combobox"
            aria-label={tr("Oportunidad")}
            aria-expanded={open}
            aria-controls="deal-opportunity-results"
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? "deal-opportunity-error" : undefined}
            disabled={disabled}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="truncate">
              {selected
                ? [selected.name, selected.customer_name]
                    .filter(Boolean)
                    .join(" · ")
                : t("eligeOportunidad")}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-fg-muted"
              strokeWidth={1.5}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] border-line bg-surface p-2 text-fg"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <Input
              autoFocus
              type="search"
              aria-label={tr("Buscar por nombre…")}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={tr("Buscar por nombre…")}
              className="h-10 border-line-strong bg-surface pl-9 text-fg focus-visible:ring-brand"
            />
          </div>
          <div
            id="deal-opportunity-results"
            className="mt-2 max-h-56 overflow-y-auto"
            aria-busy={loading}
          >
            {loading ? (
              <p className="p-3 text-xs text-fg-secondary">
                {tr("Cargando deals")}
              </p>
            ) : error ? (
              <p role="alert" className="p-3 text-xs text-danger-text">
                {error}
              </p>
            ) : hits.length ? (
              hits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  aria-pressed={hit.id === selected?.id}
                  className="flex w-full flex-col gap-1 rounded-lg p-3 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => {
                    onSelect(hit);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{hit.name}</span>
                  {hit.customer_name && (
                    <span className="text-xs text-fg-secondary">
                      {hit.customer_name}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="p-3 text-xs text-fg-secondary">
                {t("sinOportunidades")}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {fieldError && (
        <p
          id="deal-opportunity-error"
          role="alert"
          className="text-xs text-danger-text"
        >
          {fieldError}
        </p>
      )}
    </div>
  );
}
