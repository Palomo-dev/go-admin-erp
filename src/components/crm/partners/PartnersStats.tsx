"use client";
import { useTranslations } from "next-intl";
import { ArrowUp, TriangleAlert } from "lucide-react";
import { StatCard } from "@/components/kit";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { F12Stats } from "@/lib/services/crm/f12ReadService";
import { formatMoney } from "@/lib/services/crm/partnerModel";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "../red/useRedText";

export function PartnersStats({
  stats,
  loading,
}: {
  stats: F12Stats | null;
  loading: boolean;
}) {
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  const t = useTranslations("crm.partnersVisual");
  const { formatDate } = useFormatDate(null);
  const year = stats ? formatDate(stats.start).slice(-4) : "—";
  const amount = (key: "pending" | "paid") => {
    const value = stats?.commissions?.[key];
    return value && !value.sinTasa.length && stats?.base_currency
      ? formatMoney(value.total, stats.base_currency, locale)
      : "—";
  };
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        etiqueta={tr("Partners activos")}
        valor={stats?.counts.active ?? "—"}
        detalle={
          stats
            ? t("inactivos", {
                count: stats.counts.total - stats.counts.active,
              })
            : undefined
        }
        cargando={loading}
        varianteCarga="compacta"
      />
      <StatCard
        etiqueta={t("dealsAnio", { year })}
        valor={stats?.counts.deals ?? "—"}
        cargando={loading}
        varianteCarga="compacta"
      />
      <StatCard
        etiqueta={tr("Comisiones por pagar")}
        valor={amount("pending")}
        detalle={
          stats
            ? t("pendientesAprobadas", { count: stats.counts.pending })
            : undefined
        }
        tono="advertencia"
        iconoDetalle={TriangleAlert}
        cargando={loading}
        varianteCarga="compacta"
      />
      <StatCard
        etiqueta={t("pagadasAnio", { year })}
        valor={amount("paid")}
        detalle={
          stats
            ? t("cantidadComisiones", { count: stats.counts.paid })
            : undefined
        }
        tono="exito"
        iconoDetalle={ArrowUp}
        cargando={loading}
        varianteCarga="compacta"
      />
    </div>
  );
}
