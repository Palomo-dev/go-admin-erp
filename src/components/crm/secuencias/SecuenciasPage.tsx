"use client";
import { useSequenceText } from "./useSequenceText";

/**
 * /app/crm/secuencias — secuencias multicanal (FASE-08 §5.1, rediseño UX
 * brief 6.3). Tabla en escritorio y tarjetas en móvil, inscritos activos y
 * tasa de respuesta; búsqueda y chips de filtro arriba; editor en línea de
 * tiempo vertical; inscripción con advertencia de envíos reales.
 *
 * Toda la lógica sigue en las rutas de `src/app/api/crm/sequences/**` y en
 * `sequenceService.ts` (F8): aquí solo hay presentación.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, GitBranch } from "lucide-react";
import { KbdButton as Button } from "@/components/kit/KbdButton";
import { EmptyState } from "@/components/kit/EmptyState";
import { SequenceDeleteDialog } from "./SequenceDeleteDialog";
import { SequencesTable } from "./SequencesTable";
import { PageHeader, StatCard, useEsEscritorio } from "@/components/kit";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import {
  AnimatePresence,
  StaggerItem,
  StaggerList,
} from "@/components/shared/motion";
import { SequenceCard } from "./SequenceCard";
import { SequenceEmptyState } from "./SequenceEmptyState";
import { ChipsOpcion } from "@/components/kit/ChipsOpcion";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { useInPageEditorNavigation } from "@/components/crm/acciones/useInPageEditorNavigation";
import { SequenceEditorDialog } from "./SequenceEditorDialog";
import { EnrollDialog } from "./EnrollDialog";
import { EnrollmentsSheet } from "./EnrollmentsSheet";
import { useSequences, type SequenceView } from "./useSequences";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import { SearchInput } from "@/components/kit/SearchInput";

type StatusFilter = "all" | "active" | "inactive";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Inactivas" },
];

export function SecuenciasPage() {
  const tr = useSequenceText();
  const {
    sequences,
    loading,
    error,
    reload,
    save,
    toggle,
    remove,
    enroll,
    canManage,
    summary,
    organizationId,
  } = useSequences();
  const desktop = useEsEscritorio(),
    pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SequenceView | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<SequenceView | null>(null);
  const [sheetTarget, setSheetTarget] = useState<SequenceView | null>(null);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [deleting, setDeleting] = useState<SequenceView | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  // Si el botón que abrió un diálogo ya no existe al cerrarlo (la tarjeta se
  // filtró o se borró), el foco va a «Nueva secuencia», nunca al body.
  const focusFallback = useCallback(() => newButtonRef.current, []);
  // La confirmación de borrado devuelve el foco por `onCloseAutoFocus` del
  // `ConfirmDialog`, como `EnrollmentsSheet` (antes: sondeo de hasta 3 s).
  const onDeleteCloseAutoFocus = useReturnFocus(deleting !== null, focusFallback);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sequences.filter((s) => {
      if (status === "active" && !s.is_active) return false;
      if (status === "inactive" && s.is_active) return false;
      return (
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [sequences, query, status]);

  useEffect(() => {
    setEditing(null);
    setEditorOpen(false);
    setEnrollTarget(null);
    setSheetTarget(null);
    setDeleting(null);
    setQuery("");
    setStatus("all");
  }, [organizationId]);
  const editorBusy = useRef(false);
  const editorScope = useRef(organizationId);
  editorScope.current = organizationId;
  useEffect(() => {
    editorBusy.current = false;
  }, [organizationId]);
  const editorNavigation = useInPageEditorNavigation({
    pathname: "/app/crm/secuencias",
    ready: !loading,
    canManage,
    scope: organizationId,
    blocked: () => editorBusy.current,
    onTarget: (target) => {
      if (!target) {
        setEditorOpen(false);
        return;
      }
      const sequence =
        target === "new" ? null : sequences.find((s) => s.id === target);
      if (sequence === undefined) {
        setEditorOpen(false);
        return;
      }
      setEditing(sequence);
      setEditorOpen(true);
    },
  });
  const openCreate = () => {
    if (canManage) editorNavigation.open("new");
  };

  const runAction = async (fn: () => Promise<unknown>, okTitle: string) => {
    if (!canManage || pending.current) return false;
    pending.current = true;
    setBusy(true);
    try {
      await fn();
      toast({ title: okTitle });
      // Activar/desactivar con un filtro de estado puesto saca la tarjeta de
      // la rejilla (tras la animación de salida, ≤300 ms) y el `Switch`
      // pulsado desaparece: el foco no se queda en el body.
      window.setTimeout(() => {
        if (document.activeElement === document.body)
          newButtonRef.current?.focus();
      }, 400);
      return true;
    } catch (err) {
      toast({
        title: tr("Operación no realizada"),
        description:
          err instanceof Error ? err.message : tr("Error desconocido"),
        variant: "destructive",
      });
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (sheetTarget)
    return (
      <TooltipProvider delayDuration={300}>
        <EnrollmentsSheet
          presentacion="pagina"
          canManage={canManage}
          sequence={sheetTarget}
          refreshKey={sheetRefresh}
          onOpenChange={(open) => {
            if (!open) setSheetTarget(null);
          }}
          onEnroll={(s) => {
            if (canManage) setEnrollTarget(s);
          }}
          returnFocusFallback={focusFallback}
        />
        <EnrollDialog
          open={enrollTarget !== null && canManage}
          sequence={enrollTarget}
          onOpenChange={(open) => {
            if (!open) setEnrollTarget(null);
          }}
          onEnroll={enroll}
          onDone={async () => {
            setSheetRefresh((n) => n + 1);
            await reload();
          }}
          returnFocusFallback={focusFallback}
        />
      </TooltipProvider>
    );

  if (editorOpen && canManage)
    return (
      <TooltipProvider delayDuration={300}>
        <SequenceEditorDialog
          timezone={summary?.timezone ?? null}
          open={editorOpen && canManage}
          sequence={editing}
          onOpenChange={(open) => {
            if (!open && organizationId === editorScope.current)
              editorNavigation.close();
          }}
          onBusyChange={(busy) => {
            if (organizationId === editorScope.current)
              editorBusy.current = busy;
          }}
          onSave={save}
          returnFocusFallback={focusFallback}
        />
      </TooltipProvider>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4 bg-canvas p-4 sm:p-6">
        <PageHeader
          titulo={tr("Secuencias")}
          subtitulo={tr(
            "Pasos automáticos en el tiempo (correo, WhatsApp, tareas de llamada) hasta que el cliente responda, si así se configura.",
          )}
          icono={GitBranch}
          migas={[
            { etiqueta: "CRM", href: "/app/crm" },
            { etiqueta: tr("Secuencias") },
          ]}
          acciones={
            <div className="flex gap-2">
              <Button
                patron="button"
                variante="secundario"
                onClick={() => void reload()}
                disabled={busy}
                aria-label={tr("Actualizar la lista")} icono={RefreshCw}
              >
                <span className="hidden sm:inline">{tr("Actualizar")}</span>
              </Button>
              {canManage && (
                <Button patron="button" ref={newButtonRef} onClick={openCreate} icono={Plus}>
                  {tr("Nueva secuencia")}
                </Button>
              )}
            </div>
          }
        />
        {(loading || (!error && sequences.length > 0)) && (
          <KpiStrip>
            <StatCard
              etiqueta={tr("Inscritos activos")}
              valor={summary?.active_enrollments ?? "—"}
              cargando={loading}
              varianteCarga="compacta"
            />
            <StatCard
              etiqueta={tr("Pausadas por respuesta")}
              valor={summary?.replied_enrollments ?? "—"}
              cargando={loading}
              varianteCarga="compacta"
            />
            <StatCard
              etiqueta={tr("Reuniones (30 días)")}
              valor={
                summary?.meetings_available
                  ? (summary.meetings_30d ?? "—")
                  : "—"
              }
              cargando={loading}
              varianteCarga="compacta"
            />
            <StatCard
              etiqueta={tr("Pausadas")}
              valor={summary?.paused_enrollments ?? "—"}
              cargando={loading}
              varianteCarga="compacta"
            />
          </KpiStrip>
        )}

        {!loading &&
          !error &&
          sequences.length > 0 &&
          summary &&
          !summary.meetings_available && (
            <p role="note" className="text-xs text-fg-muted">
              {tr(
                "Las reuniones aún no están vinculadas a inscripciones; esta cifra no está disponible.",
              )}
            </p>
          )}

        {!loading && !error && sequences.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={setQuery}
              onValueChange={setQuery}
              placeholder={tr("Buscar por nombre")}
              id="seq-search"
              className="sm:max-w-xs sm:flex-1"
              etiqueta={tr("Buscar secuencia por nombre")}
            />
            <ChipsOpcion
              etiqueta={tr("Filtrar por estado")}
              opciones={FILTERS.map((f) => ({
                valor: f.value,
                etiqueta: tr(f.label),
              }))}
              valor={status}
              onValorChange={setStatus}
            />
            {!loading && (
              <p
                className="text-sm text-fg-muted dark:text-fg-secondary sm:ml-auto"
                aria-live="polite"
              >
                {filtered.length} {tr("de")}
                {sequences.length}
              </p>
            )}
          </div>
        )}

        {error ? (
          <EmptyState
            variante="error"
            accionPrimaria
            className="min-h-[372px] justify-start rounded-xl border border-line bg-surface pt-24 pb-8 [&>div:nth-child(2)]:gap-3 [&>div:last-child:not(:nth-child(2))]:mt-12"
            titulo={tr("No pudimos cargar las secuencias")}
            descripcion={tr(error)}
            onReintentar={() => void reload()}
          />
        ) : loading ? (
          <SequencesTable
            loading
            sequences={[]}
            canManage={false}
            busy={busy}
            onToggle={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onEnroll={() => {}}
            onEnrollments={() => {}}
          />
        ) : filtered.length === 0 ? (
          <SequenceEmptyState
            canManage={canManage}
            filtered={sequences.length > 0}
            onCreate={openCreate}
            onClearFilters={() => {
              setQuery("");
              setStatus("all");
            }}
          />
        ) : desktop ? (
          <SequencesTable
            sequences={filtered}
            canManage={canManage}
            busy={busy}
            onToggle={(s) =>
              void runAction(
                () => toggle(s),
                s.is_active
                  ? tr("Secuencia desactivada")
                  : tr("Secuencia activada"),
              )
            }
            onEdit={(s) => {
              if (canManage) {
                editorNavigation.open(s.id);
              }
            }}
            onDelete={(s) => {
              if (canManage) setDeleting(s);
            }}
            onEnroll={(s) => {
              if (canManage) setEnrollTarget(s);
            }}
            onEnrollments={setSheetTarget}
          />
        ) : (
          <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((sequence) => (
                <StaggerItem key={sequence.id}>
                  <SequenceCard
                    sequence={sequence}
                    canManage={canManage && !busy}
                    onToggle={(s) =>
                      void runAction(
                        () => toggle(s),
                        s.is_active
                          ? tr("Secuencia desactivada")
                          : tr("Secuencia activada"),
                      )
                    }
                    onEnroll={(s) => {
                      if (canManage) setEnrollTarget(s);
                    }}
                    onEnrollments={setSheetTarget}
                    onEdit={(s) => {
                      if (!canManage) return;
                      editorNavigation.open(s.id);
                    }}
                    onDelete={(s) => {
                      if (canManage) setDeleting(s);
                    }}
                  />
                </StaggerItem>
              ))}
            </AnimatePresence>
          </StaggerList>
        )}

        <EnrollDialog
          open={enrollTarget !== null && canManage}
          sequence={enrollTarget}
          onOpenChange={(open) => {
            if (!open) setEnrollTarget(null);
          }}
          onEnroll={enroll}
          onDone={async () => {
            setSheetRefresh((n) => n + 1);
            await reload();
          }}
          returnFocusFallback={focusFallback}
        />

        <EnrollmentsSheet
          canManage={canManage}
          sequence={sheetTarget}
          refreshKey={sheetRefresh}
          onOpenChange={(open) => {
            if (!open) setSheetTarget(null);
          }}
          onEnroll={(s) => {
            if (canManage) setEnrollTarget(s);
          }}
          returnFocusFallback={focusFallback}
        />

        <SequenceDeleteDialog
          loading={busy}
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          onCloseAutoFocus={onDeleteCloseAutoFocus}
          title={tr("Eliminar «{p0}»", { p0: deleting?.name ?? "" })}
          description={tr(
            "Se borra la secuencia y sus pasos. Las inscripciones en curso dejan de avanzar. Esta acción no se puede deshacer.",
          )}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={async () => {
            if (
              deleting &&
              !(await runAction(
                () => remove(deleting.id),
                tr("Secuencia eliminada"),
              ))
            )
              throw new Error("operacion_no_realizada");
          }}
        />
      </div>
    </TooltipProvider>
  );
}
