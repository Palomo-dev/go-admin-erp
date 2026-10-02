'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, FormSection } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ALL_TOOL_NAMES } from '@/lib/services/crm/voiceAgentToolCatalog';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { isMandatoryTool, toggleAllowedTool, type AgentFormState } from './useAgentForm';
function JsonField({ label, value, onChange, onValidity }: { label: string; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const t = useTranslations('crm.agentesIa'); const [raw, setRaw] = useState(JSON.stringify(value, null, 2)); const [error, setError] = useState(false);
  return <label className="grid gap-1.5 text-sm text-fg">{label}<Textarea rows={3} value={raw} aria-invalid={error} onChange={e => { setRaw(e.target.value); try { const parsed: unknown = JSON.parse(e.target.value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object'); onChange(parsed as Record<string, unknown>); setError(false); onValidity(true); } catch { setError(true); onValidity(false); } }} />{error && <span role="alert" className="text-danger-text">{t('jsonError')}</span>}</label>;
}
export function AgentToolsTab({ form, patch, onJsonValidity }: { form: AgentFormState; patch: (value: Partial<AgentFormState>) => void; onJsonValidity: (key: string, valid: boolean) => void }) {
  const t = useTranslations('crm.agentesIa'); const [policy, setPolicy] = useState<string | null>(null); const [policyError, setPolicyError] = useState(false); const [policyLoading, setPolicyLoading] = useState(true); const [revision, setRevision] = useState(0); const reloadPolicy = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { let alive = true; setPolicyLoading(true); setPolicyError(false); pedirCrm<{ data_policy_url: string | null }>('/api/crm/voice-agents/editor-context').then(result => { if (alive) setPolicy(result.data.data_policy_url); }).catch(() => { if (alive) setPolicyError(true); }).finally(() => { if (alive) setPolicyLoading(false); }); return () => { alive = false; }; }, [revision]);
  return <div className="space-y-4"><FormSection titulo={t('toolsTitle')} columnas={2}>
    {ALL_TOOL_NAMES.map(tool => <label key={tool} className="flex min-h-10 items-center gap-2 text-sm text-fg"><input type="checkbox" checked={isMandatoryTool(tool) || form.allowed_tools.includes(tool)} disabled={isMandatoryTool(tool)} onChange={e => patch({ allowed_tools: toggleAllowedTool(form.allowed_tools, tool, e.target.checked) })} /><span>{t.has(`tools.${tool}`) ? t(`tools.${tool}`) : tool}</span>{isMandatoryTool(tool) && <small className="text-warning-text">{t('mandatory')}</small>}</label>)}
  </FormSection><FormSection titulo={t('compliance')} descripcion={t('complianceDescription')} columnas={2}>
    <p className="text-sm text-fg-secondary md:col-span-2">{t('dataPolicy')}: {policyLoading ? t('loading') : policyError ? t('loadError') : policy && /^https?:\/\//.test(policy) ? <a className="text-brand-action underline" href={policy} target="_blank" rel="noreferrer">{policy}</a> : t('policyMissing')}</p>{policyError && <div className="md:col-span-2"><EmptyState variante="error" titulo={t('loadError')} onReintentar={reloadPolicy} /></div>}<label className="grid gap-1.5 text-sm text-fg">{t('callsDay')}<Input type="number" min={1} max={500} value={form.max_calls_per_day} onChange={e => patch({ max_calls_per_day: Number(e.target.value) })} /></label>
    <label className="grid gap-1.5 text-sm text-fg">{t('callsHour')}<Input type="number" min={1} max={500} value={form.max_calls_per_hour} onChange={e => patch({ max_calls_per_hour: Number(e.target.value) })} /></label>
    <div className="md:col-span-2"><JsonField label={t('transferRules')} value={form.transfer_to_human_rules} onChange={value => patch({ transfer_to_human_rules: value })} onValidity={valid => onJsonValidity('transfer', valid)} /></div>
    <div className="md:col-span-2"><JsonField label={t('businessHours')} value={form.business_hours} onChange={value => patch({ business_hours: value })} onValidity={valid => onJsonValidity('hours', valid)} /></div>
  </FormSection></div>;
}
