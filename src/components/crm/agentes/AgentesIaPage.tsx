'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Plus, Volume2, FlaskConical } from 'lucide-react';
import { PageHeader, EmptyState, StatusBadge, Tarjeta, StatCard, KpiStrip } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { AgentEditorDialog, type AgentDraft } from './AgentEditorDialog';
import { AgentMetricsPanel } from './AgentMetricsPanel';
import { VoicesPanel } from './VoicesPanel';
import { AgentCampaignsPanel } from './AgentCampaignsPanel';
export interface VoiceAgentListItem { id: string; name: string; purpose_type: string; engine: string; language: string; llm_model: string; voice_id: string | null; voice_ref_id: string | null; is_active: boolean; allowed_tools: string[]; }
export function AgentesIaPage() {
  const t = useTranslations('crm.agentesIa'); const query = useSearchParams(); const [startStep, setStartStep] = useState<'purpose' | 'voice' | 'test'>('purpose'); const [tab, setTab] = useState(query?.get('tab') === 'campanas' ? 'campaigns' : 'agents');
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [editing, setEditing] = useState<AgentDraft | null>(null); const [metrics, setMetrics] = useState<VoiceAgentListItem | null>(null); const [busy, setBusy] = useState<string | null>(null); const revision = useRef(0); const toggleLock = useRef(false);
  const load = useCallback(async () => { const current = ++revision.current; setLoading(true); setError(false); try { const result = await pedirCrm<VoiceAgentListItem[]>('/api/crm/voice-agents'); if (!Array.isArray(result.data)) throw new Error('invalid'); if (current === revision.current) setAgents(result.data); } catch { if (current === revision.current) setError(true); } finally { if (current === revision.current) setLoading(false); } }, []);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useEffect(() => { void load(); const changed = () => { revision.current++; setAgents([]); setEditing(null); setMetrics(null); setBusy(null); void load(); }; window.addEventListener(ORGANIZATION_CHANGED_EVENT, changed); return () => { invalidate(); window.removeEventListener(ORGANIZATION_CHANGED_EVENT, changed); }; }, [load, invalidate]);
  const toggle = async (agent: VoiceAgentListItem) => { if (toggleLock.current) return; toggleLock.current = true; const current = revision.current; setBusy(agent.id); try { await pedirCrm(`/api/crm/voice-agents/${agent.id}`, { method: 'PATCH', cuerpo: { is_active: !agent.is_active } }); if (current === revision.current) void load(); } catch { if (current === revision.current) setError(true); } finally { toggleLock.current = false; if (current === revision.current) setBusy(null); } };
  const edit = (agent: VoiceAgentListItem, step: 'purpose' | 'voice' | 'test' = 'purpose') => { setStartStep(step); setEditing({ mode: 'edit', id: agent.id }); };
  const action = <button type="button" className={clasesBoton({ patron: 'button' })} onClick={() => { setStartStep('purpose'); setEditing({ mode: 'create' }); }}><Plus className="size-4" strokeWidth={1.5} aria-hidden />{t('new')}</button>;
  const purpose = (agent: VoiceAgentListItem) => t.has(`purposes.${agent.purpose_type}`) ? t(`purposes.${agent.purpose_type}`) : agent.purpose_type;
  return <div className="space-y-5 bg-canvas p-4 lg:p-6" data-figma-node="1298:84133">
    <PageHeader titulo={t('title')} subtitulo={t('subtitle')} icono={Bot} migas={[{ etiqueta: 'CRM', href: '/app/crm' }, { etiqueta: t('title') }]}
      acciones={<>{agents.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={loading}><FlaskConical className="size-4" strokeWidth={1.5} aria-hidden />{t('steps.test')}</button></DropdownMenuTrigger><DropdownMenuContent align="end">{agents.map(agent => <DropdownMenuItem key={agent.id} onSelect={() => edit(agent, 'test')}>{agent.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}{action}</>}
      cargando={loading} movil={{ accion: action }} />
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid h-9 w-full grid-cols-3 rounded-lg border border-line bg-subtle p-1 sm:w-auto sm:inline-flex" aria-label={t('title')}>
        {(['agents', 'voices', 'campaigns'] as const).map(value => <TabsTrigger key={value} value={value} className="h-7 rounded-md px-3 text-[13px] leading-[18px] text-fg-secondary data-[state=active]:bg-surface data-[state=active]:text-fg dark:bg-transparent dark:text-fg-secondary dark:data-[state=active]:bg-surface">{t(value)}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="agents" className="space-y-4 pt-4">
        {/* El listado no devuelve estos agregados. «Sin datos» evita presentar una suma o un porcentaje inventados. */}
        <KpiStrip>
          <StatCard etiqueta={`${t('calls')} (${t('period7')})`} valor="—" detalle={t('unknown')} />
          <StatCard etiqueta={t('effective')} valor="—" detalle={t('unknown')} />
          <StatCard etiqueta={t('tools.book_meeting')} valor="—" detalle={t('unknown')} />
          <StatCard etiqueta={t('credits')} valor="—" detalle={t('unknown')} />
        </KpiStrip>
        {loading ? <div role="status" className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-60 animate-pulse rounded-xl border border-line bg-subtle motion-reduce:animate-none" />)}<span className="sr-only">{t('loading')}</span></div>
          : error ? <EmptyState variante="error" titulo={t('loadError')} onReintentar={() => void load()} />
          : !agents.length ? <EmptyState icono={Bot} titulo={t('emptyTitle')} descripcion={t('emptyDescription')} accion={{ etiqueta: t('new'), onClick: () => { setStartStep('purpose'); setEditing({ mode: 'create' }); } }} />
          : <ul aria-label={t('agents')} className="grid gap-4 md:grid-cols-2">{agents.map(agent => <li key={agent.id}>
            <Tarjeta titulo={agent.name} descripcion={`${purpose(agent)} · ${agent.language} · ${agent.engine}`} icono={Bot}
              accion={<StatusBadge estado={agent.is_active ? 'active' : 'inactive'} etiqueta={t(agent.is_active ? 'active' : 'inactive')} tono={agent.is_active ? 'exito' : 'neutro'} />}
              pie={<div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario', tamano: 'sm' })} onClick={() => edit(agent)}>{t('configure')}</button><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario', tamano: 'sm' })} onClick={() => setMetrics(agent)}>{t('metrics')}</button></div><label className="flex items-center gap-2 text-[13px] text-fg-secondary"><span>{t(agent.is_active ? 'active' : 'inactive')}</span><Switch checked={agent.is_active} disabled={busy !== null} aria-label={`${t(agent.is_active ? 'deactivate' : 'activate')} · ${agent.name}`} onCheckedChange={() => void toggle(agent)} /></label></div>}>
              <div className="space-y-3">
                <button type="button" onClick={() => edit(agent, 'voice')} className="flex max-w-full items-center gap-2 text-left text-[13px] leading-[18px] text-fg-secondary hover:text-brand-deep"><Volume2 className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /><span>{agent.voice_ref_id || agent.voice_id ? t('steps.voice') : t('voiceDefault')} · {agent.language}</span></button>
                <p className="text-[13px] leading-[18px] text-fg-secondary">{agent.llm_model}</p>
                <div className="flex flex-wrap gap-1.5">{(agent.allowed_tools ?? []).slice(0, 3).map(tool => <span key={tool} className="rounded-full border border-line bg-subtle px-2 py-1 text-xs leading-4 text-fg-secondary">{t.has(`tools.${tool}`) ? t(`tools.${tool}`) : tool}</span>)}</div>
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-subtle p-3">{[t('calls'), t('effective'), t('tools.book_meeting')].map(label => <div key={label}><p className="text-xs leading-4 text-fg-secondary">{label}</p><p className="mt-1 text-base font-semibold text-fg" aria-label={`${label} · ${t('unknown')}`}>—</p></div>)}</div>
              </div>
            </Tarjeta>
          </li>)}</ul>}
      </TabsContent>
      <TabsContent value="voices" className="pt-4"><VoicesPanel /></TabsContent><TabsContent value="campaigns" className="pt-4"><AgentCampaignsPanel agents={agents} /></TabsContent>
    </Tabs>
    {editing && <AgentEditorDialog draft={editing} initialStep={startStep} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} onGoToVoices={() => { setEditing(null); setTab('voices'); }} />}
    {metrics && <AgentMetricsPanel agent={metrics} onClose={() => setMetrics(null)} />}
  </div>;
}
export default AgentesIaPage;
