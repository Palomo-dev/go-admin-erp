'use client';
import { useTranslations } from 'next-intl';
import { FormSection, EmptyState } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { VOICE_AGENT_ENGINES } from '@/lib/crm/enums';
import type { VoiceCatalogState } from '../useVoiceCatalog';
import { useAudioPreview } from '../voces/useAudioPreview';
import type { AgentFormState } from './useAgentForm';
export function AgentVoiceTab({ form, patch, catalog, onGoToVoices }: { form: AgentFormState; patch: (value: Partial<AgentFormState>) => void; catalog: VoiceCatalogState; onGoToVoices?: () => void }) {
  const t = useTranslations('crm.agentesIa'); const player = useAudioPreview();
  return <FormSection titulo={t('steps.voice')} columnas={2}>
    <label className="grid gap-1.5 text-sm text-fg">{t('language')}<Input value={form.language} onChange={e => patch({ language: e.target.value })} /></label>
    <label className="grid gap-1.5 text-sm text-fg">{t('engine')}<select className="h-10 rounded-md border border-line bg-surface px-3" value={form.engine} onChange={e => patch({ engine: e.target.value })}>{VOICE_AGENT_ENGINES.map(engine => <option key={engine} value={engine} disabled={engine !== 'conversation_relay'}>{engine}{engine !== 'conversation_relay' ? ` · ${t('engineUnavailable')}` : ''}</option>)}</select></label>
    <div role="radiogroup" aria-label={t('steps.voice')} className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:col-span-2"><div className="sm:col-span-2"><label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg"><input type="radio" name="agent-voice" checked={!form.voice_ref_id} onChange={() => patch({ voice_ref_id: null })} />{t('voiceDefault')}{catalog.defaultVoice ? ` · ${catalog.defaultVoice.name}` : ''}</label></div>
    {catalog.loading ? <p role="status">{t('loading')}</p> : catalog.error ? <div className="md:col-span-2"><EmptyState variante="error" titulo={t('loadError')} onReintentar={() => void catalog.reload()} /></div> : !catalog.voices.some(v => v.is_active) ? <div className="md:col-span-2"><EmptyState titulo={t('voiceEmpty')} accion={onGoToVoices ? { etiqueta: t('voices'), onClick: onGoToVoices } : undefined} /></div> : catalog.voices.filter(v => v.is_active).map(voice => {
      const disabled = voice.kind === 'cloned' && !voice.consent_recorded_at;
      return <div key={voice.id} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${form.voice_ref_id === voice.id ? 'border-brand-action bg-brand-tint' : 'border-line bg-surface'}`}><label className="flex min-w-0 items-center gap-2 text-sm text-fg"><input type="radio" name="agent-voice" checked={form.voice_ref_id === voice.id} disabled={disabled} onChange={() => patch({ voice_ref_id: voice.id })} /><span>{voice.name}<small className="block text-fg-muted">{disabled ? t('consentMissing') : voice.language}</small></span></label><button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={player.status === 'loading'} aria-pressed={player.activeId === voice.id && player.status === 'playing'} aria-label={`${t('preview')} · ${voice.name}`} onClick={() => player.toggle(voice.id, `/api/crm/voices/${voice.id}/preview`)}>{player.activeId === voice.id && player.status === 'playing' ? '■' : '▶'}</button></div>;
    })}
    {player.status === 'error' && <p role="alert" className="text-danger-text">{t('loadError')}</p>}</div>
    <label className="grid gap-1.5 text-sm text-fg">{t('speed')}<Input type="number" min={0.5} max={2} step={0.1} value={Number(form.voice_settings.speed ?? 1)} onChange={e => patch({ voice_settings: { ...form.voice_settings, speed: Number(e.target.value) } })} /></label>
    <label className="grid gap-1.5 text-sm text-fg">{t('stability')}<Input type="number" min={0} max={1} step={0.1} value={Number(form.voice_settings.stability ?? 0.5)} onChange={e => patch({ voice_settings: { ...form.voice_settings, stability: Number(e.target.value) } })} /></label>
    <details className="md:col-span-2 rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm text-fg-secondary">{t('advanced')}</summary><Input className="mt-2" aria-label={t('advanced')} value={form.voice_id} onChange={e => patch({ voice_id: e.target.value })} /></details>
  </FormSection>;
}
