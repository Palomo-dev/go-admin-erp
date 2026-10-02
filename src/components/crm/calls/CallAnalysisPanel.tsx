'use client';

/**
 * CallAnalysisPanel — análisis IA de una llamada (FASE-04 §5.2).
 * Resumen, sentimiento, score con desglose, objeciones, próximos pasos
 * ("Crear tarea" / "Aplicar todo"), etapa sugerida con confianza y "Aplicar"
 * (gate → GateWarningDialog), etiquetas, "Analizar" / "Re-analizar".
 */

import type { ReactNode } from 'react';
import { Sparkles, Loader2, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, ListChecks, Flame, Snowflake, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { GateWarningDialog } from '@/components/crm/pipeline/GateWarningDialog';
import { useCallIntelligence, ERROR_LABELS, providerLabel, type CallIntelligenceState } from './useCallIntelligence';
import { CallAnalysisCards } from './CallAnalysisCards';
import { useCallAnalysisActions } from './useCallAnalysisActions';
import { AnalysisScore, AnalysisObjections, AnalysisDiscovery } from './CallAnalysisSections';

export interface CallAnalysisPanelProps {
  callId: string;
  opportunityId?: string | null;
  state?: CallIntelligenceState;
  onApplied?: () => void;
  className?: string;
  variante?: 'panel' | 'ficha';
  linkedContent?: ReactNode;
  mobileCallback?: ReactNode;
  onSeek?: (ms: number) => void;
}

const SENTIMENT: Record<string, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' }> = {
  positive: { label: 'Positivo', variant: 'success' },
  neutral: { label: 'Neutral', variant: 'secondary' },
  negative: { label: 'Negativo', variant: 'destructive' },
  mixed: { label: 'Mixto', variant: 'warning' },
};

export function CallAnalysisPanel({ callId, opportunityId, state, onApplied, className, variante = 'panel', linkedContent, mobileCallback, onSeek }: CallAnalysisPanelProps) {
  const own = useCallIntelligence(callId, !state);
  const s = state ?? own;
  const bundle = s.analysis;
  const analysis = bundle?.analysis ?? null;
  const transcriptReady = s.transcript?.status === 'completed';
  const { running, applying, gate, setGate, confirmGate, applied, temperature, analyzeJobWorking, runAnalyze, apply } = useCallAnalysisActions(callId, s, onApplied);

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <Sparkles size={16} className="text-purple-600 dark:text-purple-400" /> Análisis IA
        {analysis && (
          <Badge variant="secondary" className="text-[10px] font-normal">
            {providerLabel(analysis.provider)}{analysis.model ? ` · ${analysis.model}` : ''}
            {typeof analysis.raw_response?.cost_usd === 'number' && ` · $${analysis.raw_response.cost_usd.toFixed(4)}`}
          </Badge>
        )}
        {bundle?.policy && <Badge variant="outline" className="text-[10px] font-normal">{bundle.policy === 'auto' ? 'Automático' : 'Sugerir'}</Badge>}
      </div>
      {transcriptReady && (
        <Button size="sm" variant="ghost" onClick={() => runAnalyze(!!analysis)} disabled={running || !!analyzeJobWorking} title={analysis ? 'Re-analizar' : 'Analizar'} aria-label={analysis ? 'Re-analizar' : 'Analizar'}>
          {running || analyzeJobWorking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span className="ml-1 text-xs">{analysis ? 'Re-analizar' : 'Analizar'}</span>
        </Button>
      )}
    </header>
  );

  if (variante === 'ficha') return <>
    <CallAnalysisCards key={analysis?.id ?? 'pending'} state={s} actions={{ running, applying, applied, analyzeJobWorking: Boolean(analyzeJobWorking), runAnalyze, apply }} opportunityId={opportunityId} linkedContent={linkedContent} mobileCallback={mobileCallback} onSeek={onSeek} />
    <GateWarningDialog open={!!gate} onClose={() => setGate(null)} onConfirm={confirmGate} missing={gate?.missing ?? []} stageName={gate?.stageName ?? ''} />
  </>;

  return (
    <section className={cn('flex flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800', className)} aria-label="Análisis IA de la llamada">
      {header}
      <div className="space-y-3 p-3 text-sm" aria-live="polite">
        {!analysis && (analyzeJobWorking || running) && (
          <p className="flex items-center gap-2 text-purple-700 dark:text-purple-300"><Loader2 size={16} className="animate-spin" /> Analizando la llamada…</p>
        )}
        {!analysis && !analyzeJobWorking && !running && bundle?.job?.status === 'failed' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            <p className="flex items-center gap-2"><AlertTriangle size={16} /> {ERROR_LABELS[(bundle.job.last_error ?? '').split(':')[0]] ?? 'El análisis falló'}</p>
            {bundle.job.last_error && <p className="text-xs opacity-80">{bundle.job.last_error}</p>}
          </div>
        )}
        {!analysis && !analyzeJobWorking && !running && bundle?.job?.status !== 'failed' && (
          <p className="text-gray-500 dark:text-gray-400">{transcriptReady ? 'Sin análisis todavía. Pulsa "Analizar".' : 'El análisis se genera al completar la transcripción.'}</p>
        )}

        {analysis && (
          <>
            <p className="text-gray-800 dark:text-gray-100">{analysis.summary}</p>
            <div className="flex flex-wrap items-center gap-2">
              {analysis.sentiment && (
                <Badge variant={SENTIMENT[analysis.sentiment]?.variant ?? 'secondary'}>
                  Sentimiento: {SENTIMENT[analysis.sentiment]?.label ?? analysis.sentiment}{typeof analysis.sentiment_score === 'number' ? ` (${analysis.sentiment_score.toFixed(1)})` : ''}
                </Badge>
              )}
              {temperature && (
                <Badge variant={temperature === 'hot' ? 'destructive' : temperature === 'cold' ? 'info' : 'warning'} className="inline-flex items-center gap-1">
                  {temperature === 'hot' ? <Flame size={12} /> : temperature === 'cold' ? <Snowflake size={12} /> : <Thermometer size={12} />}
                  {temperature === 'hot' ? 'Caliente' : temperature === 'cold' ? 'Frío' : 'Tibio'}
                </Badge>
              )}
              {analysis.decision_maker_identified && <Badge variant="success">Decisor identificado</Badge>}
              {typeof analysis.budget_mentioned === 'number' && <Badge variant="outline">Presupuesto: {analysis.budget_mentioned.toLocaleString('es-CO')}</Badge>}
              {(analysis.detected_competitors ?? []).map((c) => <Badge key={c} variant="outline">Competidor: {c}</Badge>)}
            </div>

            <AnalysisScore analysis={analysis} />
            <AnalysisObjections analysis={analysis} catalog={bundle?.objections ?? []} />

            {(analysis.next_steps?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400"><ListChecks size={12} /> Próximos pasos</h4>
                <ul className="space-y-1">
                  {analysis.next_steps!.map((n, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-200">
                      <span>{n.action} <span className="text-xs text-gray-400">({n.owner === 'customer' ? 'cliente' : 'agente'}{n.due_date ? ` · ${n.due_date}` : ''})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(analysis.suggested_tasks?.length ?? 0) > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Tareas sugeridas</h4>
                <ul className="space-y-1">
                  {analysis.suggested_tasks!.map((t, i) => {
                    const done = applied.has(`task:${i}`);
                    return (
                      <li key={i} className="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-200">
                        <span className={cn(done && 'line-through opacity-60')}>{t.title} <span className="text-xs text-gray-400">({t.priority ?? 'med'}{t.due_date ? ` · ${t.due_date}` : ''})</span></span>
                        {done ? <CheckCircle2 size={16} className="shrink-0 text-green-600 dark:text-green-400" aria-label="Tarea creada" /> : (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={applying !== null} onClick={() => apply({ tasks: [i] }, `task:${i}`)}>
                            {applying === `task:${i}` ? <Loader2 size={12} className="animate-spin" /> : 'Crear tarea'}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {analysis.suggested_stage_id && opportunityId !== null && (
              <div role="region" aria-labelledby={`stage-sugg-${analysis.id}`} className="rounded-md border border-purple-200 bg-purple-50 p-2 dark:border-purple-800 dark:bg-purple-900/20">
                <p id={`stage-sugg-${analysis.id}`} className="flex items-center gap-1 text-purple-900 dark:text-purple-100">
                  <ArrowRight size={14} /> Mover a <strong>{bundle?.suggested_stage?.name ?? 'etapa sugerida'}</strong> · confianza {Math.round((analysis.suggested_stage_confidence ?? 0) * 100)} %
                </p>
                <div className="mt-1 flex gap-2">
                  {applied.has('stage') ? <Badge variant="success">Etapa aplicada</Badge> : (
                    <Button size="sm" className="h-7 text-xs" disabled={applying !== null} onClick={() => apply({ stage: true }, 'stage')}>
                      {applying === 'stage' ? <Loader2 size={12} className="animate-spin" /> : 'Aplicar etapa'}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {analysis.raw_response?.rejected_stage_id && <p className="text-[11px] text-gray-400">La etapa sugerida por el modelo no pertenece al pipeline y se descartó.</p>}

            <AnalysisDiscovery analysis={analysis} applied={applied.has('discovery')} />

            {(bundle?.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {bundle!.tags.map((t) => (
                  <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${t.tag?.color ?? '#8b5cf6'}22`, color: t.tag?.color ?? '#8b5cf6' }}>{t.tag?.name ?? 'etiqueta'}</span>
                ))}
              </div>
            )}

            <div className="flex justify-end border-t border-gray-100 pt-2 dark:border-gray-700">
              <Button size="sm" variant="outline" disabled={applying !== null} onClick={() => apply({ stage: !!analysis.suggested_stage_id, tasks: 'all', tags: true, discovery: true, objections: true }, 'all')}>
                {applying === 'all' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <CheckCircle2 size={12} className="mr-1" />} Aplicar todo
              </Button>
            </div>
          </>
        )}
      </div>
      <GateWarningDialog
        open={!!gate}
        onClose={() => setGate(null)}
        onConfirm={confirmGate}
        missing={gate?.missing ?? []}
        stageName={gate?.stageName ?? ''}
      />
    </section>
  );
}

export default CallAnalysisPanel;
