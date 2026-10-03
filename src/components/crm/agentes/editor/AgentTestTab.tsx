'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormField, EmptyState, StatusBadge } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Info, Send, Mic, RefreshCw, Sparkles } from 'lucide-react';
import { CrmSelectControl } from '../CrmSelectControl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { agentFormToBody, type AgentFormState } from './useAgentForm';
import type { VoiceAgentTestResult } from '@/lib/services/crm/voiceAgentTestService';
import type { StageAgent } from '@/lib/services/crm/stageAgentService';
interface SpeechRecognitionLocal { lang: string; interimResults: boolean; onresult: ((event: { results: { 0: { transcript: string } }[] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; abort: () => void; }
export function AgentTestTab({ form, agentId, onTested }: { form: AgentFormState; agentId: string | null; onTested: () => void }) {
  const t = useTranslations('crm.agentesIa'); const [name, setName] = useState(''); const [context, setContext] = useState(''); const [message, setMessage] = useState('');
  const [stageId, setStage] = useState(''); const [stages, setStages] = useState<StageAgent[]>([]); const [stageError, setStageError] = useState(false);
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]); const [last, setLast] = useState<VoiceAgentTestResult | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [micError, setMicError] = useState(false); const [listening, setListening] = useState(false);
  const stageRevision = useRef(0); const [stageLoading, setStageLoading] = useState(false); const revision = useRef(0); const lock = useRef(false); const recognition = useRef<SpeechRecognitionLocal | null>(null);
  const configKey = JSON.stringify(form);
  const invalidate = useCallback(() => { revision.current++; recognition.current?.abort(); }, []);
  useEffect(() => { revision.current++; setTurns([]); setLast(null); setError(false); setBusy(false); lock.current = false; return invalidate; }, [configKey, name, context, stageId, invalidate]);
  const loadStages = useCallback(() => { setStageError(false); setStages([]); if (!agentId) return; const current = ++stageRevision.current; setStageLoading(true); pedirCrm<StageAgent[]>('/api/crm/stage-agents').then(result => { if (!Array.isArray(result.data)) throw new Error('invalid'); if (current === stageRevision.current) setStages(result.data.filter(row => row.voice_agent_id === agentId && row.is_active)); }).catch(() => { if (current === stageRevision.current) setStageError(true); }).finally(() => { if (current === stageRevision.current) setStageLoading(false); }); }, [agentId]);
  const invalidateStages = useCallback(() => { stageRevision.current++; }, []);
  useEffect(() => { loadStages(); return invalidateStages; }, [loadStages, invalidateStages]);
  const send = async () => {
    if (lock.current || !message.trim() || !name.trim()) return;
    const current = revision.current; lock.current = true; setBusy(true); setError(false); const text = message;
    try {
      const result = await pedirCrm<VoiceAgentTestResult>(agentId ? `/api/crm/voice-agents/${agentId}/test` : '/api/crm/voice-agents/test', { method: 'POST', cuerpo: { draft: agentFormToBody(form), customer: { name, context }, stage_agent_id: stageId || null, message: text, history: turns } });
      if (current !== revision.current) return;
      setTurns(previous => [...previous, { role: 'user', content: text }, { role: 'assistant', content: result.data.reply }]); setLast(result.data); setMessage(''); onTested();
    } catch { if (current === revision.current) setError(true); }
    finally { if (current === revision.current) { lock.current = false; setBusy(false); } }
  };
  const dictate = () => {
    const ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLocal; webkitSpeechRecognition?: new () => SpeechRecognitionLocal }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLocal }).webkitSpeechRecognition;
    if (!ctor) { setMicError(true); return; }
    try { recognition.current?.abort(); const mic = new ctor(); recognition.current = mic; const current = revision.current; mic.lang = form.language; mic.interimResults = false; mic.onresult = event => { if (current === revision.current) setMessage(event.results[0][0].transcript); }; mic.onerror = () => { setMicError(true); setListening(false); }; mic.onend = () => setListening(false); mic.start(); setListening(true); setMicError(false); } catch { setMicError(true); setListening(false); }
  };
  return <div className="space-y-4"><h2 hidden>{t('testTitle')}</h2><div className="grid gap-3 sm:grid-cols-2">
    <FormField etiqueta={t('fictionalCustomer')}><Input disabled={busy} value={name} maxLength={100} onChange={e => setName(e.target.value)} /></FormField>
    <FormField etiqueta={t('stage')}><CrmSelectControl aria-label={t('stage')} value={stageId} disabled={busy || stageLoading || stageError} onChange={setStage} options={[{ value: '', label: stageLoading ? t('loading') : t('testStageDefault') }, ...stages.map(row => ({ value: row.id, label: t.has(`purposes.${row.objective}`) ? t(`purposes.${row.objective}`) : row.objective }))]} /></FormField>
    {stageError && <div className="sm:col-span-2"><EmptyState variante="error" titulo={t('stageLoadError')} onReintentar={loadStages} /></div>}
  </div>
    <div role="note" className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3"><Info className="mt-0.5 size-4 shrink-0 text-info-text" strokeWidth={1.5} aria-hidden /><div><p className="text-sm font-medium text-info-text">{t('testModeTitle')}</p><p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t('testDescription')}</p></div></div>
    <section aria-label={t('testTitle')} className="space-y-3 rounded-xl border border-line bg-subtle p-4">
      {!turns.length && <EmptyState compacto titulo={t('testEmpty')} descripcion={t('testDescription')} />}
      <div role="log" aria-live="polite" className="max-h-64 space-y-2.5 overflow-y-auto">{turns.map((turn, i) => <div key={i} className={`max-w-[66%] whitespace-pre-wrap rounded-xl border p-3 text-[13px] leading-[18px] ${turn.role === 'user' ? 'ml-auto border-line-brand bg-brand-tint text-fg' : 'mr-auto border-line bg-surface text-fg'}`}><p className={`mb-1 text-xs leading-4 ${turn.role === 'user' ? 'text-brand-deep' : 'text-fg-secondary'}`}>{turn.role === 'user' ? t('customerRole') : form.name}</p><p>{turn.content}</p></div>)}</div>
      {last && <><div className="flex flex-wrap items-center gap-1.5"><Sparkles className="size-4 text-brand-deep" strokeWidth={1.5} aria-hidden /><span className="text-xs text-fg-secondary">{t('toolsTitle')}:</span>{last.tool_calls.map(call => <details key={call.id} className="text-xs"><summary className="list-none cursor-pointer"><StatusBadge estado={call.status} etiqueta={`${t.has(`tools.${call.name}`) ? t(`tools.${call.name}`) : call.name} · ${t(call.status)}`} tono={call.status === 'suggested' ? 'informacion' : 'advertencia'} /></summary><pre className="mt-2 max-w-full overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-xs text-fg-secondary">{JSON.stringify(call.args, null, 2)}</pre></details>)}</div><p role="status" className="text-xs text-fg-secondary">{t('testUsage', { model: last.model, tokens: last.usage.prompt_tokens + last.usage.completion_tokens, credits: last.credits })}</p></>}
    </section>
    <div className="flex items-end gap-2"><FormField etiqueta={t('message')} etiquetaOculta className="min-w-0 flex-1"><Textarea className="min-h-10 rounded-lg" rows={1} maxLength={3000} value={message} placeholder={t('messagePlaceholder')} disabled={busy} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} /></FormField><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario', className: 'size-10 px-0' })} disabled={busy || listening} aria-label={t('mic')} onClick={dictate}><Mic className="size-4" strokeWidth={1.5} aria-hidden /></button><button type="button" className={clasesBoton({ patron: 'button' })} disabled={busy || !name.trim() || !message.trim()} onClick={() => void send()}><Send className="size-4" strokeWidth={1.5} aria-hidden />{busy ? t('loading') : t('send')}</button><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma', className: 'size-10 px-0' })} disabled={busy} aria-label={t('reset')} onClick={() => { revision.current++; setTurns([]); setLast(null); setError(false); }}><RefreshCw className="size-4" strokeWidth={1.5} aria-hidden /></button></div>
    <details className="text-[13px] text-fg-secondary"><summary className="cursor-pointer">{t('fictionalContext')}</summary><FormField etiqueta={t('fictionalContext')} etiquetaOculta><Textarea className="mt-2" rows={2} disabled={busy} value={context} maxLength={2000} onChange={e => setContext(e.target.value)} /></FormField></details>
    {error && <EmptyState variante="error" titulo={t('testError')} onReintentar={() => void send()} />}
    {micError && <p role="alert" className="text-sm text-danger-text">{t('micUnavailable')}</p>}
  </div>;
}
