'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { clasesBoton } from '@/components/kit/botonClases';
import { colorEtapa } from '@/components/crm/kit/stageColumnLogica';
import { emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { EtapaApi } from '@/components/crm/oportunidad/oportunidadLogica';
import { StageDialog, type StageDialogValues } from '../StageDialog';
import { DeleteStageDialog } from '../DeleteStageDialog';

/**
 * «Etapas» del Pipeline y «⋯» de cada columna (Figma 768:454806, 812:54821
 * «Editar etapas de este pipeline»): lista de etapas con editar, eliminar y
 * «Nueva etapa». Reutiliza `StageDialog` y `DeleteStageDialog` y escribe por
 * `/api/crm/stages/**` (`crm.stages.manage`, resuelto en el servidor).
 */
export interface EtapasPipelineProps {
  pipelineId: string;
  etapas: readonly EtapaApi[];
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Abrir directo la edición de una etapa («⋯» de la columna). */
  editarId?: string | null;
  onEditarId?: (id: string | null) => void;
  cantidadPorEtapa: (id: string) => number;
}

export function EtapasPipeline(p: EtapasPipelineProps) {
  const t = useTranslations('crm.oportunidad.etapas');
  const [crear, setCrear] = useState(false);
  const [borrar, setBorrar] = useState<EtapaApi | null>(null);
  const editando = p.etapas.find((e) => e.id === p.editarId) ?? null;

  const guardar = async (v: StageDialogValues) => {
    try {
      if (editando) {
        await pedirCrm(`/api/crm/stages/${editando.id}`, { method: 'PATCH', cuerpo: { name: v.name, color: v.color, description: v.description || null, probability: v.probability, is_won: v.is_won, is_lost: v.is_lost } });
      } else {
        const posicion = p.etapas.reduce((m, e) => Math.max(m, e.position), 0) + 1;
        await pedirCrm('/api/crm/stages', { method: 'POST', cuerpo: { pipeline_id: p.pipelineId, name: v.name, position: posicion, probability: v.probability, color: v.color, description: v.description || null, is_won: v.is_won, is_lost: v.is_lost } });
      }
      toast({ title: t('guardada') });
      emitirCambioCrm({ entidad: 'opportunity', accion: 'etapas' });
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      throw e;
    }
  };

  const eliminar = async () => {
    if (!borrar) return;
    try {
      await pedirCrm(`/api/crm/stages/${borrar.id}`, { method: 'DELETE' });
      toast({ title: t('eliminada') });
      emitirCambioCrm({ entidad: 'opportunity', accion: 'etapas' });
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      throw e;
    }
  };

  const dialogoAbierto = crear || !!editando;
  return (
    <>
      <Sheet open={p.abierto} onOpenChange={p.onAbiertoChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 border-line bg-surface p-5 text-fg sm:max-w-[480px]">
          <div className="flex flex-col gap-1">
            <SheetTitle className="text-lg font-semibold">{t('titulo')}</SheetTitle>
            <SheetDescription className="text-sm text-fg-secondary">{t('descripcion')}</SheetDescription>
          </div>
          <ol className="flex flex-col gap-2">
            {[...p.etapas].sort((a, b) => a.position - b.position).map((e) => {
              const color = colorEtapa(e.color);
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-brand" style={color ? { backgroundColor: color } : undefined} />
                  <span className="flex-1 text-sm text-fg">{e.name}</span>
                  <span className="text-xs text-fg-muted">{e.is_won ? t('ganada') : e.is_lost ? t('perdida') : `${e.probability ?? 0} %`}</span>
                  <button type="button" aria-label={t('editar', { etapa: e.name })} onClick={() => p.onEditarId?.(e.id)} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"><Pencil aria-hidden="true" className="size-4" /></button>
                  <button type="button" aria-label={t('eliminar', { etapa: e.name })} onClick={() => setBorrar(e)} className="flex size-8 items-center justify-center rounded-lg text-danger-text hover:bg-danger-subtle"><Trash2 aria-hidden="true" className="size-4" /></button>
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => setCrear(true)} className={clasesBoton({ variante: 'secundario', className: 'self-start' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('nueva')}
          </button>
        </SheetContent>
      </Sheet>
      {dialogoAbierto && (
        <StageDialog
          open
          onOpenChange={(o) => {
            if (o) return;
            setCrear(false);
            p.onEditarId?.(null);
          }}
          mode={editando ? 'edit' : 'create'}
          stageId={editando?.id}
          initialValues={editando ? { name: editando.name, probability: editando.probability, color: editando.color ?? '#3b82f6', description: '', is_won: !!editando.is_won, is_lost: !!editando.is_lost } : undefined}
          onSubmit={guardar}
        />
      )}
      <DeleteStageDialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)} stageName={borrar?.name ?? ''} opportunityCount={borrar ? p.cantidadPorEtapa(borrar.id) : 0} onConfirm={eliminar} />
    </>
  );
}
