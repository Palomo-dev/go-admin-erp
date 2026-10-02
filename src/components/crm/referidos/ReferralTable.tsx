"use client";
import Link from "next/link";
import { Gift, XCircle } from "lucide-react";
import { DataTable, Pagination, StatusBadge } from "@/components/kit";
import { Button } from "@/components/crm/red/RedButton";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { describeReward } from "@/lib/services/crm/referralReward";
import { nextReferralStatuses } from "@/lib/services/crm/referralStateMachine";
import type { ReferralView } from "@/lib/services/crm/referralsService";
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
  const { tr, locale } = useRedText();
  const { formatDate } = useFormatDate();
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
          {tr("Registrar recompensa pagada")}
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
          className="text-brand-deep hover:underline"
        >
          {tr("Ver lead")}
        </Link>
      );
    return <span className="text-fg-muted">—</span>;
  };
  return (
    <DataTable
      etiqueta={tr("Referidos")}
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
                    className="text-brand-deep hover:underline"
                    href={`/app/crm/clientes/${r.referred_customer_id}`}
                  >
                    {r.referred_name}
                  </Link>
                ) : (
                  r.referred_name
                )}
              </p>
              <p className="text-xs text-fg-muted">
                {r.referred_email ?? r.referred_phone}
              </p>
            </div>
          ),
        },
        {
          id: "referrer",
          encabezado: tr("Referidor"),
          celda: (r) =>
            r.referrer ? (
              <Link
                className="text-brand-deep hover:underline"
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
              <p>{r.program?.name ?? "—"}</p>
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
          celda: (r) =>
            r.status === "converted" && r.program ? (
              <div>
                <p className="text-xs">
                  {describeReward(r.program, p.currency, {
                    locale,
                    translate: tr,
                  })?.summary ?? tr("Sin recompensa")}
                </p>
                <StatusBadge
                  estado={r.reward_paid ? "paid" : "pending"}
                  etiqueta={tr(r.reward_paid ? "Pagada" : "Pendiente")}
                  tono={r.reward_paid ? "exito" : "neutro"}
                />
              </div>
            ) : (
              <span className="text-fg-muted">—</span>
            ),
        },
        {
          id: "date",
          encabezado: tr("Registrado"),
          celda: (r) => formatDate(r.created_at),
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
        <ul className="list-none">
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
        </ul>
      )}
      pie={
        <Pagination
          pagina={p.page}
          tamano={p.size}
          total={p.total}
          onPaginaChange={p.onPage}
          onTamanoChange={p.onSize}
        />
      }
    />
  );
}
