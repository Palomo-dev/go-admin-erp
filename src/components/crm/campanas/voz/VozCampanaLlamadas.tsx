"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { VozCampanaLlamada } from "@/lib/services/crm/voiceCampaignDetailService";
export function VozCampanaLlamadas({ rows }: { rows: VozCampanaLlamada[] }) {
  const t = useTranslations("crm.campanasVoz");
  const { formatDateTime } = useFormatDate(null);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {["cliente", "estado", "fecha", "duracion"].map((k) => (
              <TableHead key={k}>{t(k)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  className="text-link hover:underline"
                  href={`/app/crm/llamadas?call=${r.id}`}
                >
                  {r.customer_name || t("sinCliente")}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge estado={r.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-fg-secondary">
                {formatDateTime(r.started_at)}
              </TableCell>
              <TableCell className="tabular-nums">
                {r.duration_seconds === undefined || r.duration_seconds === null
                  ? "—"
                  : t("segundos", { n: r.duration_seconds })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
