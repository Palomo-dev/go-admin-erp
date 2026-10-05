"use client";

import { CheckCircle2, Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  PartnerView,
  PartnerTier,
} from "@/lib/services/crm/partnerService";
import { rankTiers } from "@/lib/services/crm/partnerTierFor";
import { formatMoney, formatRate } from "@/lib/services/crm/partnerModel";
import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "../red/useRedText";

/** Presenta el DTO canónico; no decide ni aplica promociones. */
export function PartnerSummary({
  partner,
  tiers,
}: {
  partner: PartnerView;
  tiers: PartnerTier[];
}) {
  const { tr } = useRedText();
  const t = useTranslations("crm.partnersVisual");
  const moneyLocale = useLocaleIntl();
  const locale = moneyLocale;
  const compactMoney = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(moneyLocale, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    } catch {
      return formatMoney(value, currency, locale);
    }
  };
  const ranked = rankTiers(tiers);
  const current = ranked.find((t) => t.id === partner.tier_id);
  const index = ranked.findIndex((t) => t.id === partner.tier_id);
  const next = ranked[index + 1];
  const benefits = Array.isArray(current?.benefits)
    ? current.benefits.filter(
        (x): x is string => typeof x === "string" && !!x.trim(),
      )
    : [];
  const revenue = partner.revenue;
  const revenueKnown = !!revenue?.base && !revenue.sinTasa.length;
  const moneyKnown = !partner.currency_mixed && !!partner.commissions_currency;
  const progress = (
    value: number,
    goal: number,
    label: string,
    monetary = false,
  ) => (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-medium tabular-nums">
          {monetary && revenue
            ? `${formatMoney(value, revenue.base, locale)} / ${formatMoney(goal, revenue.base, locale)}`
            : `${value.toLocaleString(locale)} / ${goal.toLocaleString(locale)}`}
        </span>
      </div>
      <progress
        aria-label={label}
        className={`h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-subtle ${monetary ? "[&::-webkit-progress-value]:bg-warning [&::-moz-progress-bar]:bg-warning" : "[&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand"}`}
        max={Math.max(1, goal)}
        value={goal === 0 ? 1 : Math.min(value, goal)}
      />
    </div>
  );
  return (
    <>
      <div className="hidden gap-4 lg:grid lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning-text">
              <Crown className="size-6" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">
                {tr("Nivel")} {current?.name ?? tr("Sin tier")}
              </h2>
              <p className="mt-1 text-xs text-fg-secondary">
                {tr("Comisión")} {formatRate(partner.effective_rate, locale)}
                {current && revenue?.base
                  ? ` · ${t("umbral", { count: current.min_deals, amount: formatMoney(current.min_revenue, revenue.base, locale) })}`
                  : ""}
              </p>
            </div>
          </div>
          {benefits.length ? (
            <ul className="space-y-2">
              {benefits.map((benefit, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-fg-secondary"
                >
                  <CheckCircle2
                    aria-hidden
                    className="size-3.5 shrink-0 text-success-text"
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-muted">
              {tr("Sin beneficios registrados")}
            </p>
          )}
        </section>
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">
            {next
              ? t("caminoNivel", {
                  name: next.name,
                  rate: formatRate(next.commission_rate, locale),
                })
              : tr(
                  ranked.length ? "Nivel más alto" : "Sin niveles configurados",
                )}
          </h2>
          {next ? (
            <>
              {progress(
                partner.deals_count,
                Number(next.min_deals),
                tr("Deals"),
              )}
              {revenueKnown ? (
                progress(
                  revenue.total,
                  Number(next.min_revenue),
                  `${tr("Revenue atribuido")} · ${revenue.base}`,
                  true,
                )
              ) : (
                <p className="text-xs text-fg-secondary">
                  {tr("Sin datos monetarios")}
                </p>
              )}
              <p className="text-xs text-fg-muted">
                {tr(
                  "El nivel se actualiza al registrar un deal que cumpla ambos mínimos.",
                )}
              </p>
            </>
          ) : (
            <p className="text-xs text-fg-secondary">
              {tr("No hay un nivel superior configurado.")}
            </p>
          )}
        </section>
      </div>
      <dl className="grid grid-cols-3 gap-2 lg:hidden">
        {[
          {
            label: tr("Deals"),
            value: partner.deals_count.toLocaleString(locale),
            full: partner.deals_count.toLocaleString(locale),
          },
          {
            label: t("atribuido"),
            value: revenueKnown
              ? compactMoney(revenue.total, revenue.base)
              : "—",
            full: revenueKnown
              ? formatMoney(revenue.total, revenue.base, locale)
              : "—",
          },
          {
            label: tr("Por pagar"),
            value: moneyKnown
              ? compactMoney(
                  partner.commissions.outstanding,
                  partner.commissions_currency!,
                )
              : "—",
            full: moneyKnown
              ? formatMoney(
                  partner.commissions.outstanding,
                  partner.commissions_currency,
                  locale,
                )
              : "—",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="min-w-0 rounded-xl border border-line bg-surface p-3"
          >
            <dt className="truncate text-[11px] text-fg-secondary">
              {stat.label}
            </dt>
            <dd
              title={stat.full}
              aria-label={stat.full}
              className="mt-1 truncate text-base font-semibold tabular-nums text-fg"
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="hidden grid-cols-4 gap-4 lg:grid">
        {[
          {
            label: t("dealsRegistrados"),
            value: partner.deals_count,
            tone: "text-fg",
          },
          {
            label: tr("Revenue atribuido"),
            value: revenueKnown
              ? formatMoney(revenue.total, revenue.base, locale)
              : "—",
            tone: "text-fg",
          },
          {
            label: tr("Comisiones por pagar"),
            value: moneyKnown
              ? formatMoney(
                  partner.commissions.outstanding,
                  partner.commissions_currency,
                  locale,
                )
              : "—",
            tone: "text-warning-text",
          },
          {
            label: t("comisionPagada"),
            value: moneyKnown
              ? formatMoney(
                  partner.commissions.paid,
                  partner.commissions_currency,
                  locale,
                )
              : "—",
            tone: "text-success-text",
          },
        ].map((metric) => (
          <div key={metric.label}>
            <dt className="text-xs text-fg-secondary">{metric.label}</dt>
            <dd
              className={`mt-1 text-sm font-semibold tabular-nums ${metric.tone}`}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
