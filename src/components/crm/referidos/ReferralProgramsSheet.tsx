"use client";

import { localeIntl } from "@/components/kit/idioma";
import { useRedText } from "@/components/crm/red/useRedText";

/**
 * Programas de referidos en hoja lateral: lista (activo/inactivo con icono +
 * texto), editar en su sitio, crear uno nuevo y borrar con confirmación que
 * nombra el programa. Reutiliza `ReferralProgramForm` (el mismo de la
 * tarjeta de configuración).
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/crm/red/RedButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/use-toast";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import type { ReferralProgram } from "@/lib/services/crm/referralsService";
import { describeReward } from "@/lib/services/crm/referralReward";
import { cn } from "@/utils/Utils";
import { StatusBadge, RowActionsMenu } from "@/components/kit";
import {
  ReferralProgramForm,
  type ProgramFormPayload,
} from "./ReferralProgramForm";

interface Props {
  open: boolean;
  programs: ReferralProgram[];
  currency: string | null;
  /** F12-misc: `can_manage` del GET de programas (misma función que partners); un Empleado solo lee. */
  canManage: boolean;
  referralCounts?: Record<string, number>;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ProgramFormPayload, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  returnFocusFallback: () => HTMLElement | null;
}

export function ReferralProgramsSheet({
  open,
  programs,
  currency,
  canManage,
  referralCounts = {},
  onOpenChange,
  onSave,
  onDelete,
  returnFocusFallback,
}: Props) {
  const { tr, locale: language } = useRedText();
  const locale = localeIntl(language);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ReferralProgram | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReferralProgram | null>(
    null,
  );
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const onDeleteClose = useReturnFocus(
    deleteTarget !== null,
    () => newButtonRef.current,
  );

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setCreating(canManage && programs.length === 0);
  }, [open, canManage, programs.length]);

  const save = async (payload: ProgramFormPayload, id?: string) => {
    await onSave(payload, id);
    toast({
      title: id ? tr("Programa actualizado") : tr("Programa creado"),
      description: `«${payload.name}»${payload.is_active ? "" : " (inactivo)"}`,
    });
    setEditing(null);
    setCreating(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast({ title: tr("«{p0}» eliminado", { p0: deleteTarget.name }) });
      if (editing?.id === deleteTarget.id) setEditing(null);
    } catch (err) {
      toast({
        title: tr("No se pudo eliminar"),
        description:
          err instanceof Error ? err.message : tr("Error desconocido"),
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <SheetContent
        side="right"
        onCloseAutoFocus={onCloseAutoFocus}
        overlayClassName="bg-black/40 backdrop-blur-none"
        className="flex w-full flex-col gap-0 overflow-y-auto bg-surface p-0 sm:max-w-[520px]"
      >
        <SheetHeader className="text-left border-b border-transparent bg-surface px-6 pr-8 py-4 pt-6 pb-4">
          <SheetTitle className="text-lg leading-[25px] text-fg">
            {tr("Programas de referidos")}
          </SheetTitle>
          <SheetDescription className="max-w-[400px] text-fg-secondary">
            {tr("Qué recompensa se da, a quién, y si el programa está activo.")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg ">
              {programs.length} {tr("programa")}
              {programs.length === 1 ? "" : "s"}
            </h3>
            {canManage && (
              <Button
                ref={newButtonRef}
                type="button"
                size="sm"
                variant={creating ? "secondary" : "outline"}
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />{" "}
                {tr("Nuevo programa")}{" "}
              </Button>
            )}
          </div>
          {canManage && creating && (
            <section
              aria-label={tr("Nuevo programa")}
              className="flex flex-1 flex-col pt-4"
            >
              <ReferralProgramForm
                program={null}
                currency={currency}
                diseno="kit"
                onSavingChange={setSaving}
                idPrefix="program-new"
                onSave={save}
                onCancel={() => setCreating(false)}
              />
            </section>
          )}
          <ul className="space-y-4" aria-label={tr("Programas")}>
            {programs.map((p) => {
              const reward = describeReward(p, currency, {
                locale,
                translate: tr,
              });
              const isEditing = editing?.id === p.id;
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {p.name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-fg-secondary">
                      {reward?.summary}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-fg-secondary">
                    {referralCounts[p.id] ?? 0} {tr("referidos")}
                  </span>
                  <StatusBadge
                    estado={p.is_active ? "active" : "inactive"}
                    etiqueta={tr(p.is_active ? "Activo" : "Inactivo")}
                    tipografia="figma"
                    apariencia={p.is_active ? "contorno" : "suave"}
                  />
                </>
              );
              return (
                <li
                  key={p.id}
                  className={cn(
                    "relative rounded-lg border",
                    isEditing
                      ? "border-line-brand bg-brand-tint"
                      : "border-line bg-surface",
                  )}
                >
                  {canManage ? (
                    <button
                      type="button"
                      aria-label={tr("Editar {p0}", { p0: p.name })}
                      aria-expanded={isEditing}
                      disabled={saving}
                      onClick={() => {
                        setCreating(false);
                        setEditing(isEditing ? null : p);
                      }}
                      className="flex h-[66px] w-full items-center gap-3 rounded-lg px-3.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex h-[66px] items-center gap-3 px-3.5">
                      {content}
                    </div>
                  )}
                  {canManage && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <RowActionsMenu
                        titulo={p.name}
                        acciones={[
                          {
                            id: "delete",
                            etiqueta: tr("Eliminar programa {p0}", {
                              p0: p.name,
                            }),
                            icono: Trash2,
                            destructiva: true,
                            deshabilitada: saving,
                            onSelect: () => setDeleteTarget(p),
                          },
                        ]}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {canManage && editing && (
            <section
              className="flex flex-1 flex-col gap-4 pt-4"
              aria-label={`${tr("Editar")} ${editing.name}`}
            >
              <h3 className="text-base font-semibold text-fg">
                {tr("Editar")} «{editing.name}»
              </h3>
              <ReferralProgramForm
                program={editing}
                currency={currency}
                diseno="kit"
                onSavingChange={setSaving}
                idPrefix={`program-${editing.id}`}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            </section>
          )}
        </div>
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
          title={tr("Eliminar programa")}
          description={tr(
            "Se eliminará «{p0}». Los referidos que ya lo tenían quedan sin programa (y sin recompensa que registrar). Esta acción no se puede deshacer.",
            { p0: deleteTarget?.name ?? "" },
          )}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={remove}
          onCloseAutoFocus={onDeleteClose}
        />
      </SheetContent>
    </Sheet>
  );
}
