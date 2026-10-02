'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { ArrowRightLeft, ExternalLink, Mic, MicOff, Minus, Pause, Phone, PhoneOff, Pin, Play, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PhoneDialPad } from './PhoneDialPad';
import { TransferPanel } from '../dock/TransferPanel';
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

export function PhoneMirror() {
  const t = useTranslations('phoneMirror');
  const tc = useTranslations('phoneControl');
  const [state, setState] = useState<PhoneSnapshot | null>(null);
  const [number, setNumber] = useState(''); const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [pinned, setPinned] = useState(false); const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const bridge = window.goAdminPhone; if (!bridge) return;
    let mounted = true;
    const update = (raw: PhoneSnapshot | null) => {
      if (!mounted) return;
      try { const next = raw === null ? null : parsePhoneSnapshot(raw); setState(next); }
      catch { setState(null); }
    };
    let received = false;
    const unsubscribe = bridge.onState(raw => { received = true; update(raw); });
    void bridge.state().then(raw => { if (!received) update(raw); }).catch(() => { if (!received) update(null); });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  useEffect(() => { setNumber(''); setDigits(''); setError(null); setShowTransfer(false); }, [state?.scope]);
  useEffect(() => { if (state?.callStatus !== 'connected') setShowTransfer(false); }, [state?.callStatus]);
  useEffect(() => { setDigits(''); }, [state?.call?.number]);
  useEffect(() => {
    if (!state?.call?.connectedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.call?.connectedAt]);
  const command = async (action: PhoneAction, value?: string | boolean | PhoneTransferValue): Promise<PhoneReply> => {
    const bridge = window.goAdminPhone;
    if (!bridge || !state || pending.current) return { id: '', ok: false, error: 'accion_en_curso' };
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await bridge.command({ id: crypto.randomUUID(), scope: state.scope, revision: state.revision, action, ...(value === undefined ? {} : { value }) });
      if (!result.ok) setError(result.error ?? 'accion_fallida');
      return result;
    } catch { setError('accion_fallida'); return { id: '', ok: false, error: 'accion_fallida' }; }
    finally { pending.current = false; setBusy(false); }
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
  const seconds = state?.call?.connectedAt ? Math.max(0, Math.floor((now - state.call.connectedAt) / 1000)) : 0;
  const duration = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const name = state?.call?.displayName ?? state?.call?.number ?? '';
  const errorText = error ? errorCodes.includes(error) ? t(`errors.${error}`) : error : null;

  return <main className="flex min-h-dvh flex-col bg-background text-foreground" aria-label={t('title')}>
    <header style={drag} className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <Image src="/icon.svg" width={24} height={24} alt="GO Admin" />
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">GO Admin · {t('title')}</h1>
      <div style={noDrag} className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('pin')} aria-pressed={pinned}
          onClick={() => { void window.goAdminPhone?.pin(!pinned).then(setPinned); }}><Pin size={16} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('minimize')}
          onClick={() => { void window.goAdminPhone?.minimize(); }}><Minus size={16} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('close')}
          onClick={() => { void window.goAdminPhone?.close(); }}><X size={16} strokeWidth={1.5} /></Button>
      </div>
    </header>
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <span className={`h-1.5 w-1.5 rounded-full ${state?.deviceState === 'registered' ? 'bg-green-600' : 'bg-gray-400'}`} />
        {state ? t(`device.${state.deviceState}`) : t('disconnected')}
        {state?.recording && <Badge variant="destructive" className="ml-auto text-[10px]">REC</Badge>}
      </div>
      {(state?.reason || errorText) && <p role={errorText ? 'alert' : 'status'} className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{errorText ?? state?.reason}</p>}
      {!state && <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Phone size={40} strokeWidth={1.5} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('openAppHint')}</p>
      </div>}
      {state && <>
        {(inCall || state.incoming) && <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="h-16 w-16"><AvatarFallback className="bg-blue-600 text-xl text-white">{name.slice(0, 2).toUpperCase() || <Phone size={24} />}</AvatarFallback></Avatar>
          <h2 className="break-all text-lg font-semibold">{name}</h2>
          {state.call?.displayName && <p className="font-mono text-sm text-muted-foreground">{state.call.number}</p>}
          <p className="text-sm tabular-nums" role="status">{state.incoming ? t('incoming') : connected ? duration : t(`call.${state.callStatus}`)}</p>
        </div>}
        {state.incoming ? <div className="mt-auto flex gap-3">
          <Button disabled={busy} variant="destructive" className="h-12 flex-1" onClick={() => { void command('reject'); }}><PhoneOff size={18} className="mr-2" />{t('reject')}</Button>
          <Button disabled={busy} className="h-12 flex-1 bg-green-600 hover:bg-green-700" onClick={() => { void command('accept'); }}><Phone size={18} className="mr-2" />{t('answer')}</Button>
        </div> : <>
          {connected && <Button variant="outline" disabled={controlBusy || (control?.held && control.phase !== 'consulting')} aria-pressed={state.muted} onClick={() => { void command('mute', !state.muted); }}>
            {state.muted ? <MicOff size={18} className="mr-2" /> : <Mic size={18} className="mr-2" />}{t(state.muted ? 'unmute' : 'mute')}
          </Button>}
          {connected && control?.supported && <>
            {control.held && <p role="status" className="rounded-lg bg-warning-subtle p-2 text-center text-sm text-warning-text">{tc(control.phase === 'consulting' ? 'consultHint' : 'held')} · {control.holdSeconds}s</p>}
            <div className="flex gap-2"><Button variant="outline" className="flex-1" disabled={controlBusy || Boolean(control.transfer)} onClick={() => { void command('hold', !control.held); }}>
              {control.held ? <Play size={16} className="mr-2" /> : <Pause size={16} className="mr-2" />}{tc(control.held ? 'resume' : 'hold')}</Button>
              <Button variant="outline" className="flex-1" disabled={controlBusy} onClick={() => setShowTransfer(previous => !previous)}><ArrowRightLeft size={16} className="mr-2" />{tc('transfer')}</Button></div>
            {showTransfer && <TransferPanel state={control} onClose={() => setShowTransfer(false)} onTransfer={(target, mode) => controlResult('transfer', { target, mode })}
              onConfirm={() => controlResult('confirm_transfer')} onCancel={() => controlResult('cancel_transfer')} />}
          </>}
          <PhoneDialPad value={connected ? digits : number} onChange={connected ? setDigits : setNumber} dtmf={connected}
            disabled={controlBusy || Boolean(control?.held) || (!connected && !canDial)} onDigit={digit => { void command('digits', digit).then(reply => { if (reply.ok) setDigits(previous => previous + digit); }); }}
            onSubmit={() => { if (canDial && number.trim()) void command('dial', number.trim()); }} />
          {inCall ? <Button variant="destructive" disabled={busy} className="h-12 w-full" onClick={() => { void command('hangup'); }}><PhoneOff size={20} className="mr-2" />{t('hangup')}</Button>
            : <Button disabled={busy || !canDial || !number.trim()} className="h-12 w-full bg-green-600 hover:bg-green-700" onClick={() => { void command('dial', number.trim()); }}><Phone size={20} className="mr-2" />{t('dial')}</Button>}
        </>}
        {state.missed && !inCall && <div className="rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-medium">{t('missed')}</p><p className="truncate text-fg-muted">{state.missed.displayName ?? state.missed.number}</p>
          <div className="mt-2 flex gap-2">{(['callback', 'create_lead'] as const).map(action => <Button key={action} size="sm" variant="outline" disabled={busy} onClick={() => {
            const notice = state.missed; if (!notice) return;
            void window.goAdminPhone?.missedAction?.({ id: notice.id, scope: state.scope, action }).then(result => { if (!result.ok) setError('estado_desactualizado'); }).catch(() => setError('accion_fallida'));
          }}>{t(action === 'callback' ? 'callback' : 'createLead')}</Button>)}</div>
        </div>}
        {state.deviceState !== 'registered' && <Button variant="outline" disabled={busy || inCall} onClick={() => { void command('retry'); }}><RefreshCw size={16} className="mr-2" />{t('retry')}</Button>}
      </>}
    </div>
    <footer className="border-t px-6 py-3"><Button variant="ghost" className="w-full text-xs" onClick={() => { void window.goAdminPhone?.openMain(); }}><ExternalLink size={14} className="mr-2" />{t('openMain')}</Button></footer>
  </main>;
}
