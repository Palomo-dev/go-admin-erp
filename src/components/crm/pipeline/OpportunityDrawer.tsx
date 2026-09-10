'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { StructuredLossDialog } from '@/components/crm/oportunidades/StructuredLossDialog';
import type { LossReasonData } from '@/components/crm/oportunidades/types';
import { WonCloseModal } from './WonCloseModal';
import { GateWarningDialog } from './GateWarningDialog';
import { emitPipelineRefresh } from '@/components/crm/shared/realtimeTables';
import { ClosedWonDialog } from './drawer/ClosedWonDialog';
import { DrawerHeader } from './drawer/DrawerHeader';
import { requestStageChange, type StageChangeResult } from './drawer/StageSelect';
import { useOpportunityData, type OpportunityFull } from './hooks/useOpportunityData';
import { DRAWER_TABS, type DrawerTab } from './drawer/tabs/types';
import { ResumenTab } from './drawer/tabs/ResumenTab';
import { ActividadTab } from './drawer/tabs/ActividadTab';
import { TareasTab } from './drawer/tabs/TareasTab';
import { NotasTab } from './drawer/tabs/NotasTab';
import { DocumentosTab } from './drawer/tabs/DocumentosTab';
import { IATab } from './drawer/tabs/IATab';

/**
 * OpportunityDrawer — shell (FASE-09 §5.2): header sticky + 6 tabs con carga
 * perezosa por pestaña. Cambio de etapa vía PATCH /stage (gate → GateWarningDialog,
 * won → ClosedWonDialog + WonCloseModal, lost → StructuredLossDialog).
 *
 * F9-04: tras CUALQUIER mutación (etapa, ganar, perder, nota/tarea/reunión) se
 * llama a `notifyMutation()`: avisa al contenedor (`onMutated`), emite
 * `refresh-pipeline-data` para el tablero y fuerza la recarga del timeline.
 * No se puede confiar en el realtime porque `opportunities`, `stages` y `notes`
 * NO están en la publicación `supabase_realtime` (ver `shared/realtimeTables.ts`).
 */
export interface OpportunityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string | null;
  /** Compatibilidad: objeto con id (PipelineStages legado). */
  opportunity?: { id: string } | null;
  onChanged?: (o: OpportunityFull) => void;
  /** Se invoca tras cada mutación para que el contenedor refresque (F9-04). */
  onMutated?: () => void;
  defaultTab?: DrawerTab;
}

export function OpportunityDrawer({ open, onOpenChange, opportunityId, opportunity: oppProp, onChanged, onMutated, defaultTab = 'resumen' }: OpportunityDrawerProps) {
  const router = useRouter();
  const id = opportunityId ?? oppProp?.id ?? null;
  const data = useOpportunityData(open ? id : null);
  const { opportunity, customer, stages, loading, error } = data;
  const [tab, setTab] = useState<DrawerTab>(defaultTab);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [gate, setGate] = useState<{ missing: string[]; stageName: string; stageId: string } | null>(null);
  const [wonStage, setWonStage] = useState<string | null>(null);
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [wonDialog, setWonDialog] = useState(false);
  const [wonClose, setWonClose] = useState(false);
  const [lossDialog, setLossDialog] = useState(false);
  const [closingLost, setClosingLost] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  /** F9-04: refresco real del tablero + del timeline tras una mutación. */
  const notifyMutation = useCallback(() => {
    setRefreshToken((n) => n + 1);
    emitPipelineRefresh();
    onMutated?.();
  }, [onMutated]);

  useEffect(() => { if (open) setTab(defaultTab); }, [open, id, defaultTab]);
  useEffect(() => { if (opportunity && onChanged) onChanged(opportunity); }, [opportunity, onChanged]);

  const applyStage = useCallback(async (body: Parameters<typeof requestStageChange>[1]) => {
    if (!id) return;
    const r = await requestStageChange(id, body);
    handleStageResult(r, body.stage_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStageResult = (r: StageChangeResult, targetStageId: string) => {
    if (r.ok) {
      data.patch(r.opportunity as Partial<OpportunityFull>);
      toast({ title: 'Etapa actualizada' });
      notifyMutation();
      return;
    }
    if (r.reason === 'error') { toast({ title: 'No se pudo cambiar la etapa', description: r.message, variant: 'destructive' }); return; }
    if (r.reason === 'gate') setGate({ missing: r.gate.missing.map((m) => m.detail || m.label), stageName: r.stage?.name ?? 'etapa', stageId: targetStageId });
    else if (r.reason === 'needs_won') { setWonStage(targetStageId); setWonDialog(true); }
    else if (r.reason === 'needs_lost') { setLostStage(targetStageId); setLossDialog(true); }
  };

  const handleMarkLost = async (loss: LossReasonData) => {
    if (!id) return;
    setClosingLost(true);
    try {
      if (lostStage) {
        await applyStage({ stage_id: lostStage, loss_data: loss as unknown as Record<string, unknown> });
      } else {
        await opportunitiesService.markAsLost(id, loss);
        await data.refetch.opportunity();
      }
      toast({ title: 'Oportunidad cerrada como perdida' });
      setLossDialog(false);
      setLostStage(null);
      notifyMutation();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setClosingLost(false);
    }
  };

  const handleWonConfirmed = async () => {
    setWonDialog(false);
    if (wonStage) {
      const fresh = await opportunitiesService.getOpportunityById(id!);
      await applyStage({ stage_id: wonStage, won_data: (fresh?.win_data as Record<string, unknown>) ?? {} });
      setWonStage(null);
    } else {
      await data.refetch.opportunity();
    }
    notifyMutation();
    setWonClose(true);
  };

  const closedByTab = (t: DrawerTab) => t === 'tareas' && openTasks != null ? `Tareas (${openTasks})` : DRAWER_TABS.find((x) => x.id === t)!.label;
  const tabProps = opportunity ? { opportunity, customer, data } : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 bg-white dark:bg-gray-900 flex flex-col h-dvh gap-0">
        {loading || (!opportunity && !error) ? (
          <div className="p-5 space-y-4">
            <SheetHeader><SheetTitle className="sr-only">Cargando oportunidad</SheetTitle></SheetHeader>
            <Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-8 w-full" /><Skeleton className="h-40 w-full" />
          </div>
        ) : error || !opportunity ? (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <SheetHeader><SheetTitle className="text-gray-900 dark:text-gray-100">Oportunidad</SheetTitle></SheetHeader>
            <p className="mt-4">{error ?? 'Oportunidad no encontrada o sin acceso'}</p>
          </div>
        ) : (
          <>
            <SheetHeader className="sticky top-0 z-10 space-y-0 text-left">
              <DrawerHeader
                opportunity={opportunity}
                customer={customer}
                stages={stages}
                onStageResult={handleStageResult}
                onWon={() => { setWonStage(null); setWonDialog(true); }}
                onLost={() => { setLostStage(null); setLossDialog(true); }}
                onEdit={() => { onOpenChange(false); router.push(`/app/crm/oportunidades/${opportunity.id}/editar`); }}
                onActionCompleted={(k) => { if (k !== 'call') setTab('actividad'); notifyMutation(); }}
              />
            </SheetHeader>
            <Tabs value={tab} onValueChange={(v) => setTab(v as DrawerTab)} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 sm:mx-5 mt-2 h-9 w-auto justify-start overflow-x-auto bg-gray-100 dark:bg-gray-800 shrink-0">
                {DRAWER_TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="text-xs px-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900">{closedByTab(t.id)}</TabsTrigger>
                ))}
              </TabsList>
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {tabProps && (
                  <>
                    <TabsContent value="resumen" className="mt-0"><ResumenTab {...tabProps} active={tab === 'resumen'} /></TabsContent>
                    <TabsContent value="actividad" className="mt-0"><ActividadTab {...tabProps} active={tab === 'actividad'} refreshToken={refreshToken} /></TabsContent>
                    <TabsContent value="tareas" className="mt-0"><TareasTab {...tabProps} active={tab === 'tareas'} onCountChange={setOpenTasks} /></TabsContent>
                    <TabsContent value="notas" className="mt-0"><NotasTab {...tabProps} active={tab === 'notas'} /></TabsContent>
                    <TabsContent value="documentos" className="mt-0"><DocumentosTab {...tabProps} active={tab === 'documentos'} /></TabsContent>
                    <TabsContent value="ia" className="mt-0"><IATab {...tabProps} active={tab === 'ia'} /></TabsContent>
                  </>
                )}
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>

      {gate && (
        <GateWarningDialog open onClose={() => setGate(null)} missing={gate.missing} stageName={gate.stageName}
          onConfirm={() => { const s = gate.stageId; setGate(null); void applyStage({ stage_id: s, override: true }); }} />
      )}
      <StructuredLossDialog open={lossDialog} onOpenChange={(o) => { setLossDialog(o); if (!o) setLostStage(null); }} onConfirm={handleMarkLost} isLoading={closingLost} />
      {id && (
        <ClosedWonDialog open={wonDialog} onOpenChange={(o) => { setWonDialog(o); if (!o) setWonStage(null); }} opportunityId={id} opportunityName={opportunity?.name} initialWinData={opportunity?.win_data} onConfirmed={handleWonConfirmed} />
      )}
      {id && (
        <WonCloseModal open={wonClose} onOpenChange={setWonClose} opportunityId={id} opportunityName={opportunity?.name} onComplete={() => { setWonClose(false); void data.refetch.opportunity(); notifyMutation(); }} />
      )}
    </Sheet>
  );
}

export default OpportunityDrawer;
