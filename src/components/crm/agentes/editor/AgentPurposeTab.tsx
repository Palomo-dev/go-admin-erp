'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FormSection, EmptyState } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { VOICE_AGENT_PURPOSES } from '@/lib/crm/enums';
import { useAgentModels } from './agentModels';
import type { AgentFormState } from './useAgentForm';
export function AgentPurposeTab({ form, patch, isNew }: { form: AgentFormState; patch: (value: Partial<AgentFormState>) => void; isNew: boolean }) {
  const t = useTranslations('crm.agentesIa'); const models = useAgentModels(form.llm_model);
  useEffect(() => { if (isNew && !form.llm_model && models.defaultValue) patch({ llm_model: models.defaultValue }); }, [form.llm_model, isNew, models.defaultValue, patch]);
  const compatible = models.options.filter(model => model.provider === 'openai' || model.fueraDeCatalogo);
  const field = (key: 'name' | 'identity_disclosure', label: string) => <label className="grid gap-1.5 text-sm text-fg">{label}<Input value={form[key]} required onChange={e => patch({ [key]: e.target.value })} /></label>;
  return <div className="space-y-4">
    <FormSection titulo={t('steps.purpose')} columnas={2}>
      <div className="md:col-span-2">{field('name', t('name'))}</div>
      <label className="grid gap-1.5 text-sm text-fg">{t('purpose')}<select className="h-10 rounded-md border border-line bg-surface px-3" value={form.purpose_type} onChange={e => patch({ purpose_type: e.target.value })}>{VOICE_AGENT_PURPOSES.map(value => <option key={value} value={value}>{t(`purposes.${value}`)}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm text-fg">{t('model')}<select className="h-10 rounded-md border border-line bg-surface px-3" value={form.llm_model} disabled={models.loading || Boolean(models.error)} onChange={e => patch({ llm_model: e.target.value })}><option value="">{models.loading ? t('loading') : t('modelEmpty')}</option>{compatible.map(model => <option key={model.value} value={model.value}>{model.label}</option>)}</select></label>
      {models.error && <div className="md:col-span-2"><EmptyState variante="error" titulo={t('modelError')} onReintentar={models.reload} /></div>}
      <label className="grid gap-1.5 text-sm text-fg">{t('maxTurns')}<Input type="number" min={1} max={100} value={form.max_turns} onChange={e => patch({ max_turns: Number(e.target.value) })} /></label>
      <label className="grid gap-1.5 text-sm text-fg">{t('maxDuration')}<Input type="number" min={30} max={3600} value={form.max_duration_seconds} onChange={e => patch({ max_duration_seconds: Number(e.target.value) })} /></label>
    </FormSection>
    <FormSection titulo={t('identity')} descripcion={t('guardrails')}>
      {field('identity_disclosure', t('identity'))}
      <label className="grid gap-1.5 text-sm text-fg">{t('firstMessage')}<Textarea rows={3} value={form.first_message} onChange={e => patch({ first_message: e.target.value })} /></label>
      <label className="grid gap-1.5 text-sm text-fg">{t('systemPrompt')}<Textarea rows={5} value={form.system_prompt} onChange={e => patch({ system_prompt: e.target.value })} /></label>
    </FormSection>
  </div>;
}
