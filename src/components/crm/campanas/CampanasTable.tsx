"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, Mail, MessageSquare, MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { clasesBoton } from "@/components/kit/botonClases";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { CampanasRespuesta } from "./useCampanasData";
export type CampanaFila = CampanasRespuesta["rows"][number];
export function hrefCampana(c: CampanaFila) {
  return `/app/crm/campanas/${c.id}${c.source === "voice" ? "?tipo=voz" : ""}`;
}
export function CampanasTable({
  data,
  busy,
  onAction,
}: {
  data: CampanasRespuesta;
  busy: boolean;
  onAction: (row: CampanaFila, action: string) => void;
}) {
  const t = useTranslations("crm.campanasNuevo");
  const { formatDateTime } = useFormatDate(null);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              "campana",
              "canal",
              "segmento",
              "estado",
              "progreso",
              "resultado",
              "acciones",
            ].map((k) => (
              <TableHead key={k}>{t(k)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((c) => {
            const Icon =
              c.channel === "voice"
                ? Bot
                : c.channel === "email"
                  ? Mail
                  : MessageSquare;
            return (
              <TableRow key={`${c.source}-${c.id}`}>
                <TableCell>
                  <Link
                    className="font-medium text-fg hover:text-link hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                    href={hrefCampana(c)}
                  >
                    {c.name}
                  </Link>
                  {c.contentName && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t(c.source === "voice" ? "agente" : "plantilla")} ·{" "}
                      {c.contentName}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap text-xs text-fg-secondary">
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`canales.${c.channel}`)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-fg-secondary">
                  {c.segmentName || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    estado={c.status}
                    etiqueta={t(`estados.${c.status}`)}
                  />
                  {c.stoppedReason && (
                    <p className="mt-1 max-w-48 break-words text-xs text-danger-text">
                      {c.stoppedReason}
                    </p>
                  )}
                </TableCell>
                <TableCell className="min-w-44">
                  <div className="mb-1 flex justify-between gap-2 text-xs text-fg-secondary">
                    <span>
                      {c.blockedReasons.length
                        ? t(`bloqueos.${c.blockedReasons[0]}`)
                        : c.scheduledAt
                          ? formatDateTime(c.scheduledAt)
                          : c.progress.total
                            ? t("avance", {
                                done: c.progress.done,
                                total: c.progress.total,
                              })
                            : t("sinProgramar")}
                    </span>
                    <span>{c.progress.pct}%</span>
                  </div>
                  <Progress
                    value={c.progress.pct}
                    aria-label={t("avance", {
                      done: c.progress.done,
                      total: c.progress.total,
                    })}
                    className="h-1.5"
                  />
                </TableCell>
                <TableCell className="min-w-40 text-xs text-fg-secondary">
                  {c.source === "voice"
                    ? t("resultadoVoz", {
                        completed: c.result.completed ?? 0,
                        active: c.result.active ?? 0,
                      })
                    : t("resultadoMensajes", {
                        delivered: c.result.delivered ?? 0,
                        read: c.result.read ?? 0,
                        replied: c.result.replied ?? 0,
                      })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={clasesBoton({
                          variante: "fantasma",
                          tamano: "sm",
                        })}
                        aria-label={t("acciones")}
                        disabled={busy}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={hrefCampana(c)}>{t("detalle")}</Link>
                      </DropdownMenuItem>
                      {data.canManage && (
                        <>
                          {c.source === "voice" &&
                            !["stopped", "completed"].includes(c.status) && (
                              <DropdownMenuItem
                                onSelect={() => onAction(c, "stop")}
                                className="text-danger-text"
                              >
                                {t("detener")}
                              </DropdownMenuItem>
                            )}
                          {c.source === "message" &&
                            ["sending", "scheduled"].includes(c.status) && (
                              <DropdownMenuItem
                                onSelect={() => onAction(c, "pause")}
                              >
                                {t("pausar")}
                              </DropdownMenuItem>
                            )}
                          {c.source === "message" && c.status === "paused" && (
                            <DropdownMenuItem
                              onSelect={() => onAction(c, "resume")}
                            >
                              {t("reanudar")}
                            </DropdownMenuItem>
                          )}
                          {c.source === "message" &&
                            ["sending", "scheduled", "paused"].includes(
                              c.status,
                            ) && (
                              <DropdownMenuItem
                                onSelect={() => onAction(c, "cancel")}
                                className="text-danger-text"
                              >
                                {t("cancelarCampana")}
                              </DropdownMenuItem>
                            )}
                          <DropdownMenuItem
                            onSelect={() => onAction(c, "delete")}
                            disabled={["running", "sending"].includes(c.status)}
                            className="text-danger-text"
                          >
                            {t("eliminar")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
