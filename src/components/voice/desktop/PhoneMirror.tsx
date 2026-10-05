'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, ExternalLink, Grid3X3, Mic, MicOff, Minus, Pause, Phone, PhoneOff, Pin, Play, RefreshCw, StickyNote, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { Isotipo } from '@/components/shell/marca/Firma';
import { PhoneDialPad } from './PhoneDialPad';
import { TransferPanel } from '../dock/TransferPanel';
import { usePhoneContext } from '../dock/usePhoneContext';
import type { PhoneControlResult } from '@/lib/services/crm/phoneConferenceTypes';
import { parsePhoneSnapshot, type PhoneAction, type PhoneCommand, type PhoneReply, type PhoneSnapshot, type PhoneTransferValue } from '../../../../electron/src/shared/phoneProtocol';

interface PhoneBridge {
  state(): Promise<PhoneSnapshot | null>; command(command: PhoneCommand): Promise<PhoneReply>;
  close(): Promise<void>; minimize(): Promise<void>; pin(value: boolean): Promise<boolean>; openMain(): Promise<void>;
  onState(callback: (state: PhoneSnapshot | null) => void): () => void;
  missedAction?(action: { id: string; scope: string; action: 'callback' | 'create_lead' }): Promise<{ ok: boolean }>;
}
declare global { interface Window { goAdminPhone?: PhoneBridge } }
const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;
const errorCodes = ['estado_desactualizado', 'controlador_desconectado', 'accion_en_curso', 'sin_respuesta', 'clave_reutilizada', 'numero_invalido', 'accion_fallida'];

/** Espejo de presentación: todos los controles siguen perteneciendo al Device principal. */
export function PhoneMirror() {
  const t = useTranslations('phoneMirror'); const tc = useTranslations('phoneControl'); const tv = useTranslations('phoneVisual'); const pb = useTranslations('phoneBrowser');
  const [state, setState] = useState<PhoneSnapshot | null>(null);
  const [number, setNumber] = useState(''); const [digits, setDigits] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const pending = useRef(false); const current = useRef<PhoneSnapshot | null>(null); const alive = useRef(true);
  const [showTransfer, setShowTransfer] = useState(false); const [showKeypad, setShowKeypad] = useState(false);
  const [pinned, setPinned] = useState(false); const [now, setNow] = useState(Date.now());
  const lookup = usePhoneContext(state?.call?.number ?? number, null, Boolean(state?.organizationId));
  const context = lookup.key.startsWith(`${state?.organizationId}:`) ? lookup : { contact: null, line: null };
  useEffect(() => {
    alive.current = true;
    const bridge = window.goAdminPhone; if (!bridge) return;
    const update = (raw: PhoneSnapshot | null) => {
      if (!alive.current) return;
      try { const next = raw === null ? null : parsePhoneSnapshot(raw); current.current = next; setState(next); }
      catch { current.current = null; setState(null); }
    };
    let received = false;
    const unsubscribe = bridge.onState(raw => { received = true; update(raw); });
    void bridge.state().then(raw => { if (!received) update(raw); }).catch(() => { if (!received) update(null); });
    return () => { alive.current = false; unsubscribe(); };
  }, []);
  useEffect(() => { setNumber(''); setDigits(''); setError(null); setShowTransfer(false); setShowKeypad(false); }, [state?.scope]);
  useEffect(() => { if (state?.callStatus !== 'connected') setShowTransfer(false); }, [state?.callStatus]);
  useEffect(() => { setDigits(''); setNote(current.current?.presentation?.liveNote ?? ''); setShowKeypad(false); }, [state?.scope, state?.call?.number]);
  useEffect(() => {
    if (!state?.call?.connectedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.call?.connectedAt]);
  const command = async (action: PhoneAction, value?: string | boolean | PhoneTransferValue): Promise<PhoneReply> => {
    const bridge = window.goAdminPhone; const snapshot = current.current;
    if (!bridge || !snapshot || pending.current) return { id: '', ok: false, error: 'accion_en_curso' };
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await bridge.command({ id: crypto.randomUUID(), scope: snapshot.scope, revision: snapshot.revision, action, ...(value === undefined ? {} : { value }) });
      if (alive.current && current.current?.scope === snapshot.scope && !result.ok) setError(result.error ?? 'accion_fallida');
      return result;
    } catch {
      if (alive.current && current.current?.scope === snapshot.scope) setError('accion_fallida');
      return { id: '', ok: false, error: 'accion_fallida' };
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const connected = state?.callStatus === 'connected';
  const control = state?.control; const controlBusy = busy || Boolean(control?.busy);
  const controlResult = async (action: PhoneAction, value?: PhoneTransferValue): Promise<PhoneControlResult> => {
    const reply = await command(action, value);
    return reply.ok && reply.control ? { ok: true, state: reply.control }
      : { ok: false, code: 'mirror_error', message: reply.error && errorCodes.includes(reply.error) ? t(`errors.${reply.error}`) : reply.error ?? tc('failed') };
  };
  const inCall = Boolean(state && ['connecting', 'ringing', 'connected'].includes(state.callStatus));
  const canDial = state?.deviceState === 'registered' && !inCall && !state.incoming;
  const offline = !state || (!inCall && state.deviceState !== 'registered');
  const seconds = state?.call?.connectedAt ? Math.max(0, Math.floor((now - state.call.connectedAt) / 1000)) : 0;
  const duration = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const name = state?.call?.displayName ?? state?.call?.number ?? '';
  const errorText = error ? errorCodes.includes(error) ? t(`errors.${error}`) : error : null;
  const noteDirty = note !== (state?.presentation?.liveNote ?? '');
  const windowAction = (run: (() => Promise<unknown>) | undefined) => { void run?.().catch(() => { if (alive.current) setError('accion_fallida'); }); };

  return <main className="flex min-h-dvh flex-col overflow-hidden rounded-[10px] border border-line-strong bg-surface font-sans text-fg" aria-label={t('title')}>
    <header style={drag} className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-subtle/50 pl-3 pr-1">
      <Isotipo tamano={24} />
      <p className="min-w-0 flex-1 truncate text-xs font-medium leading-4 text-fg-secondary">GO Admin · {connected ? `${t('call.connected')} ${duration}` : t('title')}</p>
      <div style={noDrag} className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8 text-fg-secondary" aria-label={t('pin')} aria-pressed={pinned} onClick={() => windowAction(() => window.goAdminPhone?.pin(!pinned).then(setPinned) ?? Promise.resolve())}><Pin size={16} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-fg-secondary" aria-label={t('minimize')} onClick={() => windowAction(window.goAdminPhone?.minimize)}><Minus size={16} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="icon" className="size-8 text-fg-secondary" aria-label={t('close')} onClick={() => windowAction(window.goAdminPhone?.close)}><X size={16} strokeWidth={1.5} /></Button>
      </div>
    </header>
    {!offline && <header className="flex min-h-[61px] shrink-0 items-center gap-3 border-b border-line px-4 py-3">
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Phone size={18} strokeWidth={1.5} /><span className="absolute -right-0.5 top-0 size-2.5 rounded-full border-2 border-surface bg-success" /></span>
      <div className="min-w-0 flex-1"><h1 className="text-sm font-medium leading-5">{t('title')}</h1><p role="status" className="truncate text-xs font-medium leading-4 text-fg-secondary">{connected ? t('call.connected') : t(`device.${state?.deviceState}`)}{state?.presentation?.inputLabel ? ` · ${state.presentation.inputLabel}` : ''}</p></div>
      {connected && <Badge tono="exito" tamano="sm">{t('call.connected')}</Badge>}
      <Button variant="ghost" size="icon" className="size-8 text-fg-secondary" aria-label={t('minimize')} onClick={() => windowAction(window.goAdminPhone?.minimize)}><Minus size={16} strokeWidth={1.5} /></Button>
    </header>}
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {errorText && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-xs text-danger-text">{errorText}</p>}
      {offline ? <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 py-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-warning-subtle text-fg-secondary"><WifiOff size={28} strokeWidth={1.5} /></span>
        <h1 className="text-base font-semibold leading-[22px]">{t('disconnected')}</h1>
        <p role="status" className="text-[13px] leading-[18px] text-fg-secondary">{state?.reason ?? t('openAppHint')}</p>
        <Button className="h-10 w-full bg-brand-action text-sm font-medium" disabled={busy} onClick={() => state ? void command('retry') : windowAction(window.goAdminPhone?.openMain)}><RefreshCw size={16} className="mr-2" strokeWidth={1.5} />{t('retry')}</Button>
        <Button variant="outline" className="h-10 w-full border-line-strong text-sm" onClick={() => windowAction(window.goAdminPhone?.openMain)}><ExternalLink size={16} className="mr-2" strokeWidth={1.5} />{t('openMain')}</Button>
      </div> : state && <>
        {(inCall || state.incoming) && <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
          <AvatarIniciales nombre={name} tamano="md" className="bg-brand font-medium" />
          <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-medium leading-5">{name}</h2>{state.call?.displayName && <p className="mt-0.5 text-xs font-medium leading-4 text-fg-secondary">{state.call.number}</p>}</div>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t('openMain')} onClick={() => windowAction(window.goAdminPhone?.openMain)}><ExternalLink size={16} strokeWidth={1.5} /></Button>
        </div>}
        {state.incoming ? <div className="mt-auto flex gap-3">
          <Button disabled={busy} variant="destructive" className="h-11 flex-1 bg-danger" onClick={() => { void command('reject'); }}><PhoneOff size={18} className="mr-2" />{t('reject')}</Button>
          <Button disabled={busy} className="h-11 flex-1 bg-success hover:bg-success-text" onClick={() => { void command('accept'); }}><Phone size={18} className="mr-2" />{t('answer')}</Button>
        </div> : <>
          {inCall && <div className="flex items-center justify-center gap-2.5 py-1" role="status">{state.recording && <span className="rounded bg-danger-subtle px-1.5 py-1 text-xs font-semibold leading-4 text-danger-text"><span aria-hidden="true">● </span>REC</span>}<span className="text-[28px] font-semibold leading-9 tracking-[-.4px] tabular-nums">{connected ? duration : t(`call.${state.callStatus}`)}</span></div>}
          {connected && <div className="flex justify-between gap-2">
            <Control label={t(state.muted ? 'unmute' : 'mute')} active={state.muted} disabled={controlBusy || (control?.held && control.phase !== 'consulting')} icon={state.muted ? MicOff : Mic} onClick={() => { void command('mute', !state.muted); }} />
            {control?.supported && <Control label={tc(control.held ? 'resume' : 'hold')} active={control.held} disabled={controlBusy || Boolean(control.transfer)} icon={control.held ? Play : Pause} onClick={() => { void command('hold', !control.held); }} />}
            <Control label={t('dtmf')} active={showKeypad} disabled={controlBusy || Boolean(control?.held)} icon={Grid3X3} onClick={() => setShowKeypad(value => !value)} />
            {control?.supported && <Control label={tc('transfer')} active={showTransfer} disabled={controlBusy} icon={ArrowRightLeft} onClick={() => setShowTransfer(value => !value)} />}
          </div>}
          {connected && control?.held && <p role="status" className="rounded-lg bg-warning-subtle p-2 text-center text-xs text-warning-text">{tc(control.phase === 'consulting' ? 'consultHint' : 'held')} · {control.holdSeconds}s</p>}
          {showTransfer && control && <TransferPanel state={control} onClose={() => setShowTransfer(false)} onTransfer={(target, mode) => controlResult('transfer', { target, mode })} onConfirm={() => controlResult('confirm_transfer')} onCancel={() => controlResult('cancel_transfer')} />}
          {(!inCall || (showKeypad && connected)) && <PhoneDialPad diseno="kit" value={connected ? digits : number} onChange={connected ? setDigits : setNumber} dtmf={connected} entreNumeroYTeclas={!inCall && context.contact && <div className="flex items-center gap-2.5 rounded-[10px] bg-brand-tint px-2.5 py-2"><AvatarIniciales nombre={context.contact.name ?? context.contact.number} tamano="sm" className="bg-brand font-medium" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium leading-5">{context.contact.name ?? context.contact.number}</p><p className="text-xs font-medium leading-4 text-fg-secondary">{context.contact.company ?? context.contact.number}</p></div></div>} disabled={controlBusy || Boolean(control?.held) || (!connected && !canDial)} onDigit={digit => { void command('digits', digit).then(reply => { if (reply.ok && alive.current) setDigits(previous => previous + digit); }); }} onSubmit={() => { if (canDial && number.trim()) void command('dial', number.trim()); }} />}
          {connected && state.presentation?.canEditNote && <div className="space-y-2">
            <label htmlFor="mirror-note" className="flex items-center gap-2 text-xs font-medium leading-4 text-fg-secondary"><StickyNote size={14} strokeWidth={1.5} />{tv('liveNote')}</label>
            <Textarea id="mirror-note" value={note} maxLength={10000} rows={4} disabled={busy} className="min-h-[84px] border-line-strong text-[13px] leading-[18px]" onChange={event => setNote(event.target.value)} onBlur={() => { if (noteDirty) void command('note', note); }} />
            {noteDirty && <Button variant="ghost" className="h-7 px-0 text-xs text-link" disabled={busy} onClick={() => { void command('note', note); }}>{tv('saveNote')}</Button>}
          </div>}
          {inCall ? <Button variant="destructive" disabled={busy} className="h-11 w-full rounded-[10px] bg-danger text-sm font-medium" onClick={() => { void command('hangup'); }}><PhoneOff size={18} className="mr-2" strokeWidth={1.5} />{t('hangup')}</Button>
            : <Button disabled={busy || !canDial || !number.trim()} className="h-11 w-full rounded-[10px] bg-success text-sm font-medium hover:bg-success-text" onClick={() => { void command('dial', number.trim()); }}><Phone size={18} className="mr-2" strokeWidth={1.5} />{t('dial')}</Button>}
        </>}
        {state.missed && !inCall && <div className="rounded-lg border border-line bg-surface p-3 text-sm"><p className="font-medium">{t('missed')}</p><p className="truncate text-fg-secondary">{state.missed.displayName ?? state.missed.number}</p><div className="mt-2 flex gap-2">{(['callback', 'create_lead'] as const).map(action => <Button key={action} size="sm" variant="outline" disabled={busy} onClick={() => { const notice = state.missed; if (!notice) return; void window.goAdminPhone?.missedAction?.({ id: notice.id, scope: state.scope, action }).then(result => { if (!result.ok && alive.current) setError('estado_desactualizado'); }).catch(() => { if (alive.current) setError('accion_fallida'); }); }}>{t(action === 'callback' ? 'callback' : 'createLead')}</Button>)}</div></div>}
      </>}
    </div>
    {!inCall && !offline && <footer className="flex items-center gap-2 border-t border-line px-4 py-2.5"><div className="min-w-0 flex-1"><p className="text-xs font-medium leading-4 text-fg-secondary">{pb('callerId')}</p><p className="truncate text-xs font-medium leading-4 text-fg">{context.line?.e164 ?? pb('configuredLine')}</p></div><Button variant="ghost" size="icon" aria-label={t('openMain')} className="size-8 shrink-0 text-link" onClick={() => windowAction(window.goAdminPhone?.openMain)}><ExternalLink size={16} strokeWidth={1.5} /></Button></footer>}
  </main>;
}

function Control({ label, active, disabled, icon: Icon, onClick }: { label: string; active?: boolean; disabled?: boolean; icon: typeof Phone; onClick: () => void }) {
  return <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5"><Button variant="outline" size="icon" aria-label={label} aria-pressed={active} disabled={disabled} className={`size-12 rounded-full border-line ${active ? 'bg-brand-tint text-brand' : 'bg-subtle text-fg-secondary'}`} onClick={onClick}><Icon size={20} strokeWidth={1.5} /></Button><span className="max-w-full truncate text-xs font-medium leading-4 text-fg-secondary">{label}</span></div>;
}
