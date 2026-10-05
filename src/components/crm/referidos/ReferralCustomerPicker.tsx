"use client";
import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FormField } from "@/components/kit";
import { EntitySearchList } from "../shared/EntitySearchList";
import type { CustomerHit } from "../shared/useCustomerSearch";
import { useRedText } from "../red/useRedText";

/** Collapsed picker uses the same organization-scoped customer search. */
export function ReferralCustomerPicker({
  name,
  query,
  onQuery,
  hits,
  loading,
  error,
  fieldError,
  selectedId,
  onSelect,
  disabled,
}: {
  name: string | null;
  query: string;
  onQuery: (v: string) => void;
  hits: CustomerHit[];
  loading: boolean;
  error: string | null;
  fieldError: string;
  selectedId: string | null;
  onSelect: (h: { id: string; title: string }) => void;
  disabled: boolean;
}) {
  const { tr } = useRedText();
  const [open, setOpen] = useState(false);
  return (
    <FormField
      id="referral-referrer"
      etiqueta={tr("Cliente que recomienda")}
      obligatorio
      error={fieldError}
      tamanoEtiqueta="md"
    >
      {(field) => (
        <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={field.id}
              role="combobox"
              aria-expanded={open}
              aria-controls="referral-customer-results"
              aria-describedby={field["aria-describedby"]}
              aria-invalid={field["aria-invalid"]}
              disabled={disabled}
              className="flex h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand aria-[invalid=true]:border-danger"
            >
              <span className="min-w-0 flex-1 truncate">
                {name ?? tr("Buscar por nombre o correo…")}
              </span>
              <ChevronsUpDown
                className="size-4 shrink-0 text-fg-muted"
                strokeWidth={1.5}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            id="referral-customer-results"
            align="start"
            className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-32px)] rounded-xl border-line bg-surface p-3"
          >
            <EntitySearchList
              id="referral-referrer-query"
              label={tr("Buscar clientes")}
              placeholder={tr("Buscar por nombre o correo…")}
              query={query}
              onQueryChange={onQuery}
              hits={hits.map((h) => ({
                id: h.id,
                title: h.full_name ?? tr("Cliente sin nombre"),
                subtitle: h.email ?? h.phone,
              }))}
              loading={loading}
              error={error}
              selectedId={selectedId}
              onSelect={(h) => {
                onSelect(h);
                setOpen(false);
              }}
              hint={tr(
                "Escribe para buscar entre los clientes de la organización.",
              )}
            />
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}
