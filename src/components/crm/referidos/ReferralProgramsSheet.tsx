'use client';

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
    toast({ title: id ? 'Programa actualizado' : 'Programa creado', description: `«${payload.name}»${payload.is_active ? '' : ' (inactivo)'}` });
    setEditing(null);
    setCreating(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast({ title: `«${deleteTarget.name}» eliminado` });
      if (editing?.id === deleteTarget.id) setEditing(null);
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-gray-50 p-0 dark:bg-gray-950 sm:max-w-xl">
        <SheetHeader className="text-left border-b border-gray-200 bg-white px-6 pr-8 py-4 dark:border-gray-800 dark:bg-gray-900">
          <SheetTitle className="text-gray-900 dark:text-gray-100">Programas de referidos</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">Qué recompensa se da, a quién, y si el programa está activo.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{programs.length} programa{programs.length === 1 ? '' : 's'}</h3>
            {canManage && (
              <Button ref={newButtonRef} type="button" size="sm" variant={creating ? 'secondary' : 'outline'} onClick={() => { setEditing(null); setCreating(true); }}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Nuevo programa
              </Button>
            )}
          </div>
          {canManage && creating && (
            <section aria-label="Nuevo programa" className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
              <ReferralProgramForm program={null} currency={currency} idPrefix="program-new" onSave={save} onCancel={() => setCreating(false)} />
            </section>
          )}
          <ul className="space-y-2" aria-label="Programas">
            {programs.map((p) => {
              const reward = describeReward(p, currency);
              const isEditing = editing?.id === p.id;
              return (
                <li key={p.id} className={cn('rounded-xl border bg-white p-4 dark:bg-gray-900', isEditing ? 'border-blue-300 dark:border-blue-800' : 'border-gray-200 dark:border-gray-800')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{reward?.summary}</p>
                      <p className={cn('mt-1 inline-flex items-center gap-1 text-xs font-medium', p.is_active ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-600 dark:text-gray-400')}>
                        {p.is_active ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />}
                        {p.is_active ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                    {/* F12-misc: PATCH/DELETE de programa exige admin/manager; a un Empleado los botones solo le darían un 403. */}
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant={isEditing ? 'secondary' : 'outline'} aria-expanded={isEditing} onClick={() => { setCreating(false); setEditing(isEditing ? null : p); }}>
                          {isEditing ? 'Cerrar' : 'Editar'}
                        </Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Eliminar programa ${p.name}`} className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {canManage && isEditing && (
                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
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
          title="Eliminar programa"
          description={`Se eliminará «${deleteTarget?.name ?? ''}». Los referidos que ya lo tenían quedan sin programa (y sin recompensa que registrar). Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="destructive"
          onConfirm={remove}
          onCloseAutoFocus={onDeleteClose}
        />
      </SheetContent>
    </Sheet>
  );
}
