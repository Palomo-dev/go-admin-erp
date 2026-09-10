'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/use-toast';
import { GateWarningDialog } from '@/components/crm/pipeline/GateWarningDialog';
import { WonCloseModal } from '@/components/crm/pipeline/WonCloseModal';
import { ClosedWonDialog } from '@/components/crm/pipeline/drawer/ClosedWonDialog';
import { requestStageChange, type StageChangeResult } from '@/components/crm/pipeline/drawer/StageSelect';
import { StructuredLossDialog } from '../StructuredLossDialog';
import type { LossReasonData } from '../types';

/**
 * useStageFlow — cambio de etapa vía PATCH /stage con los tres desvíos
 * (gate → GateWarningDialog, is_won → ClosedWonDialog + WonCloseModal,
 * is_lost → StructuredLossDialog). Devuelve `change()`, `markLost()`,
 * `markWon()` y los diálogos a renderizar.
 */
export function useStageFlow(opportunityId: string, opportunityName: string | undefined, onApplied: () => void, opts?: { currentWinData?: Record<string, unknown> | null; lossFallback?: (d: LossReasonData) => Promise<void>; wonFallback?: () => Promise<void> }) {
  const [gate, setGate] = useState<{ stageId: string; stageName: string; missing: string[] } | null>(null);
  const [wonStage, setWonStage] = useState<string | null>(null);
  const [wonDialog, setWonDialog] = useState(false);
  const [wonClose, setWonClose] = useState(false);
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [lossDialog, setLossDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = useCallback((r: StageChangeResult, stageId: string) => {
    if (r.ok) { onApplied(); toast({ title: 'Etapa actualizada' }); return true; }
    if (r.reason === 'gate') setGate({ stageId, stageName: r.stage?.name ?? 'etapa', missing: r.gate.missing.map((m) => m.detail || m.label) });
    else if (r.reason === 'needs_won') { setWonStage(stageId); setWonDialog(true); }
    else if (r.reason === 'needs_lost') { setLostStage(stageId); setLossDialog(true); }
    else if (r.reason === 'error') toast({ title: 'No se pudo cambiar la etapa', description: r.message, variant: 'destructive' });
    return false;
  }, [onApplied]);

  const change = useCallback(async (stageId: string, extra?: { override?: boolean; won_data?: Record<string, unknown>; loss_data?: Record<string, unknown> }) => {
    setBusy(true);
    try { return handle(await requestStageChange(opportunityId, { stage_id: stageId, ...extra }), stageId); }
    finally { setBusy(false); }
  }, [opportunityId, handle]);

  const markLost = useCallback(() => { setLostStage(null); setLossDialog(true); }, []);
  const markWon = useCallback(() => { setWonStage(null); setWonDialog(true); }, []);

  const onLossConfirm = async (d: LossReasonData) => {
    setBusy(true);
    try {
      if (lostStage) await change(lostStage, { loss_data: d as unknown as Record<string, unknown> });
      else if (opts?.lossFallback) { await opts.lossFallback(d); onApplied(); }
      setLossDialog(false); setLostStage(null);
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo cerrar', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const onWonConfirmed = async () => {
    setWonDialog(false);
    if (wonStage) { await change(wonStage, { won_data: opts?.currentWinData ?? {} }); setWonStage(null); }
    else if (opts?.wonFallback) { await opts.wonFallback(); onApplied(); }
    setWonClose(true);
  };

  const dialogs: ReactNode = (
    <>
      {gate && <GateWarningDialog open onClose={() => setGate(null)} missing={gate.missing} stageName={gate.stageName} onConfirm={() => { const s = gate.stageId; setGate(null); void change(s, { override: true }); }} />}
      <StructuredLossDialog open={lossDialog} onOpenChange={(o) => { setLossDialog(o); if (!o) setLostStage(null); }} onConfirm={onLossConfirm} isLoading={busy} />
      <ClosedWonDialog open={wonDialog} onOpenChange={(o) => { setWonDialog(o); if (!o) setWonStage(null); }} opportunityId={opportunityId} opportunityName={opportunityName} initialWinData={opts?.currentWinData} onConfirmed={onWonConfirmed} />
      <WonCloseModal open={wonClose} onOpenChange={setWonClose} opportunityId={opportunityId} opportunityName={opportunityName} onComplete={() => { setWonClose(false); onApplied(); }} />
    </>
  );

  return { change, markLost, markWon, busy, dialogs };
}
