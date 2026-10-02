'use client';
import { useRef, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import type { CallIntelligenceState } from './useCallIntelligence';
export type ApplyActions = { stage?: boolean; tasks?: number[] | 'all'; tags?: boolean; discovery?: boolean; objections?: boolean };
/** Acciones originales: un solo envío, mismos jobs, gate y ledger de aplicación. */
export function useCallAnalysisActions(callId: string, s: CallIntelligenceState, onApplied?: () => void) {
  const bundle = s.analysis;
  const analysis = bundle?.analysis ?? null;
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [savedGate, setGate] = useState<{ missing: string[]; stageName: string; analysisId: string; callId: string } | null>(null);
  const current = useRef({ analysisId: analysis?.id, callId });
  current.current = { analysisId: analysis?.id, callId };
  const gate = savedGate?.analysisId === analysis?.id && savedGate?.callId === callId ? savedGate : null;

  const applied = new Set(bundle?.applied_actions ?? analysis?.raw_response?.applied_actions ?? []);
  const temperature = analysis?.raw_response?.temperature ?? null;
  const analyzeJobWorking = bundle?.job && (bundle.job.status === 'queued' || bundle.job.status === 'running');

  const runAnalyze = async (force: boolean) => {
    setRunning(true);
    s.setBusy(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo analizar');
      // Igual que en el panel de transcripción (ronda 6, tester r5 N1): si la ruta
      // devolvió el job que ya estaba vivo, no se anuncia uno nuevo.
      const deduped = json.data?.deduped === true;
      // Ronda 7 (tester r6 F1): igual que en el panel de transcripción, si la
      // ruta publica `dedupe_checked:false` es que NO pudo comprobar si ya había
      // otro trabajo vivo; se dice, en vez de prometer un análisis nuevo limpio.
      const unchecked = json.data?.dedupe_checked === false;
      const queued = res.status === 202;
      toast({
        title: deduped ? 'Ya había un análisis en curso' : queued ? 'Análisis en cola' : 'Análisis listo',
        description: deduped
          ? 'Se reutiliza el trabajo que ya estaba encolado; no se cobra dos veces.'
          : unchecked
            ? 'No se pudo comprobar si ya había otro análisis en curso, así que podría duplicarse.'
            : queued
              ? 'Se procesará en el próximo minuto.'
              : undefined,
      });
      await s.refetch();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setRunning(false);
      s.setBusy(false);
    }
  };

  const apply = async (actions: ApplyActions, key: string, ignoreGate = false) => {
    if (!analysis || (ignoreGate && (current.current.analysisId !== analysis.id || current.current.callId !== callId))) return;
    setApplying(key);
    try {
      const res = await fetch(`/api/crm/calls/${callId}/analysis/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: analysis.id, actions, ignore_gate: ignoreGate }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.data?.gate) {
        if (current.current.analysisId === analysis.id && current.current.callId === callId) setGate({ analysisId: analysis.id, callId, missing: (json.data.gate.missing ?? []).map((m: { label?: string; detail?: string }) => m.detail ?? m.label ?? ''), stageName: bundle?.suggested_stage?.name ?? 'la etapa sugerida' });
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'No se pudo aplicar');
      const done: string[] = json.data?.applied ?? [];
      const skipped: Array<{ action: string; reason: string }> = json.data?.skipped ?? [];
      toast({ title: done.length ? `Aplicado: ${done.join(', ')}` : 'Nada nuevo que aplicar', description: skipped.length ? skipped.map((x) => `${x.action}: ${x.reason}`).join(' · ') : undefined });
      await s.refetch();
      onApplied?.();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  const confirmGate = () => {
    setGate(null);
    if (gate && current.current.analysisId === gate.analysisId && current.current.callId === gate.callId) void apply({ stage: true }, 'stage', true);
  };
  return { running, applying, gate, setGate, confirmGate, applied, temperature, analyzeJobWorking, runAnalyze, apply };
}
