'use client';

import { useCallback, useState } from 'react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Plus, RefreshCw, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { StructuredLossDialog } from '@/components/crm/oportunidades/StructuredLossDialog';
import type { LossReasonData } from '@/components/crm/oportunidades/types';
import CreateOpportunityDialog from './modals/CreateOpportunityDialog';
import { StageDialog, type StageDialogValues } from './StageDialog';
import { DeleteStageDialog } from './DeleteStageDialog';
import { GateWarningDialog } from './GateWarningDialog';
import { WonCloseModal } from './WonCloseModal';
import { OpportunityDrawer } from './OpportunityDrawer';
import { ClosedWonDialog } from './drawer/ClosedWonDialog';
import { KanbanColumnV2 } from './KanbanColumnV2';
import { useKanbanBoard, type KanbanStage } from './hooks/useKanbanBoard';
import { requestStageChange } from './drawer/StageSelect';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';

/**
 * KanbanBoardV2 (FASE-09 §5.2): columnas V2 + tarjetas V2, drag de
 * oportunidades con gate (PATCH /stage → GateWarningDialog), WonCloseModal y
 * StructuredLossDialog al soltar en is_won/is_lost, realtime, y gestión de
 * etapas portada de PipelineStages (crear/editar/borrar/reordenar).
 *
 * F9-41 (ronda 3): la gestión de etapas ya NO escribe `stages` desde el
 * navegador. Va por `/api/crm/stages` (+ `/[id]`), que comprueba rol y
 * pertenencia; en la BD, además, un trigger rechaza el cambio de
 * `is_won`/`is_lost` de quien no sea jefatura. Antes cualquier miembro podía
 * marcar una etapa intermedia como ganadora, y `is_won` decide cierres.
 */

/** Cliente de las rutas de etapas: nunca traga el error del servidor. */
async function stagesApi<T = unknown>(url: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || json.success === false) throw new Error((json.error as string) || `Error ${res.status}`);
  return json.data as T;
}
export interface KanbanBoardV2Props {
  pipelineId: string;
  compact?: boolean;
}

interface PendingMove { oppId: string; oppName: string; fromStageId: string; toStageId: string; toStageName: string; revert: () => void }

export function KanbanBoardV2({ pipelineId, compact }: KanbanBoardV2Props) {
  const board = useKanbanBoard(pipelineId);
  const { stages, opportunities, stats, loading, error, realtimeOn, setRealtimeOn, mode } = board;
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState<{ mode: 'create' | 'edit'; stage?: KanbanStage } | null>(null);
  const [deleteStage, setDeleteStage] = useState<KanbanStage | null>(null);
  const [gate, setGate] = useState<(PendingMove & { missing: string[] }) | null>(null);
  const [won, setWon] = useState<PendingMove | null>(null);
  const [lost, setLost] = useState<PendingMove | null>(null);
  const [lostSubmitting, setLostSubmitting] = useState(false);
  const [wonFollowUp, setWonFollowUp] = useState<{ id: string; name: string } | null>(null);

  const findOpp = (id: string) => Object.values(opportunities).flat().find((o) => o.id === id);

  const finishMove = useCallback(async (mv: PendingMove, opts?: { override?: boolean; wonData?: Record<string, unknown>; lossData?: Record<string, unknown> }) => {
    const r = await board.changeStage(mv.oppId, mv.toStageId, opts);
    if (r.ok) {
      toast({ title: 'Oportunidad movida', description: `Ahora está en "${mv.toStageName}"`, duration: 2500 });
      return true;
    }
    if (r.reason === 'gate') { setGate({ ...mv, missing: r.gate.missing.map((m) => m.detail || m.label) }); return false; }
    if (r.reason === 'needs_won') { setWon(mv); return false; }
    if (r.reason === 'needs_lost') { setLost(mv); return false; }
    mv.revert();
    toast({ title: 'No se pudo mover', description: r.reason === 'error' ? r.message : 'Etapa no válida', variant: 'destructive' });
    return false;
  }, [board]);

  const onDragEnd = async (result: DropResult) => {
    if (result.type === 'STAGE') return handleStageReorder(result);
    if (!result.destination || result.destination.droppableId === result.source.droppableId) return;
    const opp = findOpp(result.draggableId);
    const to = stages.find((s) => s.id === result.destination!.droppableId);
    if (!opp || !to) return;
    const revert = board.moveOptimistic(opp.id, to.id);
    await finishMove({ oppId: opp.id, oppName: opp.name, fromStageId: result.source.droppableId, toStageId: to.id, toStageName: to.name, revert });
  };

  // ─── Etapas (portado de PipelineStages) ───────────────────────────────────
  const handleStageReorder = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const list = [...stages];
    const [moved] = list.splice(result.source.index, 1);
    list.splice(result.destination.index, 0, moved);
    const updated = list.map((s, i) => ({ ...s, position: i + 1 }));
    board.setStagesLocal(updated);
    try {
      await stagesApi('/api/crm/stages', 'PUT', {
        pipeline_id: pipelineId,
        order: updated.map((s) => ({ id: s.id, position: s.position })),
      });
      toast({ title: 'Orden de etapas actualizado' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo guardar el nuevo orden', variant: 'destructive' });
      void board.refetchStages();
    }
  };

  const handleStageSubmit = async (values: StageDialogValues) => {
    if (!stageDialog) return;
    try {
      if (stageDialog.mode === 'create') {
        const maxPos = stages.reduce((m, s) => Math.max(m, s.position), 0);
        const data = await stagesApi<KanbanStage>('/api/crm/stages', 'POST', {
          pipeline_id: pipelineId,
          name: values.name,
          position: maxPos + 1,
          probability: values.probability ?? Math.min(10 + (maxPos / Math.max(stages.length, 1)) * 80, 90),
          color: values.color || '#3b82f6',
          description: values.description || null,
          is_won: values.is_won || false,
          is_lost: values.is_lost || false,
        });
        board.upsertStageLocal(data);
        toast({ title: 'Etapa creada' });
      } else if (stageDialog.stage) {
        const id = stageDialog.stage.id;
        const data = await stagesApi<KanbanStage>(`/api/crm/stages/${id}`, 'PATCH', {
          name: values.name,
          color: values.color,
          description: values.description || null,
          probability: values.probability,
          is_won: values.is_won,
          is_lost: values.is_lost,
        });
        board.upsertStageLocal({ ...stageDialog.stage, ...data });
        toast({ title: 'Etapa actualizada' });
      }
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo guardar la etapa', variant: 'destructive' });
      throw e;
    }
  };

  const handleDeleteStage = async () => {
    if (!deleteStage) return;
    try {
      await stagesApi(`/api/crm/stages/${deleteStage.id}`, 'DELETE');
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo borrar la etapa', variant: 'destructive' });
      throw e;
    }
    board.removeStageLocal(deleteStage.id);
    toast({ title: 'Etapa eliminada' });
  };

  const openStageDialog = (mode: 'create' | 'edit', stage?: KanbanStage) => setStageDialog({ mode, stage });
  const stageInitial: Partial<StageDialogValues> | undefined = stageDialog?.stage
    ? { name: stageDialog.stage.name, probability: stageDialog.stage.probability != null ? Math.round(Number(stageDialog.stage.probability)) : null, color: stageDialog.stage.color || '#3b82f6', description: stageDialog.stage.description || '', is_won: Boolean(stageDialog.stage.is_won), is_lost: Boolean(stageDialog.stage.is_lost) }
    : undefined;

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading && stages.length === 0) {
    return (
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => <div key={i} className="flex-1 min-w-[240px] bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"><Skeleton className="h-8 w-full mb-3" /><Skeleton className="h-24 w-full mb-2" /><Skeleton className="h-24 w-full" /></div>)}
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">{error} <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void board.refetchAll()}>Reintentar</Button></div>;
  }
  if (stages.length === 0) {
    return (
      <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-blue-100 dark:border-blue-900">
        <h3 className="text-xl font-medium text-blue-700 dark:text-blue-300 mb-2">No hay etapas configuradas</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Crea la primera etapa para comenzar.</p>
        <Button type="button" onClick={() => openStageDialog('create')} className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"><Plus className="h-5 w-5 mr-2" />Crear primera etapa</Button>
        {stageDialog && <StageDialog open onOpenChange={(o) => !o && setStageDialog(null)} mode={stageDialog.mode} initialValues={stageInitial} stageId={stageDialog.stage?.id} onSubmit={handleStageSubmit} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-2 px-3 sm:px-4 pt-2 text-xs">
        {/* F9-04: el chip dice la verdad. `opportunities`/`stages` no están en la
            publicación `supabase_realtime`, así que hoy el modo real es polling. */}
        <button
          type="button"
          onClick={() => setRealtimeOn(!realtimeOn)}
          className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
            mode === 'live' ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400'
              : mode === 'polling' ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400'
                : 'border-gray-300 text-gray-500 dark:border-gray-700')}
          aria-pressed={realtimeOn}
          title={mode === 'live' ? 'Tiempo real activo' : mode === 'polling' ? 'Sin tiempo real en la BD: se actualiza cada 30 s y tras cada cambio' : 'Actualización automática desactivada'}
        >
          <Radio className={cn('h-3 w-3', mode === 'live' && 'animate-pulse')} />
          {mode === 'live' ? 'tiempo real' : mode === 'polling' ? 'auto 30 s' : 'sin actualizar'}
        </button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void board.refetchAll()} aria-label="Actualizar"><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /></Button>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto overflow-y-hidden -mx-3 sm:mx-0" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}>
          <Droppable droppableId="stages-container" direction="horizontal" type="STAGE">
            {(drop) => (
              <div ref={drop.innerRef} {...drop.droppableProps} className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 min-h-[calc(100vh-12rem)] bg-gray-50 dark:bg-gray-900 w-full min-w-fit">
                {stages.map((stage, i) => (
                  <KanbanColumnV2 key={stage.id} stage={stage} index={i} opportunities={opportunities[stage.id] ?? []} stats={stats[stage.id] ?? { count: 0, total: 0 }} onOpen={setDrawerId} onCreate={(sid) => { setCreateStageId(sid); setCreateOpen(true); }} onEditStage={(s) => openStageDialog('edit', s)} onDeleteStage={setDeleteStage} compact={compact} />
                ))}
                {drop.placeholder}
                <div className="shrink-0 min-w-[200px]">
                  <Button type="button" variant="outline" onClick={() => openStageDialog('create')} className="w-full h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 text-gray-500 dark:text-gray-400 hover:text-blue-600"><Plus className="h-5 w-5 mr-2" />Nueva etapa</Button>
                </div>
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      <OpportunityDrawer
        open={Boolean(drawerId)}
        onOpenChange={(o) => !o && setDrawerId(null)}
        opportunityId={drawerId}
        onMutated={() => { void board.refetchOpportunities(); }}
      />
      <CreateOpportunityDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} pipelineId={pipelineId} stageId={createStageId ?? undefined} onSuccess={() => void board.refetchOpportunities()} />
      {stageDialog && <StageDialog open onOpenChange={(o) => !o && setStageDialog(null)} mode={stageDialog.mode} initialValues={stageInitial} stageId={stageDialog.stage?.id} onSubmit={handleStageSubmit} />}
      <DeleteStageDialog open={Boolean(deleteStage)} onOpenChange={(o) => !o && setDeleteStage(null)} stageName={deleteStage?.name ?? ''} opportunityCount={deleteStage ? (opportunities[deleteStage.id]?.length ?? 0) : 0} onConfirm={handleDeleteStage} />

      {gate && (
        <GateWarningDialog open onClose={() => { gate.revert(); setGate(null); }} missing={gate.missing} stageName={gate.toStageName}
          onConfirm={() => { const mv = gate; setGate(null); void finishMove(mv, { override: true }); }} />
      )}
      {/* F9-12: primero los datos de cierre (ClosedWonDialog los persiste en
          win_data) y solo entonces el PATCH; ya no se manda `{closed_from}`
          como excusa para saltarse el modal. */}
      {won && (
        <ClosedWonDialog
          open
          onOpenChange={(v) => { if (!v) { won.revert(); setWon(null); } }}
          opportunityId={won.oppId}
          opportunityName={won.oppName}
          onConfirmed={async () => {
            const mv = won;
            setWon(null);
            const fresh = await opportunitiesService.getOpportunityById(mv.oppId);
            const wonData = (fresh?.win_data as Record<string, unknown> | null) ?? null;
            const r = await requestStageChange(mv.oppId, { stage_id: mv.toStageId, won_data: wonData ?? { closed_from: 'kanban' } });
            if (!r.ok) {
              mv.revert();
              toast({ title: 'No se pudo cerrar como ganada', description: r.reason === 'error' ? r.message : undefined, variant: 'destructive' });
              return;
            }
            toast({ title: 'Oportunidad ganada' });
            void board.refetchOpportunities();
            setWonFollowUp({ id: mv.oppId, name: mv.oppName });
          }}
        />
      )}
      {wonFollowUp && (
        <WonCloseModal open onOpenChange={(v) => { if (!v) setWonFollowUp(null); }} opportunityId={wonFollowUp.id} opportunityName={wonFollowUp.name}
          onComplete={() => { setWonFollowUp(null); void board.refetchOpportunities(); }} />
      )}
      {lost && (
        <StructuredLossDialog open onOpenChange={(v) => { if (!v) { lost.revert(); setLost(null); } }} isLoading={lostSubmitting}
          onConfirm={async (data: LossReasonData) => { setLostSubmitting(true); const mv = lost; const ok = await finishMove(mv, { lossData: data as unknown as Record<string, unknown> }); setLostSubmitting(false); if (ok) setLost(null); }} />
      )}
    </div>
  );
}

export default KanbanBoardV2;
