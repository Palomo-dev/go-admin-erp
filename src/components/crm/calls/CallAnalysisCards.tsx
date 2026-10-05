'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, RefreshCw, Sparkles } from 'lucide-react';
import { FormSection } from '@/components/kit';
import { KbdButton } from '@/components/kit/KbdButton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CallIntelligenceState } from './useCallIntelligence';
import type { useCallAnalysisActions } from './useCallAnalysisActions';
import { AnalysisScore, AnalysisDiscovery } from './CallAnalysisSections';

type Actions = Pick<ReturnType<typeof useCallAnalysisActions>, 'running' | 'applying' | 'applied' | 'runAnalyze' | 'apply'> & { analyzeJobWorking: boolean };
export function CallAnalysisCards({ state, actions, opportunityId, linkedContent, mobileCallback, onSeek }: {
  state: CallIntelligenceState; actions: Actions; opportunityId?: string | null; linkedContent?: ReactNode; mobileCallback?: ReactNode; onSeek?: (ms: number) => void;
}) {
  const t = useTranslations('crm.llamadas.ficha'), calls = useTranslations('crm.llamadas');
  const { formatDate } = useFormatDate();
  const { analysis: bundle } = state, analysis = bundle?.analysis;
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const selected = (analysis?.suggested_tasks ?? []).flatMap((_, index) => !unchecked.has(index) && !actions.applied.has(`task:${index}`) ? [index] : []);
  const busy = actions.applying !== null;
  const analysisError = state.analysisError !== undefined ? state.analysisError : state.error;
  const sentiment = analysis?.sentiment;
  const sentimentTone = sentiment === 'positive' ? 'exito' : sentiment === 'negative' ? 'peligro' : sentiment === 'mixed' ? 'advertencia' : 'neutro';
  const ratio = analysis?.talk_ratio_agent;
  const analyzeButton = state.transcript?.status === 'completed' ? <KbdButton patron="button" tamano="sm" variante="fantasma" icono={RefreshCw} cargando={actions.running || actions.analyzeJobWorking} onClick={() => void actions.runAnalyze(Boolean(analysis))}>{t(analysis ? 'reanalizar' : 'analizar')}</KbdButton> : null;
  const processing = !analysis && (actions.running || actions.analyzeJobWorking || state.transcript?.status === 'pending' || state.transcript?.status === 'processing');
  const firstObjection = analysis?.detected_objections?.[0];
  const firstObjectionSegment = firstObjection?.quote ? state.transcript?.segments?.find(entry => entry.text.includes(firstObjection.quote)) : null;
  const firstObjectionTime = firstObjectionSegment ? `${String(Math.floor(firstObjectionSegment.start_ms / 60000)).padStart(2, '0')}:${String(Math.floor(firstObjectionSegment.start_ms / 1000) % 60).padStart(2, '0')}` : null;
  return <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4" data-call-analysis-cards>
    <FormSection titulo={t('resumenIA')} className="order-2 lg:order-none max-lg:[&_h2]:text-[13px] max-lg:[&_h2]:font-medium max-lg:[&_h2]:leading-[18px] max-lg:[&_h2]:text-fg-secondary max-lg:[&>div:first-child]:mb-2" densidad="compacta" accion={analysis ? <Badge tono="marca" tamano="sm" className="hidden lg:inline-flex">{t('generadoIA')}</Badge> : processing ? <Badge tono="marca" tamano="sm">{t('enProceso')}</Badge> : analyzeButton}>
      <p className={`text-[13px] leading-[18px] text-fg ${mobileExpanded ? '' : 'max-lg:line-clamp-3'}`} role={!analysis && (analysisError || bundle?.job?.status === 'failed') ? 'alert' : undefined} aria-live="polite">{analysis?.summary || (analysis ? t('sinResumen') : actions.running || actions.analyzeJobWorking ? t('analizando') : analysisError || bundle?.job?.status === 'failed' ? t('errorAnalisis') : t('sinAnalisis'))}</p>
      {processing && <div className="grid gap-2.5" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-subtle" />)}</div>}
    </FormSection>
    {analysis && <>
      <FormSection titulo={t('sentimientoConversacion')} className={mobileExpanded ? 'order-6 lg:order-none' : 'order-6 hidden lg:order-none lg:block'} densidad="compacta">
        {sentiment && <div><Badge tono={sentimentTone} tamano="sm">{calls.has(`sentimientos.${sentiment}`) ? calls(`sentimientos.${sentiment}`) : sentiment}{typeof analysis.sentiment_score === 'number' && ` · ${Math.round(analysis.sentiment_score * 100)} %`}</Badge></div>}
        {typeof ratio === 'number' && <div className="space-y-2">
          <div className="flex justify-between text-[13px] leading-[18px] text-fg-secondary"><span>{t('habloVendedor')}</span><span className="text-xs font-medium tabular-nums text-fg">{Math.round(ratio * 100)} %</span></div>
          <div role="progressbar" aria-label={t('habloVendedor')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} className="h-2 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} /></div>
        </div>}
        <p className="text-xs leading-4 text-fg-secondary">{[typeof analysis.longest_monologue_seconds === 'number' ? t('monologo', { n: analysis.longest_monologue_seconds }) : null, typeof analysis.questions_asked === 'number' ? t('preguntas', { n: analysis.questions_asked }) : null].filter(Boolean).join(' · ')}</p>
        {!sentiment && typeof ratio !== 'number' && <p className="text-[13px] text-fg-secondary">{t('sinMetricas')}</p>}
      </FormSection>
      {!!analysis.detected_objections?.length && <FormSection titulo={t('objecionesDetectadas')} className="order-3 lg:order-none max-lg:[&_h2]:text-[13px] max-lg:[&_h2]:font-medium max-lg:[&_h2]:leading-[18px] max-lg:[&_h2]:text-fg-secondary" densidad="compacta" accion={<><Badge tono="advertencia" tamano="sm" className="hidden lg:inline-flex">{analysis.detected_objections.length}</Badge>{firstObjectionTime && <button type="button" onClick={() => onSeek?.(firstObjectionSegment!.start_ms)} className="text-xs tabular-nums text-fg-secondary focus-visible:ring-2 focus-visible:ring-brand lg:hidden">{firstObjectionTime}</button>}</>}>
        {analysis.detected_objections.map((objection, index) => {
          const catalog = bundle?.objections.find((entry) => entry.id === objection.objection_id);
          const segment = objection.quote ? state.transcript?.segments?.find((entry) => entry.text.includes(objection.quote)) : null;
          const time = segment ? `${String(Math.floor(segment.start_ms / 60000)).padStart(2, '0')}:${String(Math.floor(segment.start_ms / 1000) % 60).padStart(2, '0')}` : null;
          return <div key={index} className="space-y-1.5 rounded-lg lg:bg-warning-subtle lg:p-3">
            <div className={mobileExpanded ? 'flex items-start gap-1.5' : 'hidden items-start gap-1.5 lg:flex'}><AlertTriangle aria-hidden="true" className="mt-0.5 hidden size-4 shrink-0 text-warning-text lg:block" strokeWidth={1.5} /><p className="min-w-0 flex-1 text-sm font-medium leading-5 text-fg">{catalog?.title ?? objection.label}</p>{time && <button type="button" onClick={() => onSeek?.(segment!.start_ms)} className="ml-auto text-xs tabular-nums text-fg-secondary hover:text-brand focus-visible:ring-2 focus-visible:ring-brand">{time}</button>}</div>
            {catalog?.recommended_response && <p className="text-sm leading-5 text-fg lg:text-xs lg:leading-4 lg:text-fg-secondary">{t('respuestaSugerida', { respuesta: catalog.recommended_response })}</p>}
            {catalog && <Link href={`/app/crm/objeciones?objection=${encodeURIComponent(catalog.id)}`} className={mobileExpanded ? 'text-xs leading-4 text-brand hover:underline' : 'hidden text-xs leading-4 text-brand hover:underline lg:inline'}>{t('verBiblioteca')} →</Link>}
          </div>;
        })}
      </FormSection>}
      {!!analysis.suggested_tasks?.length && !dismissed && <div className="order-5 space-y-3 lg:order-none lg:space-y-0">
        <div className="grid grid-cols-2 gap-2 lg:hidden"><KbdButton patron="button" tamano="md" variante="secundario" disabled={!selected.length || busy} cargando={actions.applying === 'tasks'} className="min-w-0 w-full" onClick={() => void actions.apply({ tasks: selected }, 'tasks')}>{t('crearTareas', { n: selected.length })}</KbdButton><div className="min-w-0 [&>button]:w-full">{mobileCallback}</div></div>
        <FormSection titulo={t('tareasSugeridas')} densidad="compacta" className={mobileExpanded ? undefined : 'hidden lg:block'}>
        {analysis.suggested_tasks.map((task, index) => {
          const done = actions.applied.has(`task:${index}`);
          return <label key={index} className="flex items-start gap-2 text-sm leading-5 text-fg">
            <Checkbox checked={done || !unchecked.has(index)} disabled={done || busy} aria-label={done ? t('tareaCreada') : t('seleccionarTarea', { nombre: task.title })} onCheckedChange={(checked) => setUnchecked((previous) => { const next = new Set(previous); if (checked) next.delete(index); else next.add(index); return next; })} />
            <span className={done ? 'text-fg-secondary line-through' : undefined}>{task.title}{task.due_date && <span className="text-xs text-fg-secondary"> · {/^\d{4}-\d{2}-\d{2}$/.test(task.due_date) ? formatPlainDate(task.due_date) : formatDate(task.due_date)}</span>}</span>
          </label>;
        })}
        <div className="flex gap-2 lg:flex-wrap"><KbdButton patron="button" tamano="sm" icono={Check} disabled={!selected.length || busy} cargando={actions.applying === 'tasks'} className="hidden lg:inline-flex" onClick={() => void actions.apply({ tasks: selected }, 'tasks')}>{t('crearTareas', { n: selected.length })}</KbdButton><KbdButton patron="button" tamano="sm" variante="fantasma" disabled={busy} className="hidden lg:inline-flex" onClick={() => setDismissed(true)}>{t('descartar')}</KbdButton></div>
        </FormSection>
      </div>}
    </>}
    {(!analysis?.suggested_tasks?.length || dismissed) && mobileCallback && <div className="order-5 flex justify-end lg:hidden">{mobileCallback}</div>}
    <FormSection titulo={t('vinculadaA')} className={mobileExpanded || !analysis ? 'order-7 lg:order-none' : 'order-7 hidden lg:order-none lg:block'} densidad="compacta">
      {linkedContent}
      {analysis?.suggested_stage_id && opportunityId && <div className="flex items-start gap-2 rounded-lg bg-brand-tint p-2.5">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} /><p className="min-w-0 flex-1 text-xs leading-4 text-fg">{t('sugerirEtapa', { nombre: bundle?.suggested_stage?.name ?? t('etapaCampo'), n: Math.round((analysis.suggested_stage_confidence ?? 0) * 100) })}</p>
        {actions.applied.has('stage') ? <Badge tono="exito" tamano="sm">{t('etapaAplicada')}</Badge> : <KbdButton patron="button" tamano="sm" variante="secundario" disabled={busy} cargando={actions.applying === 'stage'} onClick={() => void actions.apply({ stage: true }, 'stage')}>{t('aplicar')}</KbdButton>}
      </div>}
    </FormSection>
    {analysis && <details onToggle={(event) => setMobileExpanded(event.currentTarget.open)} className="order-8 rounded-xl border border-line bg-surface p-4 lg:order-none"><summary className="cursor-pointer text-xs font-medium text-fg-secondary">{t('masAnalisis')}</summary><div className="mt-3 space-y-3"><AnalysisScore analysis={analysis} /><AnalysisDiscovery analysis={analysis} applied={actions.applied.has('discovery')} />{analyzeButton}<KbdButton patron="button" tamano="sm" variante="secundario" icono={Check} disabled={busy} cargando={actions.applying === 'all'} onClick={() => void actions.apply({ stage: Boolean(analysis.suggested_stage_id), tasks: 'all', tags: true, discovery: true, objections: true }, 'all')}>{t('aplicarTodo')}</KbdButton></div></details>}
  </div>;
}
