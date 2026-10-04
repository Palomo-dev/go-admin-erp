"use client";

import { useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { useRedText } from "@/components/crm/red/useRedText";

/**
 * Tabla de deals de un partner (datos tabulares reales, brief §3) con
 * `<th scope="col">`, estado con icono + texto, y los botones de transición
 * que la máquina permite, solo si la sesión puede gestionar.
 */

import { Button } from "@/components/crm/red/RedButton";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import {
  nextCommissionStatuses,
  type CommissionStatus,
} from "@/lib/services/crm/partnerCommission";
import type { PartnerDealView } from "@/lib/services/crm/partnerService";
import { formatMoney } from "@/lib/services/crm/partnerModel";
import { cn } from "@/utils/Utils";
import {
  COMMISSION_META,
  CommissionStatusBadge,
  dealTypeLabel,
} from "./partnerMeta";

interface Props {
  deals: PartnerDealView[];
  canManage: boolean;
  busyId: string | null;
  onTransition: (deal: PartnerDealView, to: CommissionStatus) => void;
}

export function dealActionId(dealId: string, status: string): string {
  return `deal-${dealId}-${status}`;
}

export function PartnerDealTable({
  deals,
  canManage,
  busyId,
  onTransition,
}: Props) {
  const { tr } = useRedText();
  const locale = useLocaleIntl();
  const t = useTranslations("crm.partnersVisual");
  const { formatDate, formatDateTime } = useFormatDate();
  const business = (d: PartnerDealView) => (
    <Badge
      tono={
        d.opportunity?.status === "won"
          ? "exito"
          : d.opportunity?.status === "lost"
            ? "peligro"
            : "marca"
      }
      tamano="sm"
    >
      {t(
        d.opportunity?.status === "won"
          ? "ganado"
          : d.opportunity?.status === "lost"
            ? "perdido"
            : "abierto",
      )}
    </Badge>
  );
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{tr("Oportunidad")}</TableHead>
              <TableHead scope="col">{tr("Tipo")}</TableHead>
              <TableHead scope="col">{t("negocio")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("monto")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {tr("Comisión")}
              </TableHead>
              <TableHead scope="col">{t("estadoComision")}</TableHead>
              {canManage && <TableHead scope="col">{tr("Acciones")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <span className="block font-medium text-fg ">
                    {d.opportunity?.name ?? tr("Oportunidad no disponible")}
                  </span>
                  <span className="block text-xs text-fg-secondary ">
                    {formatDate(d.created_at)}
                  </span>
                </TableCell>
                <TableCell className="text-fg ">
                  <Badge
                    tono={
                      d.deal_type === "referral"
                        ? "informacion"
                        : d.deal_type === "co_sell"
                          ? "marca"
                          : "neutro"
                    }
                    tamano="sm"
                  >
                    {tr(dealTypeLabel(d.deal_type))}
                  </Badge>
                </TableCell>
                <TableCell>{business(d)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.opportunity?.amount != null
                    ? formatMoney(
                        d.opportunity.amount,
                        d.opportunity.currency,
                        locale,
                      )
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-medium text-fg ">
                  {formatMoney(
                    d.commission_amount,
                    d.opportunity?.currency ?? null,
                    locale,
                  )}
                </TableCell>
                <TableCell>
                  <CommissionStatusBadge status={d.commission_status} />
                  {d.commission_paid_at && (
                    <span className="block text-xs text-fg-secondary ">
                      {formatDateTime(d.commission_paid_at)}
                    </span>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {nextCommissionStatuses(d.commission_status).map((to) => (
                        <Button
                          key={to}
                          id={dealActionId(d.id, to)}
                          type="button"
                          size="sm"
                          variant={to === "rejected" ? "ghost" : "outline"}
                          disabled={busyId === d.id}
                          className={cn(
                            to === "rejected" && "text-danger-text",
                          )}
                          onClick={() => onTransition(d, to)}
                        >
                          {tr(COMMISSION_META[to].action)}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 lg:hidden">
        {deals.map((d) => (
          <article
            key={d.id}
            className="space-y-2 rounded-xl border border-line bg-surface p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-medium text-fg">
                {d.opportunity?.name ?? tr("Oportunidad no disponible")}
              </p>
              {d.commission_status === "rejected" ? (
                <CommissionStatusBadge status={d.commission_status} />
              ) : (
                business(d)
              )}
            </div>
            <p className="text-xs text-fg-secondary">
              {tr("Comisión")}{" "}
              {formatMoney(
                d.commission_amount,
                d.opportunity?.currency ?? null,
                locale,
              )}
            </p>
            {d.commission_paid_at && (
              <p className="text-xs text-fg-muted">
                {formatDateTime(d.commission_paid_at)}
              </p>
            )}
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {nextCommissionStatuses(d.commission_status).map((to) => (
                  <Button
                    key={to}
                    id={dealActionId(d.id, to).replace("deal-", "deal-mobile-")}
                    type="button"
                    size="sm"
                    variant={to === "rejected" ? "ghost" : "outline"}
                    disabled={busyId === d.id}
                    className={
                      to === "rejected" ? "text-danger-text" : undefined
                    }
                    onClick={() => onTransition(d, to)}
                  >
                    {tr(COMMISSION_META[to].action)}
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
