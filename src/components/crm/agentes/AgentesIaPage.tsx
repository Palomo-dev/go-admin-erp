'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, Plus } from 'lucide-react';
import { PageHeader, EmptyState, StatusBadge } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { AgentEditorDialog, type AgentDraft } from './AgentEditorDialog';
import { AgentMetricsPanel } from './AgentMetricsPanel';
import { VoicesPanel } from './VoicesPanel';
import { AgentCampaignsPanel } from './AgentCampaignsPanel';
export interface VoiceAgentListItem { id: string; name: string; purpose_type: string; engine: string; language: string; llm_model: string; voice_id: string | null; voice_ref_id: string | null; is_active: boolean; allowed_tools: string[]; }
export function AgentesIaPage() {
  const t = useTranslations('crm.agentesIa'); const query = useSearchParams(); const [tab, setTab] = useState(query?.get('tab') === 'campanas' ? 'campaigns' : 'agents');
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [editing, setEditing] = useState<AgentDraft | null>(null); const [metrics, setMetrics] = useState<VoiceAgentListItem | null>(null); const [busy, setBusy] = useState<string | null>(null); const revision = useRef(0); const toggleLock = useRef(false);
  const load = useCallback(async () => { const current = ++revision.current; setLoading(true); setError(false); try { const result = await pedirCrm<VoiceAgentListItem[]>('/api/crm/voice-agents'); if (!Array.isArray(result.data)) throw new Error('invalid'); if (current === revision.current) setAgents(result.data); } catch { if (current === revision.current) setError(true); } finally { if (current === revision.current) setLoading(false); } }, []);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useEffect(() => { void load(); const changed = () => { revision.current++; setAgents([]); setEditing(null); setMetrics(null); setBusy(null); void load(); }; window.addEventListener(ORGANIZATION_CHANGED_EVENT, changed); return () => { invalidate(); window.removeEventListener(ORGANIZATION_CHANGED_EVENT, changed); }; }, [load, invalidate]);
  const toggle = async (agent: VoiceAgentListItem) => { if (toggleLock.current) return; toggleLock.current = true; const current = revision.current; setBusy(agent.id); try { await pedirCrm(`/api/crm/voice-agents/${agent.id}`, { method: 'PATCH', cuerpo: { is_active: !agent.is_active } }); if (current === revision.current) void load(); } catch { if (current === revision.current) setError(true); } finally { toggleLock.current = false; if (current === revision.current) setBusy(null); } };
  const action = <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setEditing({ mode: 'create' })}><Plus className="size-4" aria-hidden />{t('new')}</button>;
  return <div className="space-y-5 bg-canvas p-4 lg:p-6"><PageHeader titulo={t('title')} subtitulo={t('subtitle')} icono={Bot} acciones={action} cargando={loading} movil={{ accion: action }} />
    <Tabs value={tab} onValueChange={setTab}><TabsList className="grid h-auto w-full grid-cols-3 sm:w-auto sm:inline-flex" aria-label={t('title')}>{(['agents', 'voices', 'campaigns'] as const).map(value => <TabsTrigger key={value} value={value}>{t(value)}</TabsTrigger>)}</TabsList>
      <TabsContent value="agents" className="pt-4">{loading ? <div role="status" className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-subtle motion-reduce:animate-none" />)}<span className="sr-only">{t('loading')}</span></div> : error ? <EmptyState variante="error" titulo={t('loadError')} onReintentar={() => void load()} /> : !agents.length ? <EmptyState icono={Bot} titulo={t('emptyTitle')} descripcion={t('emptyDescription')} accion={{ etiqueta: t('new'), onClick: () => setEditing({ mode: 'create' }) }} /> : <ul aria-label={t('agents')} className="grid gap-4 md:grid-cols-2">{agents.map(agent => <li key={agent.id} className="space-y-4 rounded-xl border border-line bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-fg">{agent.name}</h2><p className="text-sm text-fg-muted">{t.has(`purposes.${agent.purpose_type}`) ? t(`purposes.${agent.purpose_type}`) : agent.purpose_type} · {agent.language}</p></div><StatusBadge estado={agent.is_active ? 'active' : 'inactive'} etiqueta={t(agent.is_active ? 'active' : 'inactive')} tono={agent.is_active ? 'exito' : 'neutro'} /></div><p className="break-all text-xs text-fg-secondary">{agent.llm_model} · {agent.engine}</p><div className="flex flex-wrap gap-2"><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setMetrics(agent)}>{t('metrics')}</button><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setEditing({ mode: 'edit', id: agent.id })}>{t('configure')}</button><button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={busy !== null} onClick={() => void toggle(agent)}>{t(agent.is_active ? 'deactivate' : 'activate')}</button></div></li>)}</ul>}</TabsContent>
      <TabsContent value="voices" className="pt-4"><VoicesPanel /></TabsContent><TabsContent value="campaigns" className="pt-4"><AgentCampaignsPanel agents={agents} /></TabsContent>
    </Tabs>{editing && <AgentEditorDialog draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} onGoToVoices={() => { setEditing(null); setTab('voices'); }} />}{metrics && <AgentMetricsPanel agent={metrics} onClose={() => setMetrics(null)} />}
  </div>;
}
export default AgentesIaPage;
