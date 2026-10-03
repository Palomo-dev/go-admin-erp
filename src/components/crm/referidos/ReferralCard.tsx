"use client";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  HandCoins,
  Phone,
  Star,
  XCircle,
} from "lucide-react";
import { AvatarIniciales, RowActionsMenu } from "@/components/kit";
import { Button } from "../red/RedButton";
import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "../red/useRedText";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatDateInTz } from "@/lib/utils/dateDisplay";
import { describeReward } from "@/lib/services/crm/referralReward";
import { nextReferralStatuses } from "@/lib/services/crm/referralStateMachine";
import type { ReferralView } from "@/lib/services/crm/referralsService";
import { ReferralStatusBadge, REFERRAL_STATUS_META } from "./referralMeta";

interface Props {
  referral: ReferralView;
  currency: string | null;
  busy: boolean;
  canManage?: boolean;
  canRegister?: boolean;
  onTransition: (r: ReferralView, to: "contacted" | "qualified") => void;
  onReject: (r: ReferralView) => void;
  onConvert: (r: ReferralView) => void;
  onMarkPaid: (r: ReferralView) => void;
}
export function referralActionId(referralId: string, action: string) {
  return `referral-${referralId}-${action}`;
}
export function ReferralCard({
  referral: r,
  currency,
  busy,
  canManage = true,
  canRegister = true,
  onTransition,
  onReject,
  onConvert,
  onMarkPaid,
}: Props) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const { timezone } = useFormatDate();
  const formatDate = (
    value: string | null | undefined,
    options: Intl.DateTimeFormatOptions,
  ) => formatDateInTz(value, timezone, { ...options, locale });
  const next = nextReferralStatuses(r.status);
  const forward = next.find((s) => s === "contacted" || s === "qualified") as
    "contacted" | "qualified" | undefined;
  const reward = describeReward(r.program, currency, { locale, translate: tr });
  const canPay = r.status === "converted" && !!r.program_id && !r.reward_paid;
  return (
    <article
      aria-labelledby={`referral-${r.id}-name`}
      className="space-y-3 rounded-xl border border-line bg-surface p-3"
    >
      <header className="flex items-center gap-3">
        <AvatarIniciales nombre={r.referred_name} tamano="md" />
        <div className="min-w-0 flex-1">
          <h3
            id={`referral-${r.id}-name`}
            className="truncate text-sm font-medium text-fg"
          >
            {r.referred_name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-fg-secondary">
            {tr("Por")} {r.referrer?.full_name ?? "—"} ·{" "}
            {formatDate(r.created_at, { day: "numeric", month: "short" })}
          </p>
        </div>
        <ReferralStatusBadge status={r.status} />
        {canManage && next.includes("rejected") && (
          <RowActionsMenu
            titulo={r.referred_name}
            acciones={[
              {
                id: "reject",
                etiqueta: tr("Rechazar"),
                icono: XCircle,
                destructiva: true,
                deshabilitada: busy,
                onSelect: () => onReject(r),
              },
            ]}
          />
        )}
      </header>
      <p className="text-sm text-fg-secondary">
        {r.status === "converted" && r.program
          ? tr("Recompensa {p0} · {p1}", {
              p0: reward?.amount || reward?.type || "—",
              p1: r.reward_paid ? tr("Pagada") : tr("Pendiente de pago"),
            })
          : r.program
            ? `${r.program.name} · ${reward?.type} ${reward?.amount} · ${reward?.to.toLowerCase()}`
            : tr("Sin programa: no hay recompensa que registrar")}
      </p>
      {forward && canManage ? (
        <Button
          id={referralActionId(r.id, forward)}
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => onTransition(r, forward)}
        >
          {forward === "contacted" ? (
            <Phone className="size-4" />
          ) : (
            <Star className="size-4" />
          )}
          {tr(REFERRAL_STATUS_META[forward].action)}
        </Button>
      ) : next.includes("converted") && canRegister ? (
        <Button
          id={referralActionId(r.id, "converted")}
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onConvert(r)}
        >
          <ArrowRight className="size-4" />
          {tr("Convertir en lead")}
        </Button>
      ) : canPay && canManage ? (
        <Button
          id={referralActionId(r.id, "reward")}
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => onMarkPaid(r)}
        >
          <HandCoins className="size-4" />
          {tr("Registrar pago")}
        </Button>
      ) : r.referred_customer_id ? (
        <Button size="sm" variant="outline" className="w-full" asChild>
          <Link href={`/app/crm/clientes/${r.referred_customer_id}`}>
            <ExternalLink className="size-4" />
            {tr("Ver lead")}
          </Link>
        </Button>
      ) : (
        <p className="text-xs text-fg-muted">
          {tr(
            r.status === "rejected" ? "Estado final" : "Sin siguiente acción",
          )}
        </p>
      )}
    </article>
  );
}
