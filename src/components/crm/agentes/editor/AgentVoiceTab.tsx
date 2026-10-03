'use client';
import { CrmSelectControl } from '../CrmSelectControl';
import { useTranslations } from 'next-intl';
import { Info, Mic, Play, Square } from 'lucide-react';
import { AvatarIniciales, FormField, EmptyState, StatusBadge } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { VOICE_AGENT_ENGINES } from '@/lib/crm/enums';
import type { VoiceCatalogState } from '../useVoiceCatalog';
import { useAudioPreview } from '../voces/useAudioPreview';
import { resolveEffectiveVoice, type AgentFormState } from './useAgentForm';
const CONTROL = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
export function AgentVoiceTab({ form, patch, catalog, onGoToVoices }: { form: AgentFormState; patch: (value: Partial<AgentFormState>) => void; catalog: VoiceCatalogState; onGoToVoices?: () => void }) {
  const t = useTranslations('crm.agentesIa'), player = useAudioPreview();
  const effective = resolveEffectiveVoice(form, catalog.voices);
  const effectiveName = effective.source === 'agent' || effective.source === 'default' ? effective.voice.name : effective.source === 'loose' ? effective.voiceId : t('voiceDefault');
  return <div className="space-y-4">
    <div role="status" className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3"><Info className="mt-0.5 size-4 shrink-0 text-info-text" strokeWidth={1.5} aria-hidden /><div><p className="text-sm font-medium text-info-text">{t('effectiveVoice', { name: effectiveName })}</p><p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t('voiceDefault')}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><FormField etiqueta={t('language')}><Input className={CONTROL} value={form.language} onChange={e => patch({ language: e.target.value })} /></FormField><FormField etiqueta={t('engine')}><CrmSelectControl className={CONTROL} aria-label={t('engine')} value={form.engine} onChange={value => patch({ engine: value })} options={VOICE_AGENT_ENGINES.map(value => ({ value, label: value === 'conversation_relay' ? 'Conversation Relay' : value, disabled: value !== 'conversation_relay' }))} /></FormField></div>
    <section aria-label={t('voices')} className="space-y-2"><h3 className="text-xs font-medium leading-4 text-fg-secondary">{t('organizationVoices')}</h3>
      <div role="radiogroup" aria-label={t('steps.voice')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.loading ? <p role="status">{t('loading')}</p> : catalog.error ? <div className="sm:col-span-2"><EmptyState variante="error" titulo={t('loadError')} onReintentar={() => void catalog.reload()} /></div> : !catalog.voices.some(v => v.is_active) ? <div className="sm:col-span-2"><EmptyState titulo={t('voiceEmpty')} accion={onGoToVoices ? { etiqueta: t('voices'), onClick: onGoToVoices } : undefined} /></div> : catalog.voices.filter(v => v.is_active).map(voice => {
          const disabled = voice.kind === 'cloned' && !voice.consent_recorded_at, checked = form.voice_ref_id === voice.id;
          return <div key={voice.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 ${checked ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface'}`}><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-fg"><input className="sr-only peer" type="radio" name="agent-voice" checked={checked} disabled={disabled} onChange={() => patch({ voice_ref_id: voice.id })} /><span className="rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-brand"><AvatarIniciales nombre={voice.name} tamano="md" /></span><span className="min-w-0"><span className="block truncate font-medium">{voice.name}</span><span className="mt-1 flex flex-wrap gap-1"><StatusBadge estado="kind" etiqueta={t(voice.kind === 'cloned' ? 'voiceCloned' : 'voiceCatalog')} tono="neutro" /><StatusBadge estado="language" etiqueta={voice.language} tono="neutro" />{voice.is_default && <StatusBadge estado="default" etiqueta={t('byDefault')} tono="marca" />}</span><small className="mt-1 block text-xs leading-4 text-fg-secondary">{disabled ? t('consentMissing') : voice.description || (voice.kind === 'cloned' ? t('consentRecorded') : voice.language)}</small></span></label><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma', tamano: 'sm', className: 'size-8 shrink-0 px-0' })} disabled={player.status === 'loading'} aria-pressed={player.activeId === voice.id && player.status === 'playing'} aria-label={`${t('preview')} · ${voice.name}`} onClick={() => player.toggle(voice.id, `/api/crm/voices/${voice.id}/preview`)}>{player.activeId === voice.id && player.status === 'playing' ? <Square className="size-4" strokeWidth={1.5} aria-hidden /> : <Play className="size-4" strokeWidth={1.5} aria-hidden />}</button></div>;
        })}
      </div>
      <label className="inline-flex min-h-8 items-center gap-2 text-[13px] text-fg-secondary"><input type="radio" name="agent-voice" checked={!form.voice_ref_id} onChange={() => patch({ voice_ref_id: null })} />{t('voiceDefault')}{catalog.defaultVoice ? ` · ${catalog.defaultVoice.name}` : ''}</label>
      {player.status === 'error' && <p role="alert" className="text-danger-text">{t('loadError')}</p>}
    </section>
    <div className="grid gap-3 sm:grid-cols-2"><FormField etiqueta={t('speed')}><Input className={CONTROL} type="number" min={0.5} max={2} step={0.1} value={Number(form.voice_settings.speed ?? 1)} onChange={e => patch({ voice_settings: { ...form.voice_settings, speed: Number(e.target.value) } })} /></FormField><FormField etiqueta={t('stability')}><Input className={CONTROL} type="number" min={0} max={1} step={0.1} value={Number(form.voice_settings.stability ?? 0.5)} onChange={e => patch({ voice_settings: { ...form.voice_settings, stability: Number(e.target.value) } })} /></FormField></div>
    <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-[13px] leading-[18px] text-fg-secondary">{t('advanced')}</summary><Input className={`${CONTROL} mt-2`} aria-label={t('advanced')} value={form.voice_id} onChange={e => patch({ voice_id: e.target.value })} /></details>
    {onGoToVoices && <button type="button" className="flex items-center gap-2 text-[13px] leading-[18px] text-brand" onClick={onGoToVoices}><Mic className="size-4" strokeWidth={1.5} aria-hidden />{t('manageVoices')}</button>}
  </div>;
}
