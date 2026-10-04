"use client";
import { useMemo, useState } from "react";
import { Download, HandCoins, Ticket } from "lucide-react";
import { ChipsOpcion, DataTable, EmptyState, StatCard } from "@/components/kit";
import { Button } from "../red/RedButton";
import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "../red/useRedText";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatDateInTz } from "@/lib/utils/dateDisplay";
import { describeReward } from "@/lib/services/crm/referralReward";
import { formatMoney } from "@/lib/services/crm/partnerModel";
import type { ReferralView } from "@/lib/services/crm/referralsService";
import type { F12Stats } from "@/lib/services/crm/f12ReadService";

export function ReferralRewards({
  referrals,
  currency,
  stats,
  canManage,
  busyId,
  onPay,
}: {
  referrals: ReferralView[];
  currency: string | null;
  stats: F12Stats | null;
  canManage: boolean;
  busyId: string | null;
  onPay: (r: ReferralView) => void;
}) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const { timezone } = useFormatDate();
  const formatDate = (
    value: string | null | undefined,
    options: Intl.DateTimeFormatOptions,
  ) => formatDateInTz(value, timezone, { ...options, locale });
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const converted = useMemo(
    () => referrals.filter((r) => r.status === "converted" && r.program),
    [referrals],
  );
  const rows = converted.filter((r) => r.reward_paid === (status === "paid"));
  const money = (k: "pending" | "paid") => {
    const v = stats?.rewards?.[k];
    return v && !v.sinTasa.length && stats?.base_currency
      ? formatMoney(v.total, stats.base_currency, locale)
      : "—";
  };
  const reward = (r: ReferralView) =>
    describeReward(r.program, currency, { locale, translate: tr });
  const recipient = (r: ReferralView) =>
    r.program?.reward_to === "referred"
      ? r.referred_name
      : r.program?.reward_to === "both"
        ? [r.referrer?.full_name, r.referred_name].filter(Boolean).join(" · ")
        : (r.referrer?.full_name ?? "—");
  const pay = (r: ReferralView) =>
    canManage && !r.reward_paid ? (
      <Button
        size="sm"
        variant="outline"
        disabled={busyId === r.id}
        onClick={() => onPay(r)}
      >
        {["discount", "gift"].includes(r.program?.reward_type ?? "") ? (
          <Ticket className="size-4" />
        ) : (
          <HandCoins className="size-4" />
        )}
        {tr(
          ["discount", "gift"].includes(r.program?.reward_type ?? "")
            ? "Registrar como aplicado"
            : "Registrar pago",
        )}
      </Button>
    ) : r.reward_paid ? (
      <span className="text-xs text-success-text">
        {tr("Pagada")}{" "}
        {r.reward_paid_at
          ? formatDate(r.reward_paid_at, { day: "numeric", month: "short" })
          : ""}
      </span>
    ) : (
      "—"
    );
  const exportRows = () => {
    const cell = (v: unknown) => {
      const text = String(v ?? "");
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [
      [
        tr("Referido convertido"),
        tr("Beneficiario"),
        tr("Programa"),
        tr("Recompensa"),
        tr("Pagada"),
      ],
      ...rows.map((r) => [
        r.referred_name,
        recipient(r),
        r.program?.name,
        reward(r)?.summary,
        tr(r.reward_paid ? "Sí" : "No"),
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "referidos-recompensas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="space-y-4" aria-label={tr("Recompensas")}>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          etiqueta={tr("Pendientes de registrar este mes")}
          valor={money("pending")}
          detalle={stats?.base_currency ?? "—"}
        />
        <StatCard
          etiqueta={tr("Pagadas este mes")}
          valor={money("paid")}
          detalle={stats?.base_currency ?? "—"}
        />
        <StatCard
          etiqueta={tr("Recompensas no monetarias")}
          valor={
            converted.filter((r) =>
              ["discount", "gift"].includes(r.program?.reward_type ?? ""),
            ).length
          }
          detalle={tr("Descuentos y regalos de la lista")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipsOpcion
          etiqueta={tr("Estado de la recompensa")}
          valor={status}
          onValorChange={setStatus}
          opciones={[
            {
              valor: "pending",
              etiqueta: tr("Pendientes · {p0}", {
                p0: converted.filter((r) => !r.reward_paid).length,
              }),
            },
            {
              valor: "paid",
              etiqueta: tr("Pagadas · {p0}", {
                p0: converted.filter((r) => r.reward_paid).length,
              }),
            },
          ]}
        />
        <Button variant="outline" onClick={exportRows} disabled={!rows.length}>
          <Download className="size-4" />
          {tr("Exportar")}
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState
          titulo={tr("No hay recompensas en este estado")}
          descripcion={tr(
            "Aquí aparecen los referidos convertidos con un programa de recompensa.",
          )}
        />
      ) : (
        <DataTable
          filas={rows}
          obtenerId={(r) => r.id}
          etiqueta={tr("Recompensas")}
          className="[&_th]:h-[60px] [&_td]:h-20"
          columnas={[
            {
              id: "referred",
              encabezado: tr("Referido convertido"),
              celda: (r) => (
                <div>
                  <p>{r.referred_name}</p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {r.referred_customer_id
                      ? tr("Ficha de lead vinculada")
                      : "—"}
                  </p>
                </div>
              ),
            },
            {
              id: "beneficiary",
              encabezado: tr("Beneficiario"),
              celda: (r) => recipient(r),
            },
            {
              id: "program",
              encabezado: tr("Programa"),
              celda: (r) => (
                <div>
                  <p>{r.program?.name}</p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {reward(r)?.type}
                  </p>
                </div>
              ),
            },
            {
              id: "amount",
              encabezado: tr("Recompensa"),
              celda: (r) => (
                <div>
                  <p>{reward(r)?.amount || reward(r)?.type}</p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {reward(r)?.to}
                  </p>
                </div>
              ),
            },
            {
              id: "registered",
              encabezado: tr("Registrado"),
              celda: (r) =>
                formatDate(r.created_at, { day: "numeric", month: "short" }),
            },
            { id: "action", encabezado: tr("Acción"), celda: pay },
          ]}
          tarjetaMovil={(r) => (
            <article className="space-y-3 rounded-xl border border-line bg-surface p-3">
              <h3 className="font-medium">{r.referred_name}</h3>
              <p className="text-sm text-fg-secondary">
                {recipient(r)} · {reward(r)?.summary}
              </p>
              {pay(r)}
            </article>
          )}
        />
      )}
      <p className="rounded-lg bg-subtle p-3 text-sm text-fg-secondary">
        {tr(
          "Registrar el pago solo deja constancia. El dinero o el crédito se entrega por Finanzas o en el POS.",
        )}
      </p>
    </section>
  );
}
