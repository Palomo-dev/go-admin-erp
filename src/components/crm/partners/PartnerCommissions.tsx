"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/kit";
import {
  useFormatDate,
  useOrgTimezone,
} from "@/lib/context/OrganizationTimezoneContext";
import { toPlainDate } from "@/lib/utils/dateDisplay";
import type { CommissionSummary } from "@/lib/services/crm/partnerCommission";
import type {
  PartnerDealView,
  PartnerTier,
  PartnerView,
} from "@/lib/services/crm/partnerService";
import { rankTiers } from "@/lib/services/crm/partnerTierFor";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "../red/useRedText";
import { Button } from "../red/RedButton";
import { commissionGroups } from "./partnerCommissionGroups";
import { partnerTierTone } from "./partnerTierTone";

const states = ["paid", "approved", "pending", "rejected"] as const;
const colors = ["bg-brand-deep", "bg-brand", "bg-line-brand", "bg-brand-tint"];
export function PartnerCommissions({
  rows,
  partners,
  tiers,
  baseCurrency,
  canManage,
  onTiers,
}: {
  rows: PartnerDealView[];
  partners: PartnerView[];
  tiers: PartnerTier[];
  baseCurrency: string | null;
  canManage: boolean;
  onTiers: () => void;
}) {
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  const t = useTranslations("crm.partnersVisual");
  const { getToday } = useFormatDate(null);
  const { timezone } = useOrgTimezone();
  const currentYear = Number(getToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const rowYear = (r: PartnerDealView) => {
    const date = new Date(r.created_at);
    return Number.isFinite(date.getTime())
      ? Number(toPlainDate(date, timezone).slice(0, 4))
      : null;
  };
  const years = [
    ...new Set([
      currentYear,
      ...rows.map(rowYear).filter((y): y is number => y !== null),
    ]),
  ].sort((a, b) => b - a);
  const scoped = rows.filter((r) => rowYear(r) === year);
  const groups = commissionGroups(scoped);
  const shown = partners
    .map((partner) => ({
      partner,
      rows: scoped.filter((r) => r.partner_id === partner.id),
    }))
    .filter((r) => r.rows.length > 0);
  const amount = (
    deals: PartnerDealView[],
    key: keyof CommissionSummary | "total",
  ) => {
    const values = commissionGroups(deals);
    if (!values.length) return "—";
    return (
      <div className="space-y-1">
        {values.map((g, i) => (
          <div key={g.currency ?? i} className="whitespace-nowrap">
            {g.known
              ? formatMoney(
                  key === "total"
                    ? g.summary.pending + g.summary.approved + g.summary.paid
                    : g.summary[key],
                  g.currency,
                  locale,
                )
              : "—"}
            {values.length > 1 && (
              <span className="ml-1 text-xs text-fg-muted">
                {g.currency ?? t("monedaDesconocida")}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="h-10 w-80 max-w-full rounded-lg border-line-strong bg-surface text-sm text-fg" aria-label={t("anio")}><SelectValue /></SelectTrigger>
          <SelectContent className="border-line bg-surface text-fg">
            {years.map((y) => <SelectItem key={y} value={String(y)}>{t("periodoAnio", { year: y })}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-fg-secondary">
          {t("comisionesFecha")}
        </span>
      </div>
      {groups.map((g, i) => {
        const total = states.reduce((sum, key) => sum + g.summary[key], 0);
        return (
          <section
            key={g.currency ?? i}
            className="space-y-2 rounded-xl border border-line bg-subtle p-4"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <h2 className="font-medium">
                {t("comisionesAnio", { year })}
                {groups.length > 1
                  ? ` · ${g.currency ?? t("monedaDesconocida")}`
                  : ""}
              </h2>
              <span className="font-semibold tabular-nums">
                {g.known ? formatMoney(total, g.currency, locale) : "—"}
              </span>
            </div>
            {g.known && (
              <div
                aria-hidden
                className="flex h-2 overflow-hidden rounded-full bg-pressed"
              >
                {states.map((key, index) => (
                  <span
                    key={key}
                    className={colors[index]}
                    style={{
                      width: `${total ? (g.summary[key] / total) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
            )}
            <dl className="space-y-1.5 text-xs">
              {states.map((key, index) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="flex items-center gap-2 text-fg-secondary">
                    <span className={`size-2 rounded-full ${colors[index]}`} />
                    {t(key)}
                  </dt>
                  <dd className="tabular-nums">
                    {g.known
                      ? formatMoney(g.summary[key], g.currency, locale)
                      : "—"}
                    {g.known && total > 0
                      ? ` · ${Math.round((g.summary[key] / total) * 100)} %`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
            {!g.known && (
              <p className="text-xs text-warning-text">
                {tr("Sin datos monetarios")}
              </p>
            )}
          </section>
        );
      })}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <DataTable
          etiqueta={tr("Comisiones")}
          filas={shown}
          obtenerId={(r) => r.partner.id}
          columnas={[
            {
              id: "partner",
              encabezado: tr("Partners"),
              celda: (r) => (
                <div>
                  <p className="font-medium">{r.partner.name}</p>
                  <p className="mt-0.5 text-xs text-fg-secondary">
                    {r.partner.tier?.name ?? tr("Sin tier")} ·{" "}
                    {formatRate(r.partner.effective_rate, locale)}
                  </p>
                </div>
              ),
            },
            ...(["pending", "approved", "paid", "total"] as const).map(
              (key) => ({
                id: key,
                encabezado: t(key),
                variante: "importe" as const,
                celda: (r: (typeof shown)[number]) => amount(r.rows, key),
              }),
            ),
          ]}
          pie={
            shown.length ? (
              <div className="flex flex-wrap justify-between gap-2 bg-subtle p-4 text-xs">
                <strong>{t("totalSinRechazadas")}</strong>
                {amount(scoped, "total")}
              </div>
            ) : undefined
          }
        />
        <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{tr("Niveles")}</h2>
            {canManage && (
              <Button variant="ghost" size="sm" onClick={onTiers}>
                <Pencil className="size-4" />
                {tr("Editar")}
              </Button>
            )}
          </div>
          {rankTiers(tiers).map((tier) => (
            <div
              key={tier.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
            >
              <Badge tono={partnerTierTone(tier.id, tiers)} tamano="sm">
                {tier.name}
              </Badge>
              <div className="min-w-0 flex-1 text-xs">
                <p>
                  {t("umbral", {
                    count: tier.min_deals,
                    amount: baseCurrency
                      ? formatMoney(tier.min_revenue, baseCurrency, locale)
                      : "—",
                  })}
                </p>
                <p className="mt-1 text-fg-secondary">
                  {t("cantidadPartners", {
                    count: partners.filter((p) => p.tier_id === tier.id).length,
                  })}
                </p>
              </div>
              <span className="text-xs font-medium tabular-nums">
                {formatRate(tier.commission_rate, locale)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
