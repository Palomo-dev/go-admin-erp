'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Stepper, EmptyState } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { useVoiceCatalog } from './useVoiceCatalog';
import { useAgentForm, type AgentDraft } from './editor/useAgentForm';
import { AgentPurposeTab } from './editor/AgentPurposeTab';
import { AgentScriptTab } from './editor/AgentScriptTab';
import { AgentVoiceTab } from './editor/AgentVoiceTab';
import { AgentToolsTab } from './editor/AgentToolsTab';
import { AgentTestTab } from './editor/AgentTestTab';
export type { AgentDraft } from './editor/useAgentForm';
const STEPS = ['purpose', 'script', 'voice', 'tools', 'test'] as const;
type Step = typeof STEPS[number];
export function AgentEditorDialog({ draft, initialStep = 'purpose', onClose, onSaved, onGoToVoices }: { draft: AgentDraft; initialStep?: Step; onClose: () => void; onSaved: () => void; onGoToVoices?: () => void }) {
  const t = useTranslations('crm.agentesIa'); const api = useAgentForm(draft); const catalog = useVoiceCatalog(); const [step, setStep] = useState<Step>(initialStep); const [tested, setTested] = useState(false); const [invalidJson, setInvalidJson] = useState<string[]>([]); const onCloseAutoFocus = useReturnFocus(true);
  const index = STEPS.indexOf(step); const configKey = JSON.stringify({ ...api.form, is_active: undefined });
  useEffect(() => { setTested(false); }, [configKey]);
  const next = () => { if (!api.validate()) return; if (!invalidJson.length) setStep(STEPS[Math.min(index + 1, 4)]); };
  const saveInactive = async () => { if (await api.save(true)) setStep('script'); };
  const save = async () => { if (invalidJson.length) return; if (await api.save()) onSaved(); };
  return <Sheet open onOpenChange={open => !open && onClose()}><SheetContent side="right" hideCloseButton onCloseAutoFocus={onCloseAutoFocus} className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-surface p-0 sm:max-w-2xl">
    <SheetHeader className="relative border-b border-line px-5 py-4 pr-12 text-left"><SheetTitle>{draft.mode === 'edit' ? t('edit') : t('new')}</SheetTitle><SheetDescription>{t('subtitle')}</SheetDescription><SheetClose className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'absolute right-3 top-3' })} aria-label={t('close')}><X className="size-4" strokeWidth={1.5} aria-hidden /></SheetClose></SheetHeader>
    {api.loading ? <p role="status" className="p-6 text-fg-muted">{t('loading')}</p> : api.loadFailed ? <div className="flex-1 p-5"><EmptyState variante="error" titulo={api.error ?? t('loadError')} onReintentar={api.reload} /></div> : <><div className="border-b border-line px-5 py-3"><Stepper pasos={STEPS.map(value => ({ valor: value, etiqueta: t(`steps.${value}`) }))} actual={step} onPasoClick={value => { if (!api.saving && !invalidJson.length) setStep(value as Step); }} etiqueta={t('edit')} resumenMovil={(number, total, label) => t('step', { number, total, label })} /></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{api.error && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{api.error}</p>}
        {step === 'purpose' && <AgentPurposeTab form={api.form} patch={api.patch} isNew={!api.persistedId} />}
        {step === 'script' && <AgentScriptTab form={api.form} agentId={api.persistedId} onSaveInactive={() => void saveInactive()} />}
        {step === 'voice' && <AgentVoiceTab form={api.form} patch={api.patch} catalog={catalog} onGoToVoices={onGoToVoices} />}
        {step === 'tools' && <AgentToolsTab form={api.form} patch={api.patch} onJsonValidity={(key, valid) => setInvalidJson(value => valid ? value.filter(item => item !== key) : [...new Set([...value, key])])} />}
        {step === 'test' && <><AgentTestTab form={api.form} agentId={api.persistedId} onTested={() => setTested(true)} /><label className="flex min-h-10 items-center gap-2 text-sm text-fg"><input type="checkbox" checked={api.form.is_active} onChange={e => api.patch({ is_active: e.target.checked })} />{t('active')}</label>{api.form.is_active && !tested && <p role="status" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">{t('activateWarning')}</p>}</>}
      </div></>}
    <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]"><button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={index === 0 ? onClose : () => setStep(STEPS[index - 1])}>{index === 0 ? t('cancel') : t('back')}</button><button type="button" className={clasesBoton({ variante: 'primario' })} disabled={api.loading || api.loadFailed || api.saving || invalidJson.length > 0} onClick={index === 4 ? () => void save() : next}>{api.saving ? t('loading') : index === 4 ? t('save') : t('next')}</button></footer>
  </SheetContent></Sheet>;
}
