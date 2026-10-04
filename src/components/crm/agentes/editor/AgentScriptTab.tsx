'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CrmSelectControl } from '../CrmSelectControl';
import { useTranslations } from 'next-intl';
import { FormSection, EmptyState, ChipsOpcion } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { withRequestDeadline } from '@/lib/utils/requestDeadline';
import { tiempoLecturaCrm } from '@/lib/utils/crmReadTimeout';
import { STAGE_AGENT_OBJECTIVES, STAGE_AGENT_TRIGGERS, type StageAgent } from '@/lib/services/crm/stageAgentService';
import { MANDATORY_TOOLS } from '@/lib/services/crm/voiceAgentToolCatalog';
import type { AgentFormState } from './useAgentForm';
interface Stage { id: string; name: string; position: number; is_won?: boolean; is_lost?: boolean }
interface Pipeline { id: string; name: string; stages: Stage[] }
interface Product { id: number; name: string; sku: string | null }
interface FalloLectura { detail: 'context' | 'scripts'; forbidden: boolean }
export function AgentScriptTab({ form, agentId, onSaveInactive, onUnsavedChange }: { form: AgentFormState; agentId: string | null; onSaveInactive: () => void; onUnsavedChange?: (dirty: boolean) => void }) {
  const t = useTranslations('crm.agentesIa'); const [pipelines, setPipelines] = useState<Pipeline[] | null>(null); const [products, setProducts] = useState<Product[]>([]); const [pipelineId, setPipeline] = useState(''); const [rows, setRows] = useState<StageAgent[] | null>(null); const [loading, setLoading] = useState(true); const [failures, setFailures] = useState<FalloLectura[]>([]);
  const [contextAgentId, setContextAgentId] = useState(agentId), [scope, setScope] = useState(0);
  const [dirtyStages, setDirtyStages] = useState<Set<string>>(new Set());
  const reportDirty = useCallback((stageId: string, dirty: boolean) => setDirtyStages(previous => { if (previous.has(stageId) === dirty) return previous; const next = new Set(previous); if (dirty) next.add(stageId); else next.delete(stageId); return next; }), []);
  useEffect(() => { onUnsavedChange?.(dirtyStages.size > 0); }, [dirtyStages, onUnsavedChange]);
  const revision = useRef(0), scopeRevision = useRef(0), readController = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { revision.current++; readController.current?.abort(); readController.current = null; }, []);
  const load = useCallback(async () => {
    readController.current?.abort();
    const controller = new AbortController(), token = ++revision.current;
    readController.current = controller;
    const active = () => token === revision.current && !controller.signal.aborted;
    setLoading(true); setFailures([]);
    async function read<T>(url: string, detail: FalloLectura['detail'], accept: (data: T) => void) {
      try {
        const result = await withRequestDeadline(signal => pedirCrm<T>(url, { signal }), { timeoutMs: tiempoLecturaCrm(), signal: controller.signal });
        if (active()) accept(result.data);
      } catch (error) {
        if (active()) setFailures(previous => [...previous, { detail, forbidden: error instanceof ErrorApiCrm && error.status === 403 }]);
      }
    }
    await Promise.all([
      read<{ pipelines: Pipeline[]; products: Product[] }>('/api/crm/voice-agents/editor-context', 'context', data => {
        if (!Array.isArray(data.pipelines) || !Array.isArray(data.products)) throw new Error('Contexto del editor inválido');
        setPipelines(data.pipelines); setProducts(data.products);
        setPipeline(value => data.pipelines.some(pipeline => pipeline.id === value) ? value : data.pipelines[0]?.id ?? '');
      }),
      read<StageAgent[]>('/api/crm/stage-agents', 'scripts', data => {
        if (!Array.isArray(data)) throw new Error('Guiones de etapas inválidos');
        setRows(data);
      }),
    ]);
    if (active()) setLoading(false);
  }, []);
  useEffect(() => {
    const reset = () => {
      scopeRevision.current++;
      invalidate(); setPipelines(null); setProducts([]); setRows(null); setPipeline(''); setDirtyStages(new Set()); setContextAgentId(agentId); setScope(scopeRevision.current); void load();
    };
    reset();
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, reset);
    return () => { invalidate(); window.removeEventListener(ORGANIZATION_CHANGED_EVENT, reset); };
  }, [agentId, load, invalidate]);
  const ready = contextAgentId === agentId && pipelines !== null && rows !== null;
  const errors = failures.map(({ detail, forbidden }) => <EmptyState key={detail} compacto variante="error" titulo={t(forbidden ? 'detailPermissionError' : 'detailLoadError', { detail: t(detail === 'context' ? 'editorContext' : 'stageScript') })} descripcion={t(forbidden ? 'editorPermissionErrorDescription' : 'editorReadErrorDescription')} onReintentar={() => void load()} />);
  if (!ready) return <div className="space-y-4">{loading && <p role="status">{t('loading')}</p>}{errors}</div>;
  if (!agentId) return <EmptyState titulo={t('stageNew')} accion={{ etiqueta: t('saveInactive'), onClick: onSaveInactive }} />;
  const stages = pipelines.find(p => p.id === pipelineId)?.stages.filter(s => !s.is_won && !s.is_lost).sort((a, b) => a.position - b.position) ?? [];
  const blocked = loading || failures.length > 0;
  return <div className="space-y-4">{loading && <p role="status">{t('loading')}</p>}{errors}<label className="grid gap-1.5 text-sm text-fg">{t('pipeline')}<CrmSelectControl aria-label={t('pipeline')} disabled={blocked || dirtyStages.size > 0} value={pipelineId} onChange={setPipeline} options={pipelines.map(p => ({ value: p.id, label: p.name }))} /></label>{!stages.length && <EmptyState titulo={t('stageEmpty')} />}{stages.map(stage => <StageRow key={`${scope}:${stage.id}:${agentId}`} stage={stage} current={rows.find(row => row.stage_id === stage.id && row.channel === 'voice')} agentId={agentId} form={form} products={products} blocked={blocked} onDirtyChange={reportDirty} onSaved={saved => {
    if (scope !== scopeRevision.current) return;
    setRows(previous => [...(previous ?? []).filter(row => row.id !== saved.id && !(row.stage_id === saved.stage_id && row.channel === saved.channel)), saved]); void load();
  }} />)}</div>;
}
function stageDraft(current: StageAgent | undefined, allowedTools: string[]) {
  const objective = current?.objective ?? 'qualify_lead', trigger = current?.trigger_on ?? 'enter', policy = current?.action_policy ?? 'suggest';
  return { objective, prompt: current?.objective_prompt ?? '', trigger, policy, attempts: current?.max_attempts ?? 3, active: current?.is_active ?? false, tools: current?.allowed_tools ?? [...allowedTools], productId: current?.product_id ?? null, offerPrice: Number(current?.offer?.price ?? 0) };
}
function StageRow({ stage, current, agentId, form, products, blocked, onSaved, onDirtyChange }: { stage: Stage; current?: StageAgent; agentId: string; form: AgentFormState; products: Product[]; blocked: boolean; onSaved: (saved: StageAgent) => void; onDirtyChange: (id: string, dirty: boolean) => void }) {
  const t = useTranslations('crm.agentesIa'); const other = Boolean(current?.voice_agent_id && current.voice_agent_id !== agentId);
  const [productId, setProduct] = useState(current?.product_id ?? null); const [offerPrice, setPrice] = useState(Number(current?.offer?.price ?? 0));
  const [objective, setObjective] = useState(current?.objective ?? 'qualify_lead'); const [prompt, setPrompt] = useState(current?.objective_prompt ?? ''); const [trigger, setTrigger] = useState(current?.trigger_on ?? 'enter'); const [policy, setPolicy] = useState(current?.action_policy ?? 'suggest'); const [attempts, setAttempts] = useState(current?.max_attempts ?? 3); const [active, setActive] = useState(current?.is_active ?? false); const [tools, setTools] = useState(current?.allowed_tools ?? [...form.allowed_tools]); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const draft = JSON.stringify({ objective, prompt, trigger, policy, attempts, active, tools, productId, offerPrice });
  const [savedDraft, setSavedDraft] = useState(draft);
  const [persisted, setPersisted] = useState(current);
  const latestDraft = useRef(draft), savedDraftRef = useRef(savedDraft), busyRef = useRef(busy), writeRevision = useRef(0);
  latestDraft.current = draft; savedDraftRef.current = savedDraft; busyRef.current = busy;
  const restore = useCallback((row: StageAgent | undefined) => {
    const next = stageDraft(row, form.allowed_tools);
    setObjective(next.objective); setPrompt(next.prompt); setTrigger(next.trigger); setPolicy(next.policy); setAttempts(next.attempts); setActive(next.active); setTools(next.tools); setProduct(next.productId); setPrice(next.offerPrice); setSavedDraft(JSON.stringify(next)); setPersisted(row);
  }, [form.allowed_tools]);
  // Una recarga reconcilia filas limpias; un borrador conserva también su
  // versión original para no sobrescribir cambios hechos por otra persona.
  useEffect(() => { if (!busyRef.current && latestDraft.current === savedDraftRef.current) restore(current); }, [current, restore]);
  useEffect(() => () => { writeRevision.current++; }, []);
  useEffect(() => { onDirtyChange(stage.id, draft !== savedDraft); return () => onDirtyChange(stage.id, false); }, [draft, savedDraft, stage.id, onDirtyChange]);
  const save = async () => {
    if (busyRef.current || other || blocked) return;
    const token = writeRevision.current;
    busyRef.current = true; setBusy(true); setError(false);
    try {
      const result = await pedirCrm<StageAgent>('/api/crm/stage-agents', { method: 'POST', cuerpo: { expected_updated_at: persisted?.updated_at ?? null, product_id: productId, offer: { ...persisted?.offer, ...(objective === 'sell_product' ? { price: offerPrice } : {}) }, trigger_config: persisted?.trigger_config ?? {}, config: persisted?.config ?? {}, stage_id: stage.id, voice_agent_id: agentId, channel: 'voice', objective, objective_prompt: prompt, trigger_on: trigger, action_policy: policy, max_attempts: attempts, is_active: active, allowed_tools: [...new Set([...tools.filter(tool => form.allowed_tools.includes(tool)), ...MANDATORY_TOOLS])] } });
      if (token !== writeRevision.current) return;
      setPersisted(result.data);
      if (latestDraft.current === draft) restore(result.data);
      else setSavedDraft(draft);
      onSaved(result.data);
    } catch { if (token === writeRevision.current) setError(true); }
    finally { if (token === writeRevision.current) { busyRef.current = false; setBusy(false); } }
  };
  return <fieldset disabled={blocked} className="min-w-0"><FormSection titulo={`${stage.position + 1} · ${stage.name}`} colapsable abiertaPorDefecto={stage.position === 0 && !other} densidad="compacta" className="sm:p-4" descripcion={other ? t('stageAssigned') : undefined} accion={<label className="inline-flex items-center gap-2 text-sm"><Switch aria-label={`${t('active')} · ${stage.name}`} checked={active && !other} disabled={blocked || other || busy} onCheckedChange={setActive} /></label>} columnas={2}>
    {!other && <><label className="grid gap-1.5 text-sm text-fg">{t('objective')}<CrmSelectControl aria-label={t('objective')} value={objective} onChange={value => setObjective(value as typeof objective)} options={STAGE_AGENT_OBJECTIVES.map(value => ({ value, label: t.has(`purposes.${value}`) ? t(`purposes.${value}`) : value }))} /></label><label className="grid gap-1.5 text-sm text-fg">{t('trigger')}<CrmSelectControl aria-label={t('trigger')} value={trigger} onChange={value => setTrigger(value as typeof trigger)} options={STAGE_AGENT_TRIGGERS.map(value => ({ value, label: t(`triggers.${value}`) }))} /></label><label className="grid gap-1.5 text-sm text-fg">{t('actionPolicy')}<CrmSelectControl aria-label={t('actionPolicy')} value={policy} onChange={value => setPolicy(value as typeof policy)} options={[{ value: 'suggest', label: t('suggest') }, { value: 'auto', label: t('auto') }]} /></label><label className="grid gap-1.5 text-sm text-fg">{t('maxAttempts')}<Input type="number" min={1} max={10} value={attempts} onChange={e => setAttempts(Number(e.target.value))} /></label>{objective === 'sell_product' && <><label className="grid gap-1.5 text-sm text-fg">{t('product')}<select className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm" value={productId ?? ''} onChange={e => setProduct(e.target.value ? Number(e.target.value) : null)}><option value="">{t('chooseProduct')}</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label className="grid gap-1.5 text-sm text-fg">{t('offerPrice')}<Input type="number" min={0} step="any" value={offerPrice} onChange={e => setPrice(Number(e.target.value))} /></label></>}<label className="grid gap-1.5 text-sm text-fg md:col-span-2">{t('objectivePrompt')}<Textarea rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} /></label><div className="md:col-span-2"><ChipsOpcion multiple etiqueta={t('toolsTitle')} valor={[...new Set([...tools, ...MANDATORY_TOOLS])]} opciones={[...new Set([...form.allowed_tools, ...MANDATORY_TOOLS])].map(tool => ({ valor: tool, etiqueta: t.has(`tools.${tool}`) ? t(`tools.${tool}`) : tool, deshabilitada: (MANDATORY_TOOLS as readonly string[]).includes(tool), motivo: t('mandatory') }))} onValorChange={setTools} /></div>{error && <div className="md:col-span-2"><EmptyState variante="error" titulo={t('saveError')} onReintentar={() => void save()} /></div>}<button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario', tamano: 'sm' })} disabled={blocked || busy} onClick={() => void save()}>{busy ? t('loading') : t('stageSave')}</button></>}
  </FormSection></fieldset>;
}
