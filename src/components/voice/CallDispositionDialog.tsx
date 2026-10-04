'use client';

/**
 * CallDispositionDialog — resultado de la llamada al colgar (FASE-03 §5.2).
 * Resultado (radios) + próxima acción (tarea con fecha / reunión / email /
 * WhatsApp / ninguna) + nota (prefill de la nota en vivo).
 * PATCH /api/crm/calls/[id] { disposition } → calls.metadata, tasks,
 * actividad `call`, opportunities.last_contact_at/contact_result/next_contact_at.
 * Ctrl+Enter guarda; Esc = Omitir. Si aún no hay `calls.id` (webhook tardío),
 * reintenta resolverlo por CallSid hasta 5 veces antes de deshabilitar Guardar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Ban, CalendarClock, Check, PhoneMissed, PhoneOff, Sparkles, Voicemail, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit/botonClases';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { DispositionDueField } from './dock/DispositionDueField';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { type DispositionOutcome } from '@/lib/services/crm/callDispositionService';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { deFechaHoraLocal, hoyMasDias } from '@/components/crm/kit/fechasCrm';
import type { EndedCallInfo } from './SoftphoneProvider';

type NextType = 'none' | 'task' | 'meeting' | 'email' | 'whatsapp' | 'call';
const NEXT_TYPES: NextType[] = ['none', 'task', 'call', 'meeting', 'email', 'whatsapp'];
const OUTCOME_OPTIONS = [
  ['answered', Check], ['voicemail', Voicemail], ['no_answer', PhoneMissed], ['busy', PhoneOff], ['wrong_number', X], ['callback_requested', CalendarClock],
] as const;

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function defaultDue(timezone: string): string {
  return `${hoyMasDias(new Date(), timezone, 1)}T09:00`;
}

interface CallDispositionDialogProps {
  open: boolean;
  ended: EndedCallInfo;
  onClose: () => void;
  onSaved?: (callId: string) => void;
}

export function CallDispositionDialog({ open, ended, onClose, onSaved }: CallDispositionDialogProps) {
  const t = useTranslations('phoneBrowser');
  const tm = useTranslations('phoneVisual');
  const { timezone, isLoading: timezoneLoading } = useOrgTimezone();
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  const [outcome, setOutcome] = useState<DispositionOutcome>(ended.durationSeconds > 0 ? 'answered' : 'no_answer');
  const [doNotCall, setDoNotCall] = useState(false);
  const [optOutConfirmed, setOptOutConfirmed] = useState(false);
  const [extraOutcomes, setExtraOutcomes] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [nextType, setNextType] = useState<NextType>('none');
  const [dueAt, setDueAt] = useState(() => defaultDue(timezone));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState(ended.liveNote ?? '');
  const [saving, setSaving] = useState(false);
  const [callId, setCallId] = useState<string | null>(ended.callId);

  useEffect(() => {
    if (!open || submitting.current) return;
    intent.current = null;
    setOutcome(ended.durationSeconds > 0 ? 'answered' : 'no_answer');
    setNextType('none');
    setDoNotCall(false);
    setOptOutConfirmed(false);
    setExtraOutcomes(false);
    setNotesOpen(false);
    setTitle('');
    setNote(ended.liveNote ?? '');
    setCallId(ended.callId);
  }, [open, ended.callId, ended.callSid, ended.durationSeconds, ended.liveNote]);

  useEffect(() => { if (open && !submitting.current) setDueAt(defaultDue(timezone)); }, [open, timezone]);

  // Resolver calls.id si aún no llegó (webhook del TwiML App tardío).
  useEffect(() => {
    if (callId || !ended.callSid || !open) return;
    let tries = 0;
    let cancelled = false;
    const tick = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/crm/calls?provider_call_sid=${encodeURIComponent(ended.callSid as string)}&limit=1`);
        const body = res.ok ? await res.json() : null;
        const id = body?.data?.[0]?.id as string | undefined;
        if (id && !cancelled) {
          setCallId(id);
          return;
        }
      } catch {
        /* noop */
      }
      if (!cancelled && tries < 5) window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [callId, ended.callSid, open]);

  const canSave = Boolean(callId) && !saving && !timezoneLoading && (!doNotCall || optOutConfirmed);
  const summary = useMemo(() => `${ended.displayName ?? ended.number} · ${formatDuration(ended.durationSeconds)}`, [ended]);

  const save = async () => {
    if (!callId || submitting.current || timezoneLoading || (doNotCall && !optOutConfirmed)) return;
    submitting.current = true;
    setSaving(true);
    try {
      const effectiveNext = doNotCall ? 'none' : nextType;
      const due = effectiveNext !== 'none' && dueAt ? deFechaHoraLocal(dueAt, timezone) : null;
      if (effectiveNext !== 'none' && dueAt && !due) throw new Error('La fecha de seguimiento no es válida');
      const disposition = { outcome, ...(doNotCall ? { do_not_call: true } : {}), note: note.trim() || null, next_action: effectiveNext === 'none' ? null : { type: nextType, due_at: due, title: title.trim() || null } };
      const fingerprint = JSON.stringify(disposition);
      if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
      const res = await fetch(`/api/crm/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_key: intent.current.key, disposition }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
      toast({ title: `Llamada registrada (${formatDuration(ended.durationSeconds)})`, description: body.task_id ? 'Se creó la tarea de seguimiento' : undefined });
      onSaved?.(callId);
      onClose();
    } catch (err) {
      toast({ title: 'No se pudo guardar el resultado', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const selectOutcome = (value: string) => {
    setDoNotCall(value === 'do_not_call');
    if (value !== 'do_not_call') setOutcome(value as DispositionOutcome);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !submitting.current && !saving) onClose(); }}>
      <DialogContent overlayClassName="bg-black/40 backdrop-blur-none" className="max-sm:inset-0 max-sm:flex max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:flex-col max-sm:gap-0 max-sm:overflow-hidden max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:bg-canvas max-sm:p-0 max-sm:[&>button:last-child]:hidden gap-[18px] rounded-2xl border-line bg-surface p-6 text-fg sm:max-w-[520px] sm:rounded-2xl dark:border-line dark:bg-surface"
        onKeyDown={(event) => { if (event.key === 'Enter' && event.ctrlKey && canSave) { event.preventDefault(); void save(); } }}>
        <DialogHeader className="max-sm:shrink-0 max-sm:space-y-0 max-sm:border-b max-sm:border-line max-sm:bg-surface max-sm:pr-0 space-y-1 pr-8 text-left">
          <DialogTitle className="max-sm:flex max-sm:h-14 max-sm:items-center max-sm:gap-3 max-sm:px-4 max-sm:text-base text-lg font-semibold leading-6 text-fg dark:text-fg"><button type="button" onClick={onClose} disabled={saving} aria-label={tm('back')} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-secondary focus-visible:ring-2 focus-visible:ring-brand sm:hidden"><ArrowLeft size={20} strokeWidth={1.5} /></button><span className="sm:hidden">{tm('ended')}</span><span className="hidden sm:inline">{t('resultTitle')}</span></DialogTitle>
          <DialogDescription className="hidden text-[13px] leading-[18px] text-fg-secondary sm:block dark:text-fg-secondary">{summary}</DialogDescription>
        </DialogHeader>
        <div className="contents max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-4 max-sm:overflow-y-auto max-sm:p-4">
        <p className="text-base font-semibold leading-6 text-fg sm:hidden">{summary}</p>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold leading-4 text-fg">{t('howEnded')}</legend>
          <RadioGroup value={doNotCall ? 'do_not_call' : outcome} disabled={saving} onValueChange={selectOutcome} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
            {OUTCOME_OPTIONS.map(([value, Icon]) => <Label key={value} htmlFor={`disp-${value}`} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-normal leading-5 text-fg', !doNotCall && value === outcome && 'border-brand-action bg-brand-tint', (value === 'busy' || value === 'wrong_number') && !extraOutcomes && 'max-sm:hidden')}>
              <RadioGroupItem value={value} id={`disp-${value}`} className="size-4 shrink-0 border-line-strong text-brand-action" />
              <Icon size={16} strokeWidth={1.5} className="shrink-0 text-fg-secondary" />{t(`outcome.${value}`)}
            </Label>)}
            <Label htmlFor="disp-do-not-call" className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm font-normal leading-5 text-fg sm:col-span-2', doNotCall && 'border-danger bg-danger-subtle')}>
              <RadioGroupItem value="do_not_call" id="disp-do-not-call" className="size-4 shrink-0 border-line-strong text-danger" /><Ban size={16} strokeWidth={1.5} className="shrink-0 text-fg-secondary" />{t('doNotCall')}
            </Label>
          </RadioGroup>
          <button type="button" disabled={saving} className="text-left text-xs font-medium text-fg-secondary underline sm:hidden" aria-expanded={extraOutcomes} onClick={() => setExtraOutcomes(value => !value)}>{t('otherOutcomes')}</button>
        </fieldset>

        {doNotCall ? <div className="space-y-3"><div role="status" className="space-y-1 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2.5 text-[13px] leading-[18px] text-danger-text"><p className="font-semibold">{t('excludeHint', { number: ended.number })}</p><p className="text-fg">{t('excludeDetail')}</p></div><Label htmlFor="disp-optout-confirm" className="flex items-start gap-2 text-[13px] font-normal leading-[18px] text-fg"><Checkbox id="disp-optout-confirm" disabled={saving} checked={optOutConfirmed} onCheckedChange={value => setOptOutConfirmed(value === true)} className="mt-px size-[18px] border-line-strong" />{t('optOutConfirm')}</Label></div> : <div className="space-y-2">
          <p id="disp-next-label" className="text-xs font-semibold leading-4 text-fg">{t('nextAction')}</p>
          <ChipsOpcion valor={nextType} onValorChange={setNextType} aria-labelledby="disp-next-label" className="[&_button]:h-7 [&_button]:text-xs" opciones={NEXT_TYPES.map(value => ({ valor: value, etiqueta: t(`nextTypes.${value}`), deshabilitada: saving }))} />
          {nextType !== 'none' && <div className={cn('grid gap-2', nextType === 'task' && 'sm:grid-cols-[1.2fr_1fr]')}>
            {nextType === 'task' && <Input disabled={saving} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('taskTitlePlaceholder')} aria-label={t('taskTitle')} className="h-10 rounded-lg border-line-strong bg-surface text-[13px] text-fg" />}
            <DispositionDueField value={dueAt} onChange={setDueAt} disabled={saving} />
          </div>}
        </div>}

        <button type="button" className="text-left text-xs font-medium text-fg-secondary underline sm:hidden" aria-expanded={notesOpen} onClick={() => setNotesOpen(value => !value)}>{t('note')}</button>
        <div className={cn('space-y-2', !notesOpen && 'max-sm:hidden')}><Label htmlFor="disp-note" className="text-xs font-semibold leading-4 text-fg">{t('note')}</Label>
          <Textarea id="disp-note" disabled={saving} maxLength={20000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('dispositionNotePlaceholder')} className="min-h-[84px] rounded-lg border-line-strong bg-surface px-3 py-2.5 text-[13px] leading-[18px] text-fg dark:bg-surface dark:text-fg" />
        </div>
        {!doNotCall && <p className="hidden items-start gap-2 rounded-lg bg-brand-tint px-3 py-2 text-xs leading-4 text-brand-deep sm:flex"><Sparkles size={16} strokeWidth={1.5} className="shrink-0" />{t('aiHint')}</p>}
        {!callId && <p className="text-xs text-warning-text">{t('awaitingCall')}</p>}
        </div>
        <DialogFooter className="max-sm:shrink-0 max-sm:flex-row max-sm:bg-canvas max-sm:p-4 max-sm:pb-[max(16px,env(safe-area-inset-bottom))] items-center gap-2 sm:gap-2 sm:space-x-0">
          <span className="hidden text-xs leading-4 text-fg-secondary sm:mr-auto sm:block">{t('resultShortcut')}</span>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className={cn(clasesBoton({ variante: 'fantasma', patron: 'button' }), 'hidden sm:inline-flex')}>{t('omit')}</Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave} aria-label={doNotCall ? t('saveAndExclude') : `${t('save')} (Ctrl+Enter)`} className={cn(clasesBoton({ variante: doNotCall ? 'destructivo' : 'primario', patron: 'button' }), 'max-sm:w-full')}>{saving ? t('saving') : <><span className="sm:hidden">{t(doNotCall ? 'saveAndExclude' : 'saveAndClose')}</span><span className="hidden sm:inline">{t(doNotCall ? 'saveAndExclude' : 'save')}</span></>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
