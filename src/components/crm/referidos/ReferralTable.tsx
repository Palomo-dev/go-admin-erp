"use client";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Gift,
  HandCoins,
  Phone,
  Star,
  XCircle,
} from "lucide-react";
import { DataTable, Pagination } from "@/components/kit";
import { Button } from "@/components/crm/red/RedButton";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { formatDateInTz } from "@/lib/utils/dateDisplay";
import { describeReward } from "@/lib/services/crm/referralReward";
import { nextReferralStatuses } from "@/lib/services/crm/referralStateMachine";
import type { ReferralView } from "@/lib/services/crm/referralsService";
import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "../red/useRedText";
import { ReferralCard } from "./ReferralCard";
import { REFERRAL_STATUS_META, ReferralStatusBadge } from "./referralMeta";

interface Props {
  rows: ReferralView[];
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  currency: string | null;
  canManage: boolean;
  canRegister: boolean;
  busyId: string | null;
  onTransition: (row: ReferralView, to: "contacted" | "qualified") => void;
  onReject: (row: ReferralView) => void;
  onConvert: (row: ReferralView) => void;
  onPay: (row: ReferralView) => void;
}
export function ReferralTable(p: Props) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const { timezone } = useFormatDate();
  const formatDate = (
    value: string | null | undefined,
    options: Intl.DateTimeFormatOptions,
  ) => formatDateInTz(value, timezone, { ...options, locale });
  const step = (row: ReferralView) => {
    const next = nextReferralStatuses(row.status);
    const forward = next.find((s) => s === "contacted" || s === "qualified");
    if (forward && p.canManage)
      return (
        <Button
          id={`referral-row-${row.id}-${forward}`}
          size="sm"
          variant="outline"
          disabled={p.busyId === row.id}
          onClick={() =>
            p.onTransition(row, forward as "contacted" | "qualified")
          }
        >
          {forward === "contacted" ? (
            <Phone className="size-4" />
          ) : (
            <Star className="size-4" />
          )}
          {tr(REFERRAL_STATUS_META[forward].action)}
        </Button>
      );
    if (next.includes("converted") && p.canRegister)
      return (
        <Button
          id={`referral-row-${row.id}-converted`}
          size="sm"
          disabled={p.busyId === row.id}
          onClick={() => p.onConvert(row)}
        >
          <ArrowRight className="size-4" />
          {tr("Convertir en lead")}
        </Button>
      );
    if (
      row.status === "converted" &&
      row.program_id &&
      !row.reward_paid &&
      p.canManage
    )
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={p.busyId === row.id}
          onClick={() => p.onPay(row)}
        >
          <HandCoins className="size-4" />
          {tr("Registrar pago")}
        </Button>
      );
    if (row.status === "rejected")
      return (
        <span className="text-xs text-fg-muted">{tr("Estado final")}</span>
      );
    if (row.referred_customer_id)
      return (
        <Link
          href={`/app/crm/clientes/${row.referred_customer_id}`}
          className="inline-flex items-center gap-2 text-fg hover:underline"
        >
          <ExternalLink className="size-4" />
          {tr("Ver lead")}
        </Link>
      );
    return <span className="text-fg-muted">—</span>;
  };
  return (
    <DataTable
      etiqueta={tr("Referidos")}
      className="max-lg:mt-3 [&_th]:h-[60px] [&_td]:h-[81px]"
      pieFuera
      filas={p.rows}
      obtenerId={(r) => r.id}
      etiquetaFila={(r) => r.referred_name}
      columnas={[
        {
          id: "person",
          encabezado: tr("Referido"),
          celda: (r) => (
            <div>
              <p className="font-medium">
                {r.referred_customer_id ? (
                  <Link
                    className="text-fg hover:underline"
                    href={`/app/crm/clientes/${r.referred_customer_id}`}
                  >
                    {r.referred_name}
                  </Link>
                ) : (
                  r.referred_name
                )}
              </p>
              <p className="mt-0.5 text-xs text-fg-secondary">
                {r.referred_email ?? r.referred_phone}
              </p>
            </div>
          ),
        },
        {
          id: "referrer",
          encabezado: tr("Referido por"),
          celda: (r) =>
            r.referrer ? (
              <Link
                className="text-fg hover:underline"
                href={`/app/crm/clientes/${r.referrer.id}`}
              >
                {r.referrer.full_name}
              </Link>
            ) : (
              "—"
            ),
        },
        {
          id: "program",
          encabezado: tr("Programa"),
          celda: (r) => (
            <div>
              <p>{r.program?.name ?? tr("Sin programa")}</p>
              <p className="mt-0.5 text-xs text-fg-secondary">
                {describeReward(r.program, p.currency, {
                  locale,
                  translate: tr,
                })?.summary ?? tr("Sin recompensa")}
              </p>
            </div>
          ),
        },
        {
          id: "status",
          encabezado: tr("Estado"),
          celda: (r) => <ReferralStatusBadge status={r.status} />,
        },
        {
          id: "reward",
          encabezado: tr("Recompensa"),
          celda: (r) => (
            <div>
              <p>
                {r.status === "converted" && r.program
                  ? describeReward(r.program, p.currency, {
                      locale,
                      translate: tr,
                    })?.amount ||
                    describeReward(r.program, p.currency, {
                      locale,
                      translate: tr,
                    })?.type
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-fg-secondary">
                {r.status === "converted" && r.program
                  ? r.reward_paid
                    ? tr("Pagada el {p0}", {
                        p0: formatDate(r.reward_paid_at, {
                          day: "numeric",
                          month: "short",
                        }),
                      })
                    : tr("Pendiente de pago")
                  : r.status === "rejected"
                    ? tr("No aplica")
                    : tr("Aún no convertido")}
              </p>
            </div>
          ),
        },
        {
          id: "date",
          encabezado: tr("Registrado"),
          celda: (r) =>
            formatDate(r.created_at, { day: "numeric", month: "short" }),
        },
        { id: "next", encabezado: tr("Siguiente paso"), celda: step },
      ]}
      acciones={(r) => [
        {
          id: "reward",
          etiqueta: tr("Registrar recompensa pagada"),
          icono: Gift,
          onSelect: () => p.onPay(r),
          oculta:
            !p.canManage ||
            r.status !== "converted" ||
            !r.program_id ||
            r.reward_paid,
          deshabilitada: p.busyId === r.id,
        },
        {
          id: "reject",
          etiqueta: tr("Rechazar"),
          icono: XCircle,
          destructiva: true,
          onSelect: () => p.onReject(r),
          oculta:
            !p.canManage ||
            !nextReferralStatuses(r.status).includes("rejected"),
          deshabilitada: p.busyId === r.id,
        },
      ]}
      tarjetaMovil={(r) => (
        <div>
          <ReferralCard
            referral={r}
            currency={p.currency}
            canManage={p.canManage}
            canRegister={p.canRegister}
            busy={p.busyId === r.id}
            onTransition={p.onTransition}
            onReject={p.onReject}
            onConvert={p.onConvert}
            onMarkPaid={p.onPay}
          />
        </div>
      )}
      pie={
        <div className={p.total <= p.size ? "hidden lg:block" : undefined}>
          <Pagination
            pagina={p.page}
            tamano={p.size}
            total={p.total}
            onPaginaChange={p.onPage}
            onTamanoChange={p.onSize}
          />
        </div>
      }
    />
  );
}
