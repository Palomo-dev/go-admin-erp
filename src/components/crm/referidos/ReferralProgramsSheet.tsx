'use client';

/**
 * «Programas de referidos» (Figma 1301:85046): hoja lateral con la lista de
 * programas (recompensa, referidos que tiene, Activo/Inactivo), el elegido
 * resaltado y su formulario debajo («Editar «…»»). «Crear programa» y la
 * edición solo si el servidor dice `can_manage` (F12-misc); un Empleado solo
 * lee. Eliminar queda como acción secundaria del formulario, con confirmación.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import type { ReferralProgram } from '@/lib/services/crm/referralsService';
import { cn } from '@/utils/Utils';
import { ReferralProgramForm, type ProgramFormPayload } from './ReferralProgramForm';
import { useReferidosFormato } from './useReferidosFormato';

interface Props {
  open: boolean;
  programs: ReferralProgram[];
  /** Referidos por programa (para «14 referidos»). */
  conteos: Record<string, number>;
  /** F12-misc: `can_manage` del GET de programas (misma función que partners); un Empleado solo lee. */
  canManage: boolean;
  /** Abrir directamente en «Crear programa» (desde el estado vacío). */
  crearAlAbrir?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: ProgramFormPayload, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}

export function ReferralProgramsSheet({ open, programs, conteos, canManage, crearAlAbrir, onOpenChange, onSave, onDelete }: Props) {
  const { t, recompensa } = useReferidosFormato();
  const h = (k: string, v?: Record<string, string | number>) => t(`programasHoja.${k}`, v);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReferralProgram | null>(null);
  const [borrando, setBorrando] = useState(false);
  const editing = programs.find((p) => p.id === editingId) ?? null;

  useEffect(() => {
    if (!open) return;
    const crear = canManage && (crearAlAbrir || programs.length === 0);
    setCreating(crear);
    setEditingId(!crear && canManage ? programs[0]?.id ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canManage, crearAlAbrir]);

  const save = async (payload: ProgramFormPayload, id?: string) => {
    await onSave(payload, id);
    toast({ title: id ? t('toast.programaActualizado') : t('toast.programaCreado'), description: `«${payload.name}»` });
    setCreating(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBorrando(true);
    try {
      await onDelete(deleteTarget.id);
      toast({ title: t('toast.programaEliminado', { nombre: deleteTarget.name }) });
      if (editingId === deleteTarget.id) setEditingId(null);
      setDeleteTarget(null);
    } catch (err) {
      toast({ title: t('toast.errorEliminar'), description: err instanceof Error ? err.message : t('errorDesconocido'), variant: 'destructive' });
    } finally {
      setBorrando(false);
    }
  };

  return (
    <HojaDetalle abierto={open} onAbiertoChange={onOpenChange} titulo={h('titulo')} subtitulo={h('descripcion')} ancho={560}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-secondary">{h('conteo', { n: programs.length })}</p>
          {canManage && (
            <button type="button" onClick={() => { setEditingId(null); setCreating(true); }} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {h('crear')}
            </button>
          )}
        </div>

        {programs.length === 0 && !creating && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-secondary">{h('vacio')}</p>}

        <ul className="flex flex-col gap-2" aria-label={h('titulo')}>
          {programs.map((p) => {
            const elegido = editingId === p.id;
            const contenido = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-fg">{p.name}</p>
                  <p className="truncate text-[13px] text-fg-secondary">{recompensa(p, true)}</p>
                </div>
                <span className="shrink-0 text-[13px] text-fg-secondary">{h('referidos', { n: conteos[p.id] ?? 0 })}</span>
                <StatusBadge estado={p.is_active ? 'active' : 'inactive'} etiqueta={p.is_active ? h('activo') : h('inactivo')} tono={p.is_active ? 'exito' : 'neutro'} apariencia="suave" className="shrink-0" />
              </>
            );
            const clases = cn('flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left', elegido ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface');
            return (
              <li key={p.id}>
                {canManage ? (
                  <button type="button" aria-pressed={elegido} onClick={() => { setCreating(false); setEditingId(p.id); }} className={cn(clases, 'hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', elegido && 'hover:bg-brand-tint')}>
                    {contenido}
                  </button>
                ) : (
                  <div className={clases}>{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (creating || editing) && (
          <section aria-labelledby="programa-form-titulo" className="flex flex-col gap-4 border-t border-line pt-4">
            <h3 id="programa-form-titulo" className="text-base font-semibold text-fg">{creating ? h('nuevo') : h('editar', { nombre: editing!.name })}</h3>
            <ReferralProgramForm
              key={creating ? 'nuevo' : editing!.id}
              program={creating ? null : editing}
              idPrefix={creating ? 'programa-nuevo' : `programa-${editing!.id}`}
              onSave={save}
              onCancel={() => (creating ? setCreating(false) : onOpenChange(false))}
              extraPie={
                !creating && editing ? (
                  <button type="button" onClick={() => setDeleteTarget(editing)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-danger-text hover:text-danger-text' })}>
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {h('eliminar')}
                  </button>
                ) : undefined
              }
            />
          </section>
        )}
      </div>
      <ConfirmDialog
        abierto={deleteTarget !== null}
        onAbiertoChange={(o) => { if (!o) setDeleteTarget(null); }}
        titulo={h('eliminarTitulo')}
        descripcion={h('eliminarDescripcion', { nombre: deleteTarget?.name ?? '' })}
        textoConfirmar={h('eliminar')}
        tono="peligro"
        cargando={borrando}
        onConfirmar={remove}
      />
    </HojaDetalle>
  );
}
