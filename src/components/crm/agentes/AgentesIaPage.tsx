'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Bot, Plus, Mic, Play, Pencil, Eye, RefreshCw } from 'lucide-react';
import { PageHeader, EmptyState, StatusBadge, Tarjeta, StatCard, KpiStrip } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import type { StageAgent } from '@/lib/services/crm/stageAgentService';
import { AgentEditorDialog, type AgentDraft } from './AgentEditorDialog';
import { AgentMetricsPanel } from './AgentMetricsPanel';
import type { VoiceCatalogRow } from './useVoiceCatalog';
import { VoicesPanel } from './VoicesPanel';
import { useAgentSummary, completeAgentSummary, bookedMeetings } from './useAgentSummary';
import { AgentCampaignsPanel } from './AgentCampaignsPanel';
export interface VoiceAgentListItem { id: string; name: string; purpose_type: string; engine: string; language: string; llm_model: string; voice_id: string | null; voice_ref_id: string | null; is_active: boolean; allowed_tools: string[]; }
export function AgentesIaPage() {
  const t = useTranslations('crm.agentesIa'); const query = useSearchParams();
  const [startStep, setStartStep] = useState<'purpose' | 'voice' | 'test'>('purpose'); const [tab, setTab] = useState(query?.get('tab') === 'campanas' ? 'campaigns' : 'agents');
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]), [stages, setStages] = useState<StageAgent[] | null>(null), [voices, setVoices] = useState<VoiceCatalogRow[] | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [editing, setEditing] = useState<AgentDraft | null>(null), [metrics, setMetrics] = useState<VoiceAgentListItem | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const revision = useRef(0), toggleLock = useRef(false);
  const invalidate = useCallback(() => { revision.current++; }, []);
  const ids = agents.map(agent => agent.id), summary = useAgentSummary(ids, revision.current), totals = completeAgentSummary(ids, summary.summaries);
  const locale = useLocale(), number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const load = useCallback(async () => {
    const current = ++revision.current; setLoading(true); setError(false); setStages(null); setVoices(null); setStageNames({});
    const results = await Promise.allSettled([
      pedirCrm<VoiceAgentListItem[]>('/api/crm/voice-agents'),
      pedirCrm<StageAgent[]>('/api/crm/stage-agents'),
      pedirCrm<VoiceCatalogRow[]>('/api/crm/voices'),
      pedirCrm<{ pipelines: { stages: { id: string; name: string }[] }[] }>('/api/crm/voice-agents/editor-context'),
    ]);
    if (current !== revision.current) return;
    const [list, scripts, catalog, context] = results;
    if (list.status === 'fulfilled' && Array.isArray(list.value.data)) setAgents(list.value.data); else { setAgents([]); setError(true); }
    if (scripts.status === 'fulfilled' && Array.isArray(scripts.value.data)) setStages(scripts.value.data);
    if (catalog.status === 'fulfilled' && Array.isArray(catalog.value.data)) setVoices(catalog.value.data);
    if (context.status === 'fulfilled') setStageNames(Object.fromEntries((context.value.data.pipelines ?? []).flatMap(pipeline => pipeline.stages.map(stage => [stage.id, stage.name]))));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const changed = () => { invalidate(); setAgents([]); setStages(null); setVoices(null); setEditing(null); setMetrics(null); setBusy(null); void load(); };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, changed);
    return () => { invalidate(); window.removeEventListener(ORGANIZATION_CHANGED_EVENT, changed); };
  }, [load, invalidate]);
  const toggle = async (agent: VoiceAgentListItem) => {
    if (toggleLock.current) return;
    toggleLock.current = true; const current = revision.current; setBusy(agent.id);
    try { await pedirCrm(`/api/crm/voice-agents/${agent.id}`, { method: 'PATCH', cuerpo: { is_active: !agent.is_active } }); if (current === revision.current) void load(); }
    catch { if (current === revision.current) setError(true); }
    finally { toggleLock.current = false; if (current === revision.current) setBusy(null); }
  };
  const edit = (agent: VoiceAgentListItem, step: 'purpose' | 'voice' | 'test' = 'purpose') => { setStartStep(step); setEditing({ mode: 'edit', id: agent.id }); };
  const create = () => { setStartStep('purpose'); setEditing({ mode: 'create' }); };
  const action = <button type="button" className={clasesBoton({ patron: 'button' })} onClick={create}><Plus className="size-4" strokeWidth={1.5} aria-hidden />{t('new')}</button>;
  const purpose = (agent: VoiceAgentListItem) => t.has(`purposes.${agent.purpose_type}`) ? t(`purposes.${agent.purpose_type}`) : agent.purpose_type;
  const editor = editing && <AgentEditorDialog draft={editing} initialStep={startStep} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} onGoToVoices={() => { setEditing(null); setMetrics(null); setTab('voices'); }} />;
  if (metrics) return <><AgentMetricsPanel agent={metrics} onClose={() => setMetrics(null)} onEdit={() => edit(metrics)} onTest={() => edit(metrics, 'test')} />{editor}</>;
  return <div className="space-y-4 bg-canvas p-4 lg:p-6" data-figma-node="1298:84133">
    <PageHeader titulo={t('title')} subtitulo={loading ? t('loadingAgents') : error ? t('loadError') : !agents.length ? t('emptySubtitle') : t('listSubtitle', { total: agents.length, active: agents.filter(agent => agent.is_active).length })} icono={Bot} migas={[{ etiqueta: 'CRM', href: '/app/crm' }, { etiqueta: t('agentsSection') }]}
      acciones={<>{error && <button type="button" className={clasesBoton({ patron: 'button', className: 'size-10 px-0', variante: 'secundario' })} aria-label={t('retry')} onClick={() => void load()}><RefreshCw className="size-4" strokeWidth={1.5} aria-hidden /></button>}
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={loading || !agents.length}><Play className="size-4" strokeWidth={1.5} aria-hidden />{t('testAgent')}</button></DropdownMenuTrigger><DropdownMenuContent align="end">{agents.map(agent => <DropdownMenuItem key={agent.id} onSelect={() => edit(agent, 'test')}>{agent.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>{action}</>}
      cargando={loading} movil={{ accion: action }} />
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-subtle p-1 sm:w-auto sm:inline-flex" aria-label={t('title')}>
        {(['agents', 'voices', 'campaigns'] as const).map(value => <TabsTrigger key={value} value={value} className="h-8 rounded-md px-3 text-sm leading-5 text-fg-secondary data-[state=active]:bg-surface data-[state=active]:text-fg dark:bg-transparent dark:text-fg-secondary dark:data-[state=active]:bg-surface">{t(value)}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="agents" className="space-y-4">
        {/* El resumen usa periodos completos de la RPC; una lectura incompleta conserva el guion. */}
        {(loading || (!error && agents.length > 0)) && <KpiStrip>{[
          { label: `${t('calls')} (${t('period7')})`, value: totals ? number(totals.calls) : '—', hint: t('metricsCallsHint') },
          { label: t('effective'), value: totals ? `${totals.calls ? Math.round(totals.effective / totals.calls * 100) : 0}%` : '—', hint: totals ? t('effectiveHint', { total: totals.effective }) : t('unknown') },
          { label: t('meetingsBooked'), value: totals ? number(totals.meetings) : '—', hint: t('meetingsHint') },
          { label: `${t('credits')} (${t('period30')})`, value: totals ? number(totals.credits) : '—', hint: t('creditsHint') },
        ].map(item => <StatCard key={item.label} etiqueta={item.label} valor={item.value} detalle={item.hint} tamano="sm" className="gap-2 [&>span.tabular-nums]:text-lg [&>span.tabular-nums]:leading-6" cargando={loading || summary.loading} varianteCarga="compacta" />)}</KpiStrip>}
        {loading ? <div role="status" className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Tarjeta key={i}><div className="space-y-3"><Skeleton className="h-3 w-full bg-pressed" /><Skeleton className="h-3 w-full bg-pressed" /><Skeleton className="h-20 w-full rounded-lg bg-pressed" /><Skeleton className="h-3 w-full bg-pressed" /></div></Tarjeta>)}<span className="sr-only">{t('loading')}</span></div>
          : error ? <EmptyState variante="error" titulo={t('loadError')} descripcion={t('loadErrorDescription')} onReintentar={() => void load()} accionPrimaria />
          : !agents.length ? <EmptyState icono={Bot} titulo={t('emptyTitle')} descripcion={t('emptyDescription')} accion={{ etiqueta: t('createFirst'), icono: Plus, onClick: create }} accionSecundaria={{ etiqueta: t('viewVoices'), icono: Mic, onClick: () => setTab('voices') }} />
          : <ul aria-label={t('agents')} className="grid gap-4 md:grid-cols-2">{agents.map(agent => {
            const voice = voices?.find(row => row.id === agent.voice_ref_id && row.is_active) ?? (!agent.voice_ref_id ? voices?.find(row => row.is_default && row.is_active) : undefined);
            const metrics = summary.summaries[agent.id]?.period;
            const scripts = stages?.filter(row => row.voice_agent_id === agent.id && row.is_active) ?? [];
            return <li key={agent.id}><Tarjeta titulo={agent.name} descripcion={`${purpose(agent)} · ${agent.language} · ${agent.engine === 'conversation_relay' ? 'Conversation Relay' : agent.engine}`} icono={Bot}
              className="[&>div]:sm:px-4 [&>div:last-child]:!border-t-0 [&>div:last-child]:!pt-0 [&>div:last-child]:pb-4 [&>div:first-child>div>span]:!size-10"
              accion={<StatusBadge estado={agent.is_active ? 'active' : 'inactive'} etiqueta={t(agent.is_active ? 'active' : 'inactive')} tono={agent.is_active ? 'exito' : 'neutro'} />}
              pie={<div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario', tamano: 'sm' })} onClick={() => edit(agent)}><Pencil className="size-4" strokeWidth={1.5} aria-hidden />{t('editAction')}</button><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma', tamano: 'sm' })} onClick={() => setMetrics(agent)}><Eye className="size-4" strokeWidth={1.5} aria-hidden />{t('detailAction')}</button></div><label className="flex items-center gap-2 text-[13px] text-fg-secondary"><span>{t(agent.is_active ? 'active' : 'inactive')}</span><Switch checked={agent.is_active} disabled={busy !== null} aria-label={`${t(agent.is_active ? 'deactivate' : 'activate')} · ${agent.name}`} onCheckedChange={() => void toggle(agent)} /></label></div>}>
              <div className="space-y-2.5"><button type="button" onClick={() => edit(agent, 'voice')} className="flex max-w-full items-center gap-2 text-left text-[13px] leading-[18px] text-fg-secondary hover:text-brand-deep"><Mic className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /><span>{voice ? voice.name : agent.voice_ref_id || agent.voice_id ? t('steps.voice') : t('voiceDefault')}</span></button>
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-[18px] text-fg-secondary"><span>{t('stageScript')}:</span>{stages === null ? <span>{t('unknown')}</span> : scripts.length ? scripts.slice(0, 3).map(script => <StatusBadge key={script.id} estado="assigned" etiqueta={stageNames[script.stage_id] ?? t('unknown')} tono="marca" />) : <span>{t('noAssignedStages')}</span>}{<StatusBadge estado="policy" etiqueta={t(scripts.length > 0 && scripts.every(row => row.action_policy === 'auto') ? 'auto' : 'suggest')} tono="neutro" />}</div>
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-subtle px-3 py-2.5">{[
                  { label: t('calls'), value: metrics ? number(metrics.total) : '—' },
                  { label: t('effective'), value: metrics ? `${metrics.total ? Math.round(metrics.effective / metrics.total * 100) : 0}%` : '—' },
                  { label: t('meetingsBooked'), value: metrics ? number(bookedMeetings(metrics)) : '—' },
                ].map(item => <div key={item.label}><p className="text-base font-semibold leading-[22px] text-fg" aria-label={`${item.label} · ${item.value}`}>{item.value}</p><p className="mt-0.5 text-xs leading-4 text-fg-secondary">{item.label}</p></div>)}</div>
              </div></Tarjeta></li>;
          })}</ul>}
      </TabsContent>
      <TabsContent value="voices" className="pt-4"><VoicesPanel /></TabsContent><TabsContent value="campaigns" className="pt-4"><AgentCampaignsPanel agents={agents} /></TabsContent>
    </Tabs>{editor}
  </div>;
}
export default AgentesIaPage;
