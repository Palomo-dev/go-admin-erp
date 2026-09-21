'use client';

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
      toast({ title: `Tier «${deleteTarget.name}» eliminado` });
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 overflow-y-auto bg-gray-50 p-0 dark:bg-gray-950 sm:max-w-xl">
        <SheetHeader className="text-left border-b border-gray-200 bg-white px-6 pr-8 py-4 dark:border-gray-800 dark:bg-gray-900">
          <SheetTitle className="text-gray-900 dark:text-gray-100">Tiers de partner</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">Un partner sube de tier automáticamente al registrar un deal si cumple los deals y el revenue mínimos. Nunca baja solo.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tiers.length} tier{tiers.length === 1 ? '' : 's'}, de menor a mayor</h3>
            {canManage && (
              <Button ref={newButtonRef} type="button" size="sm" variant={creating ? 'secondary' : 'outline'} onClick={() => { setEditingId(null); setCreating(true); }}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Nuevo tier
              </Button>
            )}
          </div>
          {canManage && creating && (
            <section aria-label="Nuevo tier" className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
              <TierForm tier={null} onSave={onSave} onCancel={() => setCreating(false)} />
            </section>
          )}
          <ol className="space-y-2" aria-label="Tiers">
            {tiers.map((t) => {
              const isEditing = editingId === t.id;
              const benefits = Array.isArray(t.benefits) ? (t.benefits as unknown[]).filter((b): b is string => typeof b === 'string') : [];
              return (
                <li key={t.id} className={cn('rounded-xl border bg-white p-4 dark:bg-gray-900', isEditing ? 'border-blue-300 dark:border-blue-800' : 'border-gray-200 dark:border-gray-800')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-gray-100"><Award className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />{t.name} · {formatRate(t.commission_rate)}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Desde {t.min_deals} deal{Number(t.min_deals) === 1 ? '' : 's'} y {new Intl.NumberFormat('es-CO').format(Number(t.min_revenue))} de revenue</p>
                      {benefits.length > 0 && <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{benefits.join(' · ')}</p>}
                    </div>
                    {/* F12-misc: PATCH/DELETE de tier exige admin/manager; a un Empleado los botones solo le darían un 403. */}
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="sm" variant={isEditing ? 'secondary' : 'outline'} aria-expanded={isEditing} onClick={() => { setCreating(false); setEditingId(isEditing ? null : t.id); }}>{isEditing ? 'Cerrar' : 'Editar'}</Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Eliminar tier ${t.name}`} className="text-red-700 hover:text-red-800 dark:text-red-300" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {canManage && isEditing && <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"><TierForm tier={t} onSave={onSave} onCancel={() => setEditingId(null)} /></div>}
                </li>
              );
            })}
          </ol>
        </div>
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          title="Eliminar tier"
          description={`Se eliminará el tier «${deleteTarget?.name ?? ''}». Si algún partner lo tiene asignado, no se podrá borrar hasta moverlo a otro.`}
          confirmLabel="Eliminar"
          variant="destructive"
          onConfirm={remove}
          onCloseAutoFocus={onDeleteClose}
        />
      </SheetContent>
    </Sheet>
  );
}
