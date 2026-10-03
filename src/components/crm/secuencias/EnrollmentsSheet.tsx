"use client";
import { useSequenceText } from "./useSequenceText";
import { channelLabel } from "@/lib/services/crm/sequenceTimeline";

/**
 * Panel lateral con las inscripciones de una secuencia (brief UX 6.3).
 * Antes se desplegaban bajo la fila, con UUIDs y estados en inglés.
 * Reanudar y desinscribir siguen llamando a las mismas rutas (F8).
 * Los motivos se traducen con `reasonText` (catálogo probado contra el motor).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  GitBranch,
  LogOut,
  PauseCircle,
  Play,
  PlayCircle,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  DataTable,
  StatusBadge,
  type ColumnaTabla,
} from "@/components/kit";
import { ChipsOpcion } from "@/components/kit/ChipsOpcion";
import { clasesBoton } from "@/components/kit/botonClases";
import { SequenceDeleteDialog } from "./SequenceDeleteDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import {
  fetchEnrollments,
  resumeEnrollment,
  unenroll,
  type EnrollmentView,
  type SequenceView,
} from "./useSequences";
import {
  enrollBlockReason,
  enrollmentTitle,
  reasonText,
} from "./sequenceOptions";

const STATUS: Record<
  EnrollmentView["status"],
  { label: string; icon: typeof PlayCircle; tone: string }
> = {
  active: {
    label: "En curso",
    icon: PlayCircle,
    tone: "text-success-text dark:text-success-text",
  },
  paused: {
    label: "Pausada",
    icon: PauseCircle,
    tone: "text-warning-text dark:text-warning-text",
  },
  completed: {
    label: "Completada",
    icon: CheckCircle2,
    tone: "text-brand-deep dark:text-blue-300",
  },
  exited: {
    label: "Salió",
    icon: XCircle,
    tone: "text-fg-secondary dark:text-fg-secondary",
  },
};

interface Props {
  canManage?: boolean;
  presentacion?: "panel" | "pagina";
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onEnroll: (sequence: SequenceView) => void;
  /** Se incrementa desde fuera para forzar una recarga (tras inscribir). */
  refreshKey: number;
  /** Adónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback?: () => HTMLElement | null;
}

export function EnrollmentsSheet({
  sequence,
  onOpenChange,
  onEnroll,
  refreshKey,
  returnFocusFallback,
  canManage = false,
  presentacion = "panel",
}: Props) {
  const tr = useSequenceText();
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "paused" | "completed"
  >("all");
  const [rows, setRows] = useState<EnrollmentView[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null),
    loadVersion = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [unenrolling, setUnenrolling] = useState<EnrollmentView | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const enrollButtonRef = useRef<HTMLButtonElement>(null);
  const { formatDateTime } = useFormatDate();
  const sequenceId = sequence?.id ?? null;
  // Mismo motivo que la tarjeta: sin pasos activos o inactiva, el botón lo dice.
  const blockReason = sequence ? enrollBlockReason(sequence, tr) : null;
  const onCloseAutoFocus = useReturnFocus(
    sequence !== null,
    returnFocusFallback,
  );
  // Al cerrar la confirmación, «Desinscribir» ya no existe (la fila salió):
  // el foco va a «Inscribir oportunidad», un control, no al contenedor.
  const focusEnrollButton = useCallback(() => enrollButtonRef.current, []);
  const onConfirmCloseAutoFocus = useReturnFocus(
    unenrolling !== null,
    focusEnrollButton,
  );

  const load = useCallback(async () => {
    if (!sequenceId) {
      loadVersion.current++;
      return;
    }
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchEnrollments(sequenceId);
      if (loadVersion.current === version) {
        setRows(result);
        setLoadedFor(sequenceId);
      }
    } catch (err) {
      if (loadVersion.current === version) {
        setError(err instanceof Error ? err.message : "Error desconocido");
        setLoadedFor(sequenceId);
      }
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Tras reanudar, el botón pulsado desaparece: el foco pasa a «Desinscribir»
  // de la misma fila (sigue inscrita) o, si no está, a «Inscribir oportunidad».
  useEffect(() => {
    if (!pendingFocus) return;
    (document.getElementById(pendingFocus) ?? enrollButtonRef.current)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, rows]);

  const mutationPending = useRef(false);
  const act = async (
    fn: () => Promise<void>,
    okTitle: string,
    failTitle: string,
    focusAfter?: string,
  ) => {
    if (!canManage || mutationPending.current) return false;
    mutationPending.current = true;
    setActing(true);
    try {
      await fn();
      toast({ title: okTitle });
      await load();
      if (focusAfter) setPendingFocus(focusAfter);
      return true;
    } catch (err) {
      toast({
        title: failTitle,
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
      return false;
    } finally {
      mutationPending.current = false;
      setActing(false);
    }
  };

  const pageRows = rows.filter(
    (row) =>
      statusFilter === "all" ||
      row.status === statusFilter ||
      (statusFilter === "completed" && row.status === "exited"),
  );
  // The reader returns current_step_id. Resolve it against this sequence's
  // scoped step catalog; deleted or historical unknown IDs remain unavailable.
  const currentStepText = (enrollment: EnrollmentView) => {
    if (enrollment.sequence_id !== sequence?.id || !enrollment.current_step_id)
      return "—";
    const step = sequence.steps?.find(
      (s) => s.id === enrollment.current_step_id,
    );
    return step
      ? `${step.step_number} · ${tr(step.channel === "email" ? "Correo" : channelLabel(step.channel))}`
      : "—";
  };
  const columns: ColumnaTabla<EnrollmentView>[] = [
    {
      id: "customer",
      encabezado: tr("Cliente"),
      celda: (e) => (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-medium text-fg-on-brand"
          >
            {(e.customer_name || enrollmentTitle(e, tr))
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0])
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">
              {e.customer_name || enrollmentTitle(e, tr)}
            </p>
            {e.customer_name && e.opportunity_name && (
              <p className="truncate text-[13px] text-fg-secondary">
                {e.opportunity_name}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "step",
      encabezado: tr("Paso actual"),
      celda: (e) => (
        <span className="text-[13px] text-fg-secondary">
          {currentStepText(e)}
          <span className="mt-0.5 block">
            {reasonText(
              e.status === "paused" ? e.paused_reason : e.exit_reason,
              tr,
            )}
          </span>
        </span>
      ),
    },
    {
      id: "next",
      encabezado: tr("Próximo"),
      celda: (e) => (
        <span className="text-[13px] text-fg-secondary">
          {e.status === "active" && e.next_run_at
            ? formatDateTime(e.next_run_at)
            : "—"}
        </span>
      ),
    },
    {
      id: "status",
      encabezado: tr("Estado"),
      celda: (e) => (
        <StatusBadge
          tipografia="figma"
          estado={e.status}
          etiqueta={tr(STATUS[e.status]?.label ?? STATUS.exited.label)}
          tono={
            e.status === "active"
              ? "exito"
              : e.status === "paused"
                ? "advertencia"
                : "neutro"
          }
        />
      ),
    },
    {
      id: "date",
      encabezado: tr("Inscrito"),
      celda: (e) => (
        <span className="text-[13px] text-fg-secondary">
          {formatDateTime(e.enrolled_at)}
        </span>
      ),
    },
  ];
  const confirmation = (
    <SequenceDeleteDialog
      loading={acting}
      open={unenrolling !== null}
      onOpenChange={(open) => {
        if (!open) setUnenrolling(null);
      }}
      onCloseAutoFocus={onConfirmCloseAutoFocus}
      title={tr("Desinscribir a «{p0}»", {
        p0: unenrolling ? enrollmentTitle(unenrolling, tr) : "",
      })}
      description={tr(
        "Sale de la secuencia y no recibirá más pasos. No se puede deshacer: para volver habría que inscribirla de nuevo desde el principio.",
      )}
      confirmLabel={tr("Desinscribir")}
      variant="destructive"
      onConfirm={async () => {
        if (
          unenrolling &&
          sequenceId &&
          !(await act(
            () => unenroll(sequenceId, unenrolling.id),
            tr("Inscripción finalizada"),
            tr("No se pudo desinscribir"),
          ))
        )
          throw new Error("operacion_no_realizada");
      }}
    />
  );
  const closePage = () => {
    if (acting) return;
    onOpenChange(false);
    requestAnimationFrame(() => {
      onCloseAutoFocus(new Event("close"));
      if (document.activeElement === document.body)
        document.getElementById("seq-search")?.focus();
    });
  };
  if (presentacion === "pagina")
    return (
      <div
        className="space-y-4 bg-canvas p-4 sm:p-6"
        data-figma-node="1406:118109"
      >
        <PageHeader
          titulo={`${sequence?.name ?? ""} · ${tr("Inscripciones")}`}
          icono={GitBranch}
          subtitulo={tr("Quién está dentro de la secuencia y en qué estado.")}
          volverA="/app/crm/secuencias"
          onVolver={() => {
            closePage();
          }}
          migas={[{ etiqueta: "CRM" }, { etiqueta: tr("Secuencias") }]}
          movil={{
            ocultarBarra: true,
            accion:
              sequence && canManage ? (
                <button
                  type="button"
                  aria-label={tr("Inscribir oportunidad")}
                  className={clasesBoton({ patron: "button", tamano: "sm" })}
                  disabled={acting || !!blockReason}
                  onClick={() => onEnroll(sequence)}
                >
                  <UserPlus className="size-4" />
                </button>
              ) : undefined,
          }}
          acciones={
            <>
              <button
                type="button"
                className={clasesBoton({
                  patron: "button",
                  variante: "secundario",
                })}
                disabled={acting}
                onClick={closePage}
              >
                {tr("Volver")}
              </button>
              {sequence && canManage && (
                <Button
                  ref={enrollButtonRef}
                  disabled={!!blockReason || acting}
                  onClick={() => onEnroll(sequence)}
                >
                  <UserPlus className="mr-1.5 size-4" />
                  {tr("Inscribir oportunidad")}
                </Button>
              )}
            </>
          }
        />
        <ChipsOpcion
          etiqueta={tr("Filtrar por estado")}
          valor={statusFilter}
          onValorChange={setStatusFilter}
          opciones={[
            { valor: "active", etiqueta: tr("Activos") },
            { valor: "paused", etiqueta: tr("Pausadas") },
            { valor: "completed", etiqueta: tr("Terminados") },
            { valor: "all", etiqueta: tr("Todos") },
          ]}
        />
        <DataTable
          columnas={columns}
          filas={pageRows}
          obtenerId={(row) => row.id}
          etiqueta={tr("Inscripciones")}
          densidad="compacta"
          estado={
            loading || loadedFor !== sequenceId
              ? "cargando"
              : error
                ? "error"
                : "listo"
          }
          onReintentar={() => void load()}
          tarjetaMovil={(e) => (
            <div className="space-y-2 p-3">
              <p className="font-medium text-fg">{enrollmentTitle(e, tr)}</p>
              <p className="text-xs text-fg-secondary">
                {tr(STATUS[e.status]?.label ?? STATUS.exited.label)} ·{" "}
                {formatDateTime(e.enrolled_at)}
              </p>
              <p className="text-xs text-fg-secondary">
                {tr("Paso actual")}: {currentStepText(e)}
              </p>
              {e.next_run_at && (
                <p className="text-xs text-fg-secondary">
                  {formatDateTime(e.next_run_at)}
                </p>
              )}
            </div>
          )}
          acciones={(e) => [
            ...(e.status === "paused"
              ? [
                  {
                    id: "resume",
                    etiqueta: tr("Reanudar"),
                    icono: Play,
                    deshabilitada: !canManage || acting,
                    onSelect: () => {
                      if (sequenceId)
                        void act(
                          () => resumeEnrollment(sequenceId, e.id),
                          tr("Inscripción reanudada"),
                          tr("No se pudo reanudar"),
                        );
                    },
                  },
                ]
              : []),
            ...(["active", "paused"].includes(e.status)
              ? [
                  {
                    id: "leave",
                    etiqueta: tr("Desinscribir"),
                    icono: LogOut,
                    destructiva: true,
                    deshabilitada: !canManage || acting,
                    onSelect: () => setUnenrolling(e),
                  },
                ]
              : []),
          ]}
        />
        {confirmation}
      </div>
    );

  return (
    <Sheet open={sequence !== null} onOpenChange={onOpenChange}>
      <SheetContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex w-full flex-col gap-4 overflow-y-auto border-line bg-surface dark:border-line-strong dark:bg-surface sm:max-w-lg"
      >
        <SheetHeader>
          {/* `text-foreground` del kit no tiene variable definida aquí: el color va en un span propio. */}
          <SheetTitle>
            <span className="text-fg dark:text-fg">
              {tr("Inscripciones de «")}
              {sequence?.name ?? ""}»
            </span>
          </SheetTitle>
          <SheetDescription>
            <span className="text-fg-secondary dark:text-fg-secondary">
              {tr(
                "Quién está dentro de la secuencia y en qué estado. Reanudar una pausada vuelve a programar envíos reales y deja de contar como «pausada por respuesta» en la tarjeta.",
              )}
            </span>
          </SheetDescription>
        </SheetHeader>

        {sequence && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={enrollButtonRef}
              className="w-fit bg-brand text-white hover:bg-brand-deep"
              onClick={() => onEnroll(sequence)}
              disabled={blockReason !== null || !canManage}
              aria-describedby={blockReason ? "enroll-block-reason" : undefined}
            >
              <UserPlus
                strokeWidth={1.5}
                className="mr-1.5 h-4 w-4"
                aria-hidden="true"
              />{" "}
              {tr("Inscribir oportunidad")}
            </Button>
            {blockReason && (
              <p
                id="enroll-block-reason"
                className="text-xs text-fg-secondary dark:text-fg-secondary"
              >
                {blockReason}
              </p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-danger-text dark:text-danger-text"
          >
            {error}
          </p>
        )}

        {loading || loadedFor !== sequenceId ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-fg-secondary dark:border-line-strong dark:text-fg-secondary">
            {tr(
              "Nadie está inscrito todavía. Inscribe una oportunidad para que empiece a recibir los pasos.",
            )}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((e) => {
              const s = STATUS[e.status] ?? STATUS.exited;
              const Icon = s.icon;
              const title = enrollmentTitle(e, tr);
              const why = reasonText(
                e.status === "paused" ? e.paused_reason : e.exit_reason,
                tr,
              );
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-start justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg dark:text-fg">
                      {title}
                    </p>
                    {e.customer_name && e.opportunity_name && (
                      <p className="truncate text-xs text-fg-secondary dark:text-fg-secondary">
                        {e.customer_name}
                      </p>
                    )}
                    <p
                      className={`mt-0.5 flex items-center gap-1 text-xs ${s.tone}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {tr(s.label)}
                      {why ? tr(" · {p0}", { p0: why }) : ""}
                    </p>
                    <p className="text-xs text-fg-secondary">
                      {tr("Paso actual")}: {currentStepText(e)}
                    </p>
                    <p className="text-xs text-fg-secondary dark:text-fg-secondary">
                      {tr("Inscrita el")}
                      {formatDateTime(e.enrolled_at)}
                      {e.status === "active" && e.next_run_at
                        ? tr(" · siguiente paso {p0}", {
                            p0: formatDateTime(e.next_run_at),
                          })
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {e.status === "paused" && sequenceId && (
                      <Button
                        disabled={!canManage || acting}
                        size="sm"
                        variant="outline"
                        aria-label={tr("Reanudar la inscripción de {p0}", {
                          p0: title,
                        })}
                        onClick={() =>
                          void act(
                            () => resumeEnrollment(sequenceId, e.id),
                            tr("Inscripción reanudada"),
                            tr("No se pudo reanudar"),
                            `enr-${e.id}-unenroll`,
                          )
                        }
                      >
                        <Play
                          strokeWidth={1.5}
                          className="mr-1 h-3.5 w-3.5"
                          aria-hidden="true"
                        />{" "}
                        {tr("Reanudar")}
                      </Button>
                    )}
                    {(e.status === "active" || e.status === "paused") &&
                      sequenceId && (
                        <Button
                          disabled={!canManage || acting}
                          id={`enr-${e.id}-unenroll`}
                          size="sm"
                          variant="ghost"
                          aria-label={tr("Desinscribir a {p0}", { p0: title })}
                          onClick={() => setUnenrolling(e)}
                        >
                          <LogOut
                            strokeWidth={1.5}
                            className="mr-1 h-3.5 w-3.5"
                            aria-hidden="true"
                          />{" "}
                          {tr("Desinscribir")}
                        </Button>
                      )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Desinscribir es irreversible (exited/manual_unenroll): se confirma con el nombre (brief §3). */}
        <SequenceDeleteDialog
          loading={acting}
          open={unenrolling !== null}
          onOpenChange={(open) => {
            if (!open) setUnenrolling(null);
          }}
          onCloseAutoFocus={onConfirmCloseAutoFocus}
          title={tr("Desinscribir a «{p0}»", {
            p0: unenrolling ? enrollmentTitle(unenrolling, tr) : "",
          })}
          description={tr(
            "Sale de la secuencia y no recibirá más pasos. No se puede deshacer: para volver habría que inscribirla de nuevo desde el principio.",
          )}
          confirmLabel={tr("Desinscribir")}
          variant="destructive"
          onConfirm={async () => {
            if (unenrolling && sequenceId)
              if (
                !(await act(
                  () => unenroll(sequenceId, unenrolling.id),
                  tr("Inscripción finalizada"),
                  tr("No se pudo desinscribir"),
                ))
              )
                throw new Error("operacion_no_realizada");
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
