"use client";
import { StatCard } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import type { F12Stats } from "@/lib/services/crm/f12ReadService";
import { formatMoney } from "@/lib/services/crm/partnerModel";
import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "../red/useRedText";

/** Figures come from the server period; the list may include older referrals. */
export function ReferralStats({
  stats,
  loading,
  error,
  soloMovil = false,
  onOpenRewards,
}: {
  stats: F12Stats | null;
  loading: boolean;
  error: string | null;
  soloMovil?: boolean;
  onOpenRewards?: () => void;
}) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const amount = (kind: "pending" | "paid") => {
    const m = stats?.rewards?.[kind];
    return m && !m.sinTasa.length && stats?.base_currency
      ? formatMoney(m.total, stats.base_currency, locale)
      : "—";
  };
  const conversion = stats
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(stats.counts.total ? (stats.counts.converted / stats.counts.total) * 100 : 0)} %`
    : "—";
  const detail = error
    ? tr("No se pudieron cargar las cifras")
    : stats?.currency_missing
      ? tr("Sin datos monetarios")
      : (stats?.base_currency ?? "—");
  if (soloMovil)
    return (
      <div className="grid grid-cols-2 gap-4 text-xs text-fg-secondary lg:hidden">
        <div>
          <p>{tr("Conversión")}</p>
          <p className="mt-1 text-sm font-medium text-success-text">
            {conversion}
          </p>
        </div>
        <button type="button" onClick={onOpenRewards} className="text-left">
          <p>{tr("Recompensas pendientes")}</p>
          <p className="mt-1 text-sm font-medium text-warning-text">
            {amount("pending")}
          </p>
        </button>
      </div>
    );
  if (loading)
    return (
      <div className="hidden grid-cols-4 gap-4 lg:grid" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg bg-line" />
        ))}
      </div>
    );
  return (
    <div className="hidden grid-cols-4 gap-4 lg:grid">
      <StatCard
        etiqueta={tr("Referidos este mes")}
        valor={stats?.counts.total ?? "—"}
        detalle={tr("Mes actual")}
        className="min-h-[118px]"
      />
      <StatCard
        etiqueta={tr("Tasa de conversión")}
        valor={conversion}
        detalle={
          stats
            ? tr("{p0} de {p1} convertidos", {
                p0: stats.counts.converted,
                p1: stats.counts.total,
              })
            : "—"
        }
        tono="exito"
        className="min-h-[118px]"
      />
      <StatCard
        etiqueta={tr("Recompensas pendientes")}
        valor={amount("pending")}
        detalle={detail}
        onClick={onOpenRewards}
        className="min-h-[118px]"
      />
      <StatCard
        etiqueta={tr("Recompensas pagadas")}
        valor={amount("paid")}
        detalle={detail}
        className="min-h-[118px]"
      />
    </div>
  );
}
