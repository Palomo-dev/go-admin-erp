"use client";
import Link from "next/link";
import { AudioLines } from "lucide-react";
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
export function VozCampanaLlamadas({ rows, activas = false }: { rows: VozCampanaLlamada[]; activas?: boolean }) {
  const t = useTranslations("crm.campanasVoz");
  const { formatDateTime } = useFormatDate(null);
  if (activas) return <div className="space-y-2">{rows.map(r => <Link key={r.id} href={`/app/crm/llamadas?call=${r.id}`} className="flex items-center gap-3 rounded-lg border border-line p-3 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><AudioLines className="size-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium leading-5 text-fg">{r.customer_name || t("sinCliente")}</p><p className="mt-0.5 text-xs leading-4 text-fg-secondary">{r.duration_seconds == null ? formatDateTime(r.started_at) : t("segundos", { n: r.duration_seconds })}</p></div><StatusBadge estado={r.status} etiqueta={t.has(`outcomes.${r.status}`) ? t(`outcomes.${r.status}`) : undefined} tipografia="figma" /></Link>)}</div>;
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
