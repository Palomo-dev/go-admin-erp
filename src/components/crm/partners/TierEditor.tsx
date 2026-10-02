'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Tiers de partner en hoja lateral (sembrados por `fn_crm_seed_defaults`):
 * umbrales (`min_deals`, `min_revenue`), tasa y beneficios, edición en su
 * sitio, alta y borrado con confirmación que nombra el tier (409 si está en
 * uso). La promoción automática usa exactamente estos umbrales.
 */

import { useEffect, useRef, useState } from 'react';
import { Award, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatRate } from '@/lib/services/crm/partnerModel';
import { cn } from '@/utils/Utils';
import { TierForm } from './TierForm';

interface Props {
  open: boolean;
  tiers: PartnerTier[];
  /** F12-misc: mismo booleano que `PartnerList` (`can_manage` del GET de partners); un Empleado solo lee. */
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  returnFocusFallback: () => HTMLElement | null;
}

export function TierEditor({ open, tiers, canManage, onOpenChange, onSave, onDelete, returnFocusFallback }: Props) {
  const {tr, locale} = useRedText();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerTier | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const onDeleteClose = useReturnFocus(deleteTarget !== null, () => newButtonRef.current);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setCreating(canManage && tiers.length === 0);
  }, [open, canManage, tiers.length]);

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      toast({ title: tr("Tier «{p0}» eliminado", {p0: deleteTarget.name}) });
    } catch (err) {
      toast({ title: tr("No se pudo eliminar"), description: err instanceof Error ? err.message : tr("Error desconocido"), variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-subtle p-0  sm:max-w-xl">
        <SheetHeader className="text-left border-b border-line bg-surface px-6 pr-8 py-4  ">
          <SheetTitle className="text-fg ">{tr("Tiers de partner")}</SheetTitle>
          <SheetDescription className="text-fg-secondary ">{tr("Un partner sube de tier automáticamente al registrar un deal si cumple los deals y el revenue mínimos. Nunca baja solo.")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg ">{tiers.length}  {tr("tier")}{tiers.length === 1 ? '' : 's'}, de menor a mayor</h3>
            {canManage && (
              <Button ref={newButtonRef} type="button" size="sm" variant={creating ? 'secondary' : 'outline'} onClick={() => { setEditingId(null); setCreating(true); }}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />  {tr("Nuevo tier")} </Button>
            )}
          </div>
          {canManage && creating && (
            <section aria-label={tr("Nuevo tier")} className="rounded-xl border border-blue-200 bg-surface p-4 dark:border-blue-900 ">
              <TierForm tier={null} onSave={onSave} onCancel={() => setCreating(false)} />
            </section>
          )}
          <ol className="space-y-2" aria-label={tr("Tiers")}>
            {tiers.map((t) => {
              const isEditing = editingId === t.id;
              const benefits = Array.isArray(t.benefits) ? (t.benefits as unknown[]).filter((b): b is string => typeof b === 'string') : [];
              return (
                <li key={t.id} className={cn('rounded-xl border bg-surface p-4 ', isEditing ? 'border-blue-300 dark:border-blue-800' : 'border-line ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-fg "><Award className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />{t.name} · {formatRate(t.commission_rate, locale)}</p>
                      <p className="text-xs text-fg-secondary ">{tr("Desde")} {t.min_deals}  {tr("deal")}{Number(t.min_deals) === 1 ? '' : 's'}  {tr("y")} {new Intl.NumberFormat(locale).format(Number(t.min_revenue))}  {tr("de revenue")}</p>
                      {benefits.length > 0 && <p className="mt-1 text-xs text-fg-secondary ">{benefits.join(' · ')}</p>}
                    </div>
                    {/* F12-misc: PATCH/DELETE de tier exige admin/manager; a un Empleado los botones solo le darían un 403. */}
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant={isEditing ? 'secondary' : 'outline'} aria-expanded={isEditing} onClick={() => { setCreating(false); setEditingId(isEditing ? null : t.id); }}>{isEditing ? tr("Cerrar") : tr("Editar")}</Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={tr("Eliminar tier {p0}", {p0: t.name})} className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {canManage && isEditing && <div className="mt-4 border-t border-line pt-4 "><TierForm tier={t} onSave={onSave} onCancel={() => setEditingId(null)} /></div>}
                </li>
              );
            })}
          </ol>
        </div>
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          title={tr("Eliminar tier")}
          description={tr("Se eliminará el tier «{p0}». Si algún partner lo tiene asignado, no se podrá borrar hasta moverlo a otro.", {p0: deleteTarget?.name ?? ''})}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={remove}
          onCloseAutoFocus={onDeleteClose}
        />
      </SheetContent>
    </Sheet>
  );
}
