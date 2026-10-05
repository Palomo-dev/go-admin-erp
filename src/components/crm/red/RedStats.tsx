"use client";
import { StatCard } from "@/components/kit";
import type { F12Stats } from "@/lib/services/crm/f12ReadService";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { useRedText } from "./useRedText";

export function RedStats({
  kind,
  stats,
  loading,
  error,
}: {
  kind: "referrals" | "partners";
  stats: F12Stats | null;
  loading: boolean;
  error: string | null;
}) {
  const { tr, locale } = useRedText();
  const summaries = kind === "referrals" ? stats?.rewards : stats?.commissions;
  const amount = (type: "pending" | "paid") => {
    const value = summaries?.[type];
    return value && !value.sinTasa.length && stats?.base_currency
      ? formatMoney(value.total, stats.base_currency, locale)
      : "—";
  };
  const detail = error
    ? tr("No se pudieron cargar las cifras")
    : !summaries?.pending ||
        !summaries?.paid ||
        summaries.pending.sinTasa.length ||
        summaries.paid.sinTasa.length
      ? tr("Sin datos monetarios")
      : stats?.base_currency;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary lg:hidden">
        <span>
          {tr(kind === "referrals" ? "Tasa de conversión" : "Partners activos")}
          :{" "}
          <strong className="font-medium text-fg">
            {stats
              ? kind === "referrals"
                ? formatRate(
                    stats.counts.total
                      ? (stats.counts.converted / stats.counts.total) * 100
                      : 0,
                    locale,
                  )
                : stats.counts.active
              : "—"}
          </strong>
        </span>
        <span>
          {tr(
            kind === "referrals"
              ? "Recompensas pendientes"
              : "Comisiones por pagar",
          )}
          : <strong className="font-medium text-fg">{amount("pending")}</strong>
        </span>
      </div>
      <div className="hidden gap-4 lg:grid lg:grid-cols-4">
        <StatCard
          etiqueta={tr(
            kind === "referrals" ? "Referidos este mes" : "Partners activos",
          )}
          valor={
            stats
              ? stats.counts[kind === "referrals" ? "total" : "active"]
              : "—"
          }
          cargando={loading}
        />
        <StatCard
          etiqueta={tr(
            kind === "referrals"
              ? "Tasa de conversión"
              : "Registrados este año",
          )}
          valor={
            stats
              ? kind === "referrals"
                ? formatRate(
                    stats.counts.total
                      ? (stats.counts.converted / stats.counts.total) * 100
                      : 0,
                    locale,
                  )
                : stats.counts.deals
              : "—"
          }
          cargando={loading}
        />
        <StatCard
          etiqueta={tr(
            kind === "referrals"
              ? "Recompensas pendientes"
              : "Comisiones por pagar",
          )}
          valor={amount("pending")}
          detalle={detail}
          cargando={loading}
        />
        <StatCard
          etiqueta={tr(
            kind === "referrals" ? "Recompensas pagadas" : "Pagadas este año",
          )}
          valor={amount("paid")}
          detalle={detail}
          cargando={loading}
        />
      </div>
    </>
  );
}
