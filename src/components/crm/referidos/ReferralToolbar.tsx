"use client";

import type { ReactNode } from "react";
import { useRedText } from "@/components/crm/red/useRedText";
import { TabBar, ChipsOpcion, SearchInput } from "@/components/kit";
import {
  REFERRAL_STATUSES,
  type ReferralStatus,
} from "@/lib/services/crm/referralStateMachine";
import type { ReferralListFilters } from "@/lib/services/crm/referralModel";
import { REFERRAL_STATUS_META } from "./referralMeta";

interface Props {
  filters: ReferralListFilters;
  counts: Record<ReferralStatus, number>;
  total: number;
  shown: number;
  onChange: (next: ReferralListFilters) => void;
  programa?: ReactNode;
}

export function ReferralToolbar({
  filters,
  counts,
  total,
  shown,
  onChange,
  programa,
}: Props) {
  const { tr } = useRedText();
  const opciones = [
    { valor: "all" as const, etiqueta: tr("Todos"), contador: total },
    ...REFERRAL_STATUSES.map((s) => ({
      valor: s,
      etiqueta: tr(REFERRAL_STATUS_META[s].label),
      contador: counts[s],
    })),
  ];
  const cambiar = (status: ReferralListFilters["status"]) =>
    onChange({ ...filters, status });
  return (
    <div className="space-y-4">
      <TabBar
        className="hidden lg:flex"
        id="referrals"
        valor={filters.status}
        onValorChange={cambiar}
        etiqueta={tr("Filtrar por estado")}
        pestanas={opciones}
      />
      <ChipsOpcion
        className="flex-nowrap overflow-x-auto pb-1 lg:hidden [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        etiqueta={tr("Filtrar por estado")}
        valor={filters.status}
        onValorChange={cambiar}
        opciones={[
          opciones[0],
          ...opciones.filter(
            (o) => o.valor === "qualified" || o.valor === "converted",
          ),
          ...opciones.filter(
            (o) =>
              o.valor !== "all" &&
              o.valor !== "qualified" &&
              o.valor !== "converted",
          ),
        ].map((o) => ({
          valor: o.valor,
          etiqueta: `${o.etiqueta} ${o.contador}`,
        }))}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          className="min-w-0 flex-none sm:flex-1"
          value={filters.q}
          onChange={(q) => onChange({ ...filters, q })}
          onValueChange={(q) => onChange({ ...filters, q })}
          placeholder={tr("Nombre, correo, teléfono o referidor")}
          id="referrals-search"
          etiqueta={tr("Buscar")}
        />
        {programa}
      </div>
      <p className="sr-only" aria-live="polite">
        {shown === total
          ? tr("{p0} referido{p1}", { p0: total, p1: total === 1 ? "" : "s" })
          : tr("{p0} de {p1} referidos", { p0: shown, p1: total })}
      </p>
    </div>
  );
}
