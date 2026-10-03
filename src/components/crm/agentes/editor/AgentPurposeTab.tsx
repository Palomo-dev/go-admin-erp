'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CrmSelectControl } from '../CrmSelectControl';
import { ShieldCheck } from 'lucide-react';
import { FormField, EmptyState } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { VOICE_AGENT_PURPOSES } from '@/lib/crm/enums';
import { useAgentModels } from './agentModels';
import type { AgentFormState } from './useAgentForm';
const CONTROL = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-normal text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-line-strong dark:bg-surface dark:text-fg';
export function AgentPurposeTab({ form, patch, isNew }: { form: AgentFormState; patch: (value: Partial<AgentFormState>) => void; isNew: boolean }) {
  const t = useTranslations('crm.agentesIa'); const models = useAgentModels(form.llm_model);
  useEffect(() => { if (isNew && !form.llm_model && models.defaultValue) patch({ llm_model: models.defaultValue }); }, [form.llm_model, isNew, models.defaultValue, patch]);
  const compatible = models.options.filter(model => model.provider === 'openai' || model.fueraDeCatalogo);
  return <div className="space-y-4">
    <fieldset aria-label={t('steps.purpose')} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <FormField etiqueta={t('name')} obligatorio tamanoEtiqueta="sm" className="sm:col-span-2"><Input className={CONTROL} aria-label={t('name')} value={form.name} required onChange={e => patch({ name: e.target.value })} /></FormField>
      <FormField etiqueta={t('purpose')} tamanoEtiqueta="sm"><CrmSelectControl className={CONTROL} aria-label={t('purpose')} value={form.purpose_type} onChange={value => patch({ purpose_type: value })} options={VOICE_AGENT_PURPOSES.map(value => ({ value, label: t(`purposes.${value}`) }))} /></FormField>
      <FormField etiqueta={t('model')} tamanoEtiqueta="sm"><CrmSelectControl className={CONTROL} aria-label={t('model')} value={form.llm_model} disabled={models.loading || Boolean(models.error)} onChange={value => patch({ llm_model: value })} options={[{ value: '', label: models.loading ? t('loading') : t('modelEmpty') }, ...compatible.map(model => ({ value: model.value, label: model.label }))]} /></FormField>
      {models.error && <div className="sm:col-span-2"><EmptyState variante="error" titulo={t('modelError')} onReintentar={models.reload} /></div>}
      <FormField etiqueta={t('maxTurns')} tamanoEtiqueta="sm" ayuda={t('maxTurnsHint')}><Input className={CONTROL} type="number" min={1} max={100} value={form.max_turns} onChange={e => patch({ max_turns: Number(e.target.value) })} /></FormField>
      <FormField etiqueta={t('maxDuration')} tamanoEtiqueta="sm" ayuda={t('maxDurationHint')}><Input className={CONTROL} type="number" min={30} max={3600} value={form.max_duration_seconds} onChange={e => patch({ max_duration_seconds: Number(e.target.value) })} /></FormField>
    </fieldset>
    <section aria-labelledby="agent-identity-title" className="space-y-4"><h3 id="agent-identity-title" className="text-xs font-medium leading-4 text-fg-secondary">{t('identitySection')}</h3>
      <div role="note" className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle p-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-text" strokeWidth={1.5} aria-hidden /><div><p className="text-sm font-medium text-success-text">{t('guardrailsTitle')}</p><p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t('guardrails')}</p></div></div>
      <FormField etiqueta={t('identity')} obligatorio tamanoEtiqueta="sm"><Input className={CONTROL} aria-label={t('identity')} value={form.identity_disclosure} required onChange={e => patch({ identity_disclosure: e.target.value })} /></FormField>
      <FormField etiqueta={t('firstMessage')} tamanoEtiqueta="sm"><Textarea className="min-h-16 text-[13px] leading-[18px]" rows={2} value={form.first_message} onChange={e => patch({ first_message: e.target.value })} /></FormField>
      <FormField etiqueta={t('systemPrompt')} tamanoEtiqueta="sm"><Textarea rows={5} value={form.system_prompt} onChange={e => patch({ system_prompt: e.target.value })} /></FormField>
    </section>
  </div>;
}
