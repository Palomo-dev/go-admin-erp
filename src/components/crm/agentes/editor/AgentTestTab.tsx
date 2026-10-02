'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormSection, EmptyState } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
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
  return <div className="space-y-4"><FormSection titulo={t('testTitle')} descripcion={t('testDescription')} columnas={2}>
    <label className="grid gap-1.5 text-sm text-fg">{t('fictionalCustomer')}<Input disabled={busy} value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
    <label className="grid gap-1.5 text-sm text-fg">{t('stage')}<select className="h-10 rounded-md border border-line bg-surface px-3" value={stageId} disabled={busy || stageLoading || stageError} onChange={e => setStage(e.target.value)}><option value="">{stageLoading ? t('loading') : t('testStageDefault')}</option>{stages.map(row => <option key={row.id} value={row.id}>{t.has(`purposes.${row.objective}`) ? t(`purposes.${row.objective}`) : row.objective}</option>)}</select></label>
    {stageError && <div className="md:col-span-2"><EmptyState variante="error" titulo={t('stageLoadError')} onReintentar={loadStages} /></div>}
    <label className="grid gap-1.5 text-sm text-fg md:col-span-2">{t('fictionalContext')}<Textarea rows={2} disabled={busy} value={context} maxLength={2000} onChange={e => setContext(e.target.value)} /></label>
  </FormSection><section aria-label={t('testTitle')} className="space-y-3 rounded-xl border border-line bg-surface p-4">
    {!turns.length && <EmptyState titulo={t('testEmpty')} />}
    <div role="log" aria-live="polite" className="max-h-72 space-y-3 overflow-y-auto">{turns.map((turn, i) => <p key={i} className={`whitespace-pre-wrap rounded-lg p-3 text-sm ${turn.role === 'user' ? 'ml-8 bg-brand-tint text-fg' : 'mr-8 bg-subtle text-fg'}`}>{turn.content}</p>)}</div>
    {last && <><ul className="space-y-1 text-sm">{last.tool_calls.map(call => <li key={call.id} className="rounded-md border border-line p-2"><strong>{t.has(`tools.${call.name}`) ? t(`tools.${call.name}`) : call.name}</strong> · {t(call.status)}<pre className="overflow-auto whitespace-pre-wrap text-xs text-fg-muted">{JSON.stringify(call.args, null, 2)}</pre></li>)}</ul><p role="status" className="text-xs text-fg-muted">{t('testUsage', { model: last.model, tokens: last.usage.prompt_tokens + last.usage.completion_tokens, credits: last.credits })}</p></>}
    <label className="grid gap-1.5 text-sm text-fg">{t('message')}<Textarea rows={2} maxLength={3000} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} /></label>
    {error && <EmptyState variante="error" titulo={t('testError')} onReintentar={() => void send()} />}
    {micError && <p role="alert" className="text-sm text-danger-text">{t('micUnavailable')}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={clasesBoton({ variante: 'primario' })} disabled={busy || !name.trim() || !message.trim()} onClick={() => void send()}>{busy ? t('loading') : t('send')}</button><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={busy || listening} onClick={dictate}>{t('mic')}</button><button type="button" className={clasesBoton({ variante: 'fantasma' })} disabled={busy} onClick={() => { revision.current++; setTurns([]); setLast(null); setError(false); }}>{t('reset')}</button></div>
  </section></div>;
}
