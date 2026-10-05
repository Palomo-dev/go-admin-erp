"use client";
import { useTranslations } from "next-intl";
import { SearchInput } from "@/components/kit/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PartnerTier } from "@/lib/services/crm/partnerService";
import { useRedText } from "../red/useRedText";

export function PartnersFilters({
  query,
  onQuery,
  status,
  onStatus,
  tier,
  onTier,
  tiers,
  disabled = false,
}: {
  query: string;
  onQuery: (v: string) => void;
  status: string;
  onStatus: (v: "all" | "active" | "inactive") => void;
  tier: string;
  onTier: (v: string) => void;
  tiers: PartnerTier[];
  disabled?: boolean;
}) {
  const { tr } = useRedText();
  const t = useTranslations("crm.partnersVisual");
  const trigger =
    "h-10 w-full rounded-lg border-line-strong bg-surface text-sm text-fg focus:ring-brand";
  return (
    <fieldset
      disabled={disabled}
      className="grid gap-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <SearchInput
        value={query}
        onChange={onQuery}
        onValueChange={onQuery}
        placeholder={t("buscar")}
        id="partners-search"
      />
      <Select value={tier} onValueChange={onTier} disabled={disabled}>
        <SelectTrigger aria-label={tr("Nivel")} className={trigger}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-line bg-surface text-fg">
          <SelectItem value="all">{tr("Nivel: todos")}</SelectItem>
          {tiers.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status}
        onValueChange={(value) =>
          onStatus(value as "all" | "active" | "inactive")
        }
        disabled={disabled}
      >
        <SelectTrigger aria-label={tr("Estado")} className={trigger}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-line bg-surface text-fg">
          <SelectItem value="all">{tr("Estado: todos")}</SelectItem>
          <SelectItem value="active">{tr("Activo")}</SelectItem>
          <SelectItem value="inactive">{tr("Inactivo")}</SelectItem>
        </SelectContent>
      </Select>
    </fieldset>
  );
}
