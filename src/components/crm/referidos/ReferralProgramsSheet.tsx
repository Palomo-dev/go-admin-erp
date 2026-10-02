'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Programas de referidos en hoja lateral: lista (activo/inactivo con icono +
 * texto), editar en su sitio, crear uno nuevo y borrar con confirmación que
 * nombra el programa. Reutiliza `ReferralProgramForm` (el mismo de la
 * tarjeta de configuración).
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleOff, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { ReferralProgram } from '@/lib/services/crm/referralsService';
import { describeReward } from '@/lib/services/crm/referralReward';
import { cn } from '@/utils/Utils';
import { ReferralProgramForm, type ProgramFormPayload } from './ReferralProgramForm';

interface Props {
  open: boolean;
  programs: ReferralProgram[];
  currency: string | null;
  /** F12-misc: `can_manage` del GET de programas (misma función que partners); un Empleado solo lee. */
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ProgramFormPayload, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  returnFocusFallback: () => HTMLElement | null;
}

export function ReferralProgramsSheet({ open, programs, currency, canManage, onOpenChange, onSave, onDelete, returnFocusFallback }: Props) {
  const {tr, locale} = useRedText();
  const [editing, setEditing] = useState<ReferralProgram | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReferralProgram | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const onDeleteClose = useReturnFocus(deleteTarget !== null, () => newButtonRef.current);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setCreating(canManage && programs.length === 0);
  }, [open, canManage, programs.length]);

  const save = async (payload: ProgramFormPayload, id?: string) => {
    await onSave(payload, id);
    toast({ title: id ? tr("Programa actualizado") : tr("Programa creado"), description: `«${payload.name}»${payload.is_active ? '' : ' (inactivo)'}` });
    setEditing(null);
    setCreating(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast({ title: tr("«{p0}» eliminado", {p0: deleteTarget.name}) });
      if (editing?.id === deleteTarget.id) setEditing(null);
    } catch (err) {
      toast({ title: tr("No se pudo eliminar"), description: err instanceof Error ? err.message : tr("Error desconocido"), variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-subtle p-0  sm:max-w-xl">
        <SheetHeader className="text-left border-b border-line bg-surface px-6 pr-8 py-4  ">
          <SheetTitle className="text-fg ">{tr("Programas de referidos")}</SheetTitle>
          <SheetDescription className="text-fg-secondary ">{tr("Qué recompensa se da, a quién, y si el programa está activo.")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg ">{programs.length}  {tr("programa")}{programs.length === 1 ? '' : 's'}</h3>
            {canManage && (
              <Button ref={newButtonRef} type="button" size="sm" variant={creating ? 'secondary' : 'outline'} onClick={() => { setEditing(null); setCreating(true); }}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />  {tr("Nuevo programa")} </Button>
            )}
          </div>
          {canManage && creating && (
            <section aria-label={tr("Nuevo programa")} className="rounded-xl border border-blue-200 bg-surface p-4 dark:border-blue-900 ">
              <ReferralProgramForm program={null} currency={currency} idPrefix="program-new" onSave={save} onCancel={() => setCreating(false)} />
            </section>
          )}
          <ul className="space-y-2" aria-label={tr("Programas")}>
            {programs.map((p) => {
              const reward = describeReward(p, currency, {locale, translate: tr});
              const isEditing = editing?.id === p.id;
              return (
                <li key={p.id} className={cn('rounded-xl border bg-surface p-4 ', isEditing ? 'border-blue-300 dark:border-blue-800' : 'border-line ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg ">{p.name}</p>
                      <p className="text-xs text-fg-secondary ">{reward?.summary}</p>
                      <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-medium', p.is_active ? 'text-emerald-800 dark:text-emerald-200' : 'text-fg-secondary ')}>
                        {p.is_active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />}
                        {p.is_active ? tr("Activo") : tr("Inactivo")}
                      </p>
                    </div>
                    {/* F12-misc: PATCH/DELETE de programa exige admin/manager; a un Empleado los botones solo le darían un 403. */}
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant={isEditing ? 'secondary' : 'outline'} aria-expanded={isEditing} onClick={() => { setCreating(false); setEditing(isEditing ? null : p); }}>
                          {isEditing ? tr("Cerrar") : tr("Editar")}
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={tr("Eliminar programa {p0}", {p0: p.name})} className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {canManage && isEditing && (
                    <div className="mt-4 border-t border-line pt-4 ">
                      <ReferralProgramForm program={p} currency={currency} idPrefix={`program-${p.id}`} onSave={save} onCancel={() => setEditing(null)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          title={tr("Eliminar programa")}
          description={tr("Se eliminará «{p0}». Los referidos que ya lo tenían quedan sin programa (y sin recompensa que registrar). Esta acción no se puede deshacer.", {p0: deleteTarget?.name ?? ''})}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={remove}
          onCloseAutoFocus={onDeleteClose}
        />
      </SheetContent>
    </Sheet>
  );
}
